import type { LocalStatus } from './runtime'

export function preparationFeedback(
  pt: boolean,
  status: LocalStatus | null,
  progress: number | null,
  issue: string | null,
) {
  if (progress !== null) {
    const percent = Math.round(progress * 100)
    return {
      title: percent >= 100
        ? (pt ? 'Finalizando a preparação…' : 'Finishing setup…')
        : percent > 0
          ? (pt ? `Preparando conversa offline · ${percent}%` : `Preparing offline chat · ${percent}%`)
          : (pt ? 'Iniciando preparação…' : 'Starting setup…'),
      next: pt ? 'Mantenha o EOS aberto até aparecer “Conversa offline pronta”.' : 'Keep EOS open until you see “Offline chat ready”.',
      tone: 'normal',
    }
  }
  if (issue || status?.state === 'error') {
    const cancelled = issue === 'local_cancelled'
    let next = pt
      ? 'Tente novamente com Wi-Fi e mantenha o EOS aberto. Enquanto isso, consulte a Biblioteca offline.'
      : 'Retry on Wi-Fi and keep EOS open. You can still search the Offline library.'
    if (issue === 'insufficient_storage') next = pt ? 'Libere espaço no aparelho e tente novamente.' : 'Free up storage on your device and retry.'
    if (issue === 'low_battery') next = pt ? 'Conecte o aparelho ao carregador e tente novamente.' : 'Plug in your device and retry.'
    if (issue === 'model_download_requires_connection') next = pt ? 'Conecte-se ao Wi-Fi para baixar o modelo.' : 'Connect to Wi-Fi to download the model.'
    if (issue === 'webgpu_unavailable') next = pt ? 'Tente abrir a prévia no Safari. Você ainda pode consultar a Biblioteca offline.' : 'Try opening the preview in Safari. You can still search the Offline library.'
    if (issue === 'local_runtime_missing') next = pt ? 'Reabra o EOS para tentar novamente ou consulte a Biblioteca offline.' : 'Reopen EOS to retry, or search the Offline library.'
    return {
      title: cancelled
        ? (pt ? 'Preparação interrompida' : 'Setup interrupted')
        : (pt ? 'Preparação não concluída' : 'Setup did not finish'),
      next,
      tone: 'warning',
    }
  }
  if (status?.state === 'ready') return {
    title: pt ? 'Conversa offline pronta' : 'Offline chat ready',
    next: pt ? 'Digite sua pergunta abaixo. Para testar sem internet, ative o modo avião e desligue o Wi-Fi.' : 'Type your question below. To test offline, turn on Airplane Mode and switch off Wi-Fi.',
    tone: 'ready',
  }
  if (status?.state === 'unsupported') return {
    title: pt ? 'Conversa offline indisponível aqui' : 'Offline chat unavailable here',
    next: status.reason === 'appleIntelligenceNotEnabled'
      ? (pt ? 'Ative Apple Intelligence nos Ajustes do iPhone e reabra o EOS.' : 'Enable Apple Intelligence in iPhone Settings and reopen EOS.')
      : (pt ? 'Consulte os textos na Biblioteca offline.' : 'Search your saved texts in the Offline library.'),
    tone: 'warning',
  }
  if (status?.state === 'cached') return {
    title: status.provider === 'apple'
      ? (pt ? 'Modelo do iPhone disponível' : 'iPhone model available')
      : (pt ? 'Arquivos do modelo encontrados' : 'Model files found'),
    next: pt ? 'Toque no botão abaixo para carregar o modelo.' : 'Use the button below to load the model.',
    tone: 'normal',
  }
  if (status?.state === 'needs_download') return {
    title: pt ? 'Conversa offline ainda não preparada' : 'Offline chat needs setup',
    next: pt ? 'Toque abaixo para preparar. Download opcional de cerca de 1 GB. Prefira Wi-Fi.' : 'Tap below to prepare. Optional download of about 1 GB. Use Wi-Fi if possible.',
    tone: 'normal',
  }
  return {
    title: pt ? 'Verificando conversa offline…' : 'Checking offline chat…',
    next: '',
    tone: 'normal',
  }
}
