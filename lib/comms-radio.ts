export type FrequencyRow = {
  channel: string
  name: string
  frequency: string
  use: string
  why: string[]
}

export type RadioReferenceGroup = {
  title: string
  body: string
  lines: string[]
}

export type RadioLanguageConfig = {
  family: {
    vhf: FrequencyRow[]
    uhf: FrequencyRow[]
  }
  national: RadioReferenceGroup[]
  quickSteps: string[]
  otherOptions: string[]
  legalBody: string
}

export type RadioConfig = {
  pt: RadioLanguageConfig
  en: RadioLanguageConfig
}

const DEFAULT_LEGAL_PT = 'Transmissão em faixas VHF/UHF de radioamador nos EUA exige licença apropriada em operação normal. Ouvir é permitido. Em risco imediato, priorize 911/autoridades quando disponíveis e confirme regras FCC/locais antes de transmitir.'
const DEFAULT_LEGAL_EN = 'Transmitting on amateur VHF/UHF bands in the US requires the appropriate license during normal operation. Listening is allowed. In immediate danger, prioritize 911/authorities when available and verify FCC/local rules before transmitting.'

export const DEFAULT_RADIO_CONFIG: RadioConfig = {
  pt: {
    family: {
      vhf: [
        { channel: '1', name: 'VHF-A · principal', frequency: '145.500', use: 'Família principal', why: ['Baixo tráfego', 'Comunicação privada', 'Boa para longas distâncias'] },
        { channel: '2', name: 'VHF-B · secundário', frequency: '146.550', use: 'Fallback backup', why: ['Frequência simplex tranquila', 'Boa alternativa se A estiver ocupada'] },
        { channel: '3', name: 'VHF-C · emergência', frequency: '146.520', use: 'Contato externo', why: ['Chamada nacional', 'Muito monitorada por radioamadores', 'Use para pedir ajuda'] },
      ],
      uhf: [
        { channel: '4', name: 'UHF-A · principal', frequency: '446.100', use: 'Local / bairro', why: ['Boa penetração urbana', 'Menos interferência'] },
        { channel: '5', name: 'UHF-B · secundário', frequency: '446.050', use: 'Fallback local', why: ['Simplex limpa', 'Backup se A estiver ocupada'] },
        { channel: '6', name: 'UHF-C · geral', frequency: '446.000', use: 'Geral / simplex', why: ['Simplex universal', 'Muitos rádios monitoram'] },
      ],
    },
    national: [
      { title: 'NOAA Weather Radio', body: 'Alertas oficiais de furacões, tornados, tempestades severas, inundações, calor extremo e emergências civis.', lines: ['162.400', '162.425', '162.450', '162.475', '162.500', '162.525', '162.550'] },
      { title: 'Radioamador nacional', body: 'Frequências muito monitoradas por radioamadores.', lines: ['146.520 MHz · chamada nacional VHF', '446.000 MHz · chamada nacional UHF'] },
      { title: 'Marítima · ouvir costa/águas', body: 'Use apenas quando aplicável e conforme licença/regra local.', lines: ['156.800 MHz · Canal 16'] },
      { title: 'Serviços de emergência · ouvir', body: 'Não transmita em frequências oficiais.', lines: ['Polícia FL · 155.340 MHz', 'Fire/EMS · 155.160 MHz', 'SAR/Resgate aéreo · 121.500 MHz', 'Guarda Costeira · 161.975 MHz'] },
    ],
    quickSteps: [
      'Ligar/desligar: gire o knob de volume.',
      'Selecionar canal: use setas para trocar canais salvos.',
      'Transmitir: segure PTT, fale curto e solte para ouvir.',
      'Modo/banda: BAND alterna VHF e UHF.',
      'Volume: ajuste para nível audível e confortável.',
      'Monitor/squelch: use MONI para abrir o squelch e ouvir sinais fracos.',
      'Scan: pressione SCAN para varrer canais; pressione novamente para parar.',
      'Lanterna/teclado: segure a tecla da lanterna; use lock quando necessário.',
    ],
    otherOptions: [
      'MURS: 151.820, 151.880, 151.940, 154.570, 154.600 MHz',
      'GMRS: 462.550, 462.5625, 462.675, 462.725, 467.550 MHz',
      'FRS: canais 1-14, 462/467 MHz, baixa potência',
    ],
    legalBody: DEFAULT_LEGAL_PT,
  },
  en: {
    family: {
      vhf: [
        { channel: '1', name: 'VHF-A · primary', frequency: '145.500', use: 'Main family', why: ['Low traffic', 'Private coordination', 'Useful over longer distances'] },
        { channel: '2', name: 'VHF-B · secondary', frequency: '146.550', use: 'Fallback backup', why: ['Quiet simplex frequency', 'Alternative if A is busy'] },
        { channel: '3', name: 'VHF-C · emergency', frequency: '146.520', use: 'External contact', why: ['National calling frequency', 'Often monitored by amateur operators', 'Use to request help'] },
      ],
      uhf: [
        { channel: '4', name: 'UHF-A · primary', frequency: '446.100', use: 'Local / neighborhood', why: ['Good urban penetration', 'Less interference'] },
        { channel: '5', name: 'UHF-B · secondary', frequency: '446.050', use: 'Local fallback', why: ['Clean simplex', 'Backup if A is busy'] },
        { channel: '6', name: 'UHF-C · general', frequency: '446.000', use: 'General / simplex', why: ['Universal simplex', 'Many radios monitor'] },
      ],
    },
    national: [
      { title: 'NOAA Weather Radio', body: 'Official alerts for hurricanes, tornadoes, severe storms, floods, extreme heat, and civil emergencies.', lines: ['162.400', '162.425', '162.450', '162.475', '162.500', '162.525', '162.550'] },
      { title: 'National amateur radio', body: 'Commonly monitored amateur radio frequencies.', lines: ['146.520 MHz · VHF national calling', '446.000 MHz · UHF national calling'] },
      { title: 'Marine · listen coast/water', body: 'Use only when applicable and under the right license/local rule.', lines: ['156.800 MHz · Channel 16'] },
      { title: 'Emergency services · listen', body: 'Do not transmit on official frequencies.', lines: ['Police FL · 155.340 MHz', 'Fire/EMS · 155.160 MHz', 'SAR/air rescue · 121.500 MHz', 'Coast Guard · 161.975 MHz'] },
    ],
    quickSteps: [
      'Power: turn the volume knob.',
      'Select channel: use arrows to move through saved channels.',
      'Transmit: hold PTT, speak briefly, release to listen.',
      'Mode/band: BAND switches VHF and UHF.',
      'Volume: set a clear and comfortable level.',
      'Monitor/squelch: use MONI to open squelch and hear weak signals.',
      'Scan: press SCAN to sweep channels; press again to stop.',
      'Light/keypad: hold the flashlight key; lock when needed.',
    ],
    otherOptions: [
      'MURS: 151.820, 151.880, 151.940, 154.570, 154.600 MHz',
      'GMRS: 462.550, 462.5625, 462.675, 462.725, 467.550 MHz',
      'FRS: channels 1-14, 462/467 MHz, low power',
    ],
    legalBody: DEFAULT_LEGAL_EN,
  },
}

