import Capacitor
import UIKit
#if canImport(FoundationModels)
import FoundationModels

@available(iOS 26.0, *)
@Generable
private struct EOSLocalAnswer {
    @Guide(description: "Brief source-grounded explanation and practical next steps in the requested language")
    var answer: String
    @Guide(description: "Only IDs of supplied references that support the answer")
    var sourceIds: [String]
    @Guide(description: "One clarification if needed, otherwise empty string")
    var question: String
}
#endif

/// No URLSession, network calls, cloud API, tools or writes. The model receives local excerpts only.
@objc(EOSLocalAIPlugin)
public class EOSLocalAIPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "EOSLocalAIPlugin"
    public let jsName = "EOSLocalAI"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "generate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise)
    ]
    private var generationTask: Task<Void, Never>?

    @objc func status(_ call: CAPPluginCall) {
        Task { @MainActor in
            #if canImport(FoundationModels)
            if #available(iOS 26.0, *) {
                switch SystemLanguageModel.default.availability {
                case .available:
                    call.resolve(["available": true, "reason": ""])
                case .unavailable(let reason):
                    call.resolve(["available": false, "reason": String(describing: reason)])
                }
                return
            }
            #endif
            call.resolve(["available": false, "reason": "requires_ios26_and_foundation_models"])
        }
    }

    @objc func generate(_ call: CAPPluginCall) {
        guard let instructions = call.getString("instructions"),
              let prompt = call.getString("prompt"),
              instructions.count + prompt.count <= 8500 else {
            call.reject("Local context invalid", "context_limit")
            return
        }
        Task { @MainActor in
            // Serial generation: no unrelated request can silently replace an active answer.
            guard self.generationTask == nil else { call.reject("Local model busy", "local_busy"); return }
            UIDevice.current.isBatteryMonitoringEnabled = true
            let battery = UIDevice.current.batteryLevel
            let charging = UIDevice.current.batteryState == .charging || UIDevice.current.batteryState == .full
            guard battery < 0 || battery >= 0.15 || charging else { call.reject("Battery low", "low_battery"); return }
            #if canImport(FoundationModels)
            if #available(iOS 26.0, *) {
                guard case .available = SystemLanguageModel.default.availability else {
                    call.reject("On-device model unavailable", "model_unavailable"); return
                }
                self.generationTask = Task { @MainActor in
                    defer { self.generationTask = nil }
                    do {
                        // A fresh bounded session per turn avoids stale model state. Prior turns are data in prompt.
                        let session = LanguageModelSession(instructions: instructions)
                        let response = try await session.respond(to: prompt, generating: EOSLocalAnswer.self,
                                                                 options: GenerationOptions(temperature: 0.2, maximumResponseTokens: 600))
                        try Task.checkCancellation()
                        call.resolve(["answer": response.content.answer,
                                      "sourceIds": response.content.sourceIds,
                                      "question": response.content.question])
                    } catch is CancellationError {
                        call.reject("Cancelled", "local_cancelled")
                    } catch {
                        // No prompt or private household text is logged or returned in errors.
                        call.reject("On-device generation failed; use saved references", "local_generation_failed")
                    }
                }
                return
            }
            #endif
            call.reject("Requires iOS 26 and an available on-device model", "model_unavailable")
        }
    }

    @objc func cancel(_ call: CAPPluginCall) {
        Task { @MainActor in
            self.generationTask?.cancel()
            call.resolve()
        }
    }
}
