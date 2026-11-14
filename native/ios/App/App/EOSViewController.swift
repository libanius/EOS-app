import Capacitor

/// Custom plugin registration is required in both the remote WebView and bundled fallback.
@objc(EOSViewController)
public class EOSViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(EOSLocalAIPlugin())
    }
}