function cleanText(value: unknown, fallback: string, max = 300) {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, max) : fallback
}

function cleanLines(value: unknown, fallback: string[], maxLines = 10, maxChars = 160) {
  if (!Array.isArray(value)) return fallback
  const lines = value
    .filter((line): line is string => typeof line === 'string')
    .map(line => line.trim().slice(0, maxChars))
    .filter(Boolean)
    .slice(0, maxLines)
  return lines.length ? lines : fallback
}

function normalizeFrequencyRows(value: unknown, fallback: FrequencyRow[]) {
  if (!Array.isArray(value)) return fallback
  return fallback.map((row, index) => {
    const incoming = value[index] as Partial<FrequencyRow> | undefined
    return {
      channel: cleanText(incoming?.channel, row.channel, 12),
      name: cleanText(incoming?.name, row.name, 80),
      frequency: cleanText(incoming?.frequency, row.frequency, 40),
      use: cleanText(incoming?.use, row.use, 80),
      why: cleanLines(incoming?.why, row.why, 5, 120),
    }
  })
}

function normalizeGroups(value: unknown, fallback: RadioReferenceGroup[]) {
  if (!Array.isArray(value)) return fallback
  return fallback.map((group, index) => {
    const incoming = value[index] as Partial<RadioReferenceGroup> | undefined
    return {
      title: cleanText(incoming?.title, group.title, 80),
      body: cleanText(incoming?.body, group.body, 260),
      lines: cleanLines(incoming?.lines, group.lines, 12, 120),
    }
  })
}

function normalizeLanguageConfig(value: unknown, fallback: RadioLanguageConfig): RadioLanguageConfig {
  const incoming = (value && typeof value === 'object') ? value as Partial<RadioLanguageConfig> : {}
  return {
    family: {
      vhf: normalizeFrequencyRows(incoming.family?.vhf, fallback.family.vhf),
      uhf: normalizeFrequencyRows(incoming.family?.uhf, fallback.family.uhf),
    },
    national: normalizeGroups(incoming.national, fallback.national),
    quickSteps: cleanLines(incoming.quickSteps, fallback.quickSteps, 12, 180),
    otherOptions: cleanLines(incoming.otherOptions, fallback.otherOptions, 10, 180),
    legalBody: cleanText(incoming.legalBody, fallback.legalBody, 1200),
  }
}

export function cloneDefaultRadioConfig(): RadioConfig {
  return JSON.parse(JSON.stringify(DEFAULT_RADIO_CONFIG)) as RadioConfig
}

export function normalizeRadioConfig(value: unknown): RadioConfig {
  const incoming = (value && typeof value === 'object') ? value as Partial<RadioConfig> : {}
  return {
    pt: normalizeLanguageConfig(incoming.pt, DEFAULT_RADIO_CONFIG.pt),
    en: normalizeLanguageConfig(incoming.en, DEFAULT_RADIO_CONFIG.en),
  }
}
