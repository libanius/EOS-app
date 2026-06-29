'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type Language = 'pt' | 'en'

const STORAGE_KEY = 'eos-language'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365

const messages = {
  pt: {
    'nav.scenario': 'Cenário',
    'nav.family': 'Família',
    'nav.inventory': 'Recursos',
    'nav.checklist': 'Checklist',
    'nav.circles': 'Círculos',
    'nav.main': 'Navegação principal',
    'actions.emergencyCard': 'Minha Ficha de Emergência',
    'actions.settings': 'Configurações',
    'settings.eyebrow': 'EOS · Preferências',
    'settings.title': 'Configurações',
    'settings.description': 'Escolha como o EOS deve apresentar a interface neste dispositivo.',
    'settings.language': 'Idioma',
    'settings.languageHelp': 'A alteração é aplicada imediatamente e fica salva neste dispositivo.',
    'settings.portuguese': 'Português',
    'settings.english': 'English',
    'settings.selected': 'Selecionado',
    'common.add': 'Adicionar',
    'common.saved': 'salvo',
    'common.saveError': 'Erro ao salvar.',
    'onboarding.nameRequired': 'Informe seu nome.',
    'onboarding.saveError': 'Erro ao salvar perfil.',
    'onboarding.title': 'Configure seu perfil',
    'onboarding.subtitle': 'Seus dados ficam salvos localmente.',
    'onboarding.identification': 'Identificação',
    'onboarding.name': 'Nome',
    'onboarding.namePlaceholder': 'Seu nome completo',
    'onboarding.location': 'Localização',
    'onboarding.locationPlaceholder': 'Cidade, Estado',
    'onboarding.locationHint': 'Usada para alertas e rotas de evacuação',
    'onboarding.family': 'Família',
    'onboarding.members': 'Membros na família',
    'onboarding.membersHint': 'Incluindo você',
    'onboarding.people': 'pessoas',
    'onboarding.saving': 'Salvando…',
    'onboarding.continue': 'Continuar →',
    'onboarding.footer': 'Seus dados ficam locais. Sempre.',
    'card.loading': 'Carregando ficha…',
    'card.identification': 'Identificação',
    'card.title': 'Minha Ficha',
    'card.subtitle': 'Visível para socorristas ao escanear o QR',
    'card.qrTitle': 'QR de Emergência',
    'card.qrHint': 'Qualquer pessoa pode escanear com a câmera do celular — sem precisar do app.',
    'card.bloodType': 'Tipo Sanguíneo',
    'card.allergies': 'Alergias',
    'card.allergiesPlaceholder': 'Ex: Penicilina, Amendoim, Látex…',
    'card.medicalConditions': 'Condições Médicas',
    'card.medicalPlaceholder': 'Ex: Diabetes tipo 2, hipertensão controlada, epilepsia…',
    'card.medications': 'Medicamentos de Uso Contínuo',
    'card.medicationsPlaceholder': 'Ex: Metformina 500mg, Insulina NPH…',
    'card.emergencyContact': 'Contato de Emergência',
    'card.contactName': 'Nome',
    'card.contactNamePlaceholder': 'Nome completo',
    'card.contactPhone': 'Telefone',
    'master.eyebrow': 'Identidade central',
    'master.title': 'Ficha Master',
    'master.subtitle': 'Seus dados pessoais, médicos e de emergência em um único lugar.',
    'master.completion': 'Completude da ficha',
    'master.complete': 'Completa',
    'master.identity': 'Identidade e localização',
    'master.name': 'Nome completo',
    'master.location': 'Localização principal',
    'master.locationPlaceholder': 'Cidade, Estado',
    'master.progressHint': 'Complete sua ficha para personalizar análises, checklists e o QR de emergência.',
    'common.loading': 'carregando…',
    'common.error': 'Erro',
    'checklist.eyebrow': 'EOS · Preparação',
    'checklist.loadError': 'Falha ao carregar',
    'checklist.generateError': 'Falha ao gerar',
    'checklist.unknownError': 'Erro desconhecido',
    'checklist.general': 'Geral',
    'checklist.hurricane': 'Furacão',
    'checklist.earthquake': 'Terremoto',
    'checklist.pandemic': 'Pandemia',
    'checklist.fire': 'Incêndio',
    'checklist.flood': 'Enchente',
    'checklist.fallout': 'Contaminação radioativa',
    'checklist.generating': 'Gerando…',
    'checklist.generate': 'Gerar checklist',
    'checklist.dedupe': 'Itens repetidos entre cenários são consolidados automaticamente.',
    'checklist.autonomy': 'dias de autonomia',
    'checklist.all': 'Todos',
    'checklist.essential': 'Essencial',
    'checklist.moderate': 'Moderado',
    'checklist.excellent': 'Excelente',
    'checklist.empty': 'Nenhum item — clique em “Gerar checklist”.',
    'checklist.shared': 'compartilhado',
    'circles.eyebrow': 'EOS · Social',
    'circles.title': 'Círculos',
    'circles.loadError': 'Falha ao carregar',
    'circles.create': 'Criar círculo',
    'circles.namePlaceholder': 'Ex: Família Libânio',
    'circles.createAction': 'Criar',
    'circles.join': 'Entrar com código',
    'circles.joinAction': 'Entrar',
    'circles.empty': 'Você ainda não faz parte de nenhum círculo.',
    'circles.leaveConfirm': 'Sair deste círculo?',
    'circles.leave': 'Sair',
    'circles.invite': 'convite',
    'circles.members': 'membros',
    'circles.days': 'dias',
    'circles.kits': 'kits',
    'circles.comms': 'comunicação',
    'circles.shareInventory': 'Compartilhar meu inventário neste círculo',
  },
  en: {
    'nav.scenario': 'Scenario',
    'nav.family': 'Family',
    'nav.inventory': 'Resources',
    'nav.checklist': 'Checklist',
    'nav.circles': 'Circles',
    'nav.main': 'Main navigation',
    'actions.emergencyCard': 'My Emergency Card',
    'actions.settings': 'Settings',
    'settings.eyebrow': 'EOS · Preferences',
    'settings.title': 'Settings',
    'settings.description': 'Choose how EOS should display the interface on this device.',
    'settings.language': 'Language',
    'settings.languageHelp': 'The change applies immediately and is saved on this device.',
    'settings.portuguese': 'Português',
    'settings.english': 'English',
    'settings.selected': 'Selected',
    'common.add': 'Add',
    'common.saved': 'saved',
    'common.saveError': 'Could not save.',
    'onboarding.nameRequired': 'Enter your name.',
    'onboarding.saveError': 'Could not save your profile.',
    'onboarding.title': 'Set up your profile',
    'onboarding.subtitle': 'Your data is stored locally.',
    'onboarding.identification': 'Identification',
    'onboarding.name': 'Name',
    'onboarding.namePlaceholder': 'Your full name',
    'onboarding.location': 'Location',
    'onboarding.locationPlaceholder': 'City, State',
    'onboarding.locationHint': 'Used for alerts and evacuation routes',
    'onboarding.family': 'Family',
    'onboarding.members': 'Family members',
    'onboarding.membersHint': 'Including you',
    'onboarding.people': 'people',
    'onboarding.saving': 'Saving…',
    'onboarding.continue': 'Continue →',
    'onboarding.footer': 'Your data stays local. Always.',
    'card.loading': 'Loading emergency card…',
    'card.identification': 'Identification',
    'card.title': 'My Emergency Card',
    'card.subtitle': 'Visible to responders when they scan the QR code',
    'card.qrTitle': 'Emergency QR',
    'card.qrHint': 'Anyone can scan it with a phone camera — no app required.',
    'card.bloodType': 'Blood Type',
    'card.allergies': 'Allergies',
    'card.allergiesPlaceholder': 'E.g. Penicillin, peanuts, latex…',
    'card.medicalConditions': 'Medical Conditions',
    'card.medicalPlaceholder': 'E.g. Type 2 diabetes, controlled hypertension, epilepsy…',
    'card.medications': 'Regular Medications',
    'card.medicationsPlaceholder': 'E.g. Metformin 500mg, NPH insulin…',
    'card.emergencyContact': 'Emergency Contact',
    'card.contactName': 'Name',
    'card.contactNamePlaceholder': 'Full name',
    'card.contactPhone': 'Phone',
    'master.eyebrow': 'Central identity',
    'master.title': 'Master Profile',
    'master.subtitle': 'Your personal, medical, and emergency information in one place.',
    'master.completion': 'Profile completion',
    'master.complete': 'Complete',
    'master.identity': 'Identity and location',
    'master.name': 'Full name',
    'master.location': 'Primary location',
    'master.locationPlaceholder': 'City, State',
    'master.progressHint': 'Complete your profile to personalize analyses, checklists, and your emergency QR.',
    'common.loading': 'loading…',
    'common.error': 'Error',
    'checklist.eyebrow': 'EOS · Preparedness',
    'checklist.loadError': 'Could not load',
    'checklist.generateError': 'Could not generate',
    'checklist.unknownError': 'Unknown error',
    'checklist.general': 'General',
    'checklist.hurricane': 'Hurricane',
    'checklist.earthquake': 'Earthquake',
    'checklist.pandemic': 'Pandemic',
    'checklist.fire': 'Fire',
    'checklist.flood': 'Flood',
    'checklist.fallout': 'Fallout',
    'checklist.generating': 'Generating…',
    'checklist.generate': 'Generate checklist',
    'checklist.dedupe': 'Duplicate items across scenarios are consolidated automatically.',
    'checklist.autonomy': 'days of autonomy',
    'checklist.all': 'All',
    'checklist.essential': 'Essential',
    'checklist.moderate': 'Moderate',
    'checklist.excellent': 'Excellent',
    'checklist.empty': 'No items — click “Generate checklist”.',
    'checklist.shared': 'shared',
    'circles.eyebrow': 'EOS · Social',
    'circles.title': 'Circles',
    'circles.loadError': 'Could not load',
    'circles.create': 'Create circle',
    'circles.namePlaceholder': 'E.g. Libânio Family',
    'circles.createAction': 'Create',
    'circles.join': 'Join with code',
    'circles.joinAction': 'Join',
    'circles.empty': 'You are not part of a circle yet.',
    'circles.leaveConfirm': 'Leave this circle?',
    'circles.leave': 'Leave',
    'circles.invite': 'invite',
    'circles.members': 'members',
    'circles.days': 'days',
    'circles.kits': 'kits',
    'circles.comms': 'comms',
    'circles.shareInventory': 'Share my inventory in this circle',
  },
} as const

export type MessageKey = keyof (typeof messages)['pt']

type LanguageContextValue = {
  language: Language
  setLanguage: (language: Language) => void
  t: (key: MessageKey) => string
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

function isLanguage(value: string | null): value is Language {
  return value === 'pt' || value === 'en'
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>('pt')

  useEffect(() => {
    const savedLanguage = window.localStorage.getItem(STORAGE_KEY)
    if (isLanguage(savedLanguage)) {
      setLanguageState(savedLanguage)
      document.documentElement.lang = savedLanguage === 'pt' ? 'pt-BR' : 'en'
    }
  }, [])

  const setLanguage = useCallback((nextLanguage: Language) => {
    setLanguageState(nextLanguage)
    window.localStorage.setItem(STORAGE_KEY, nextLanguage)
    document.cookie = `${STORAGE_KEY}=${nextLanguage}; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax`
    document.documentElement.lang = nextLanguage === 'pt' ? 'pt-BR' : 'en'
  }, [])

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage,
      t: (key) => messages[language][key],
    }),
    [language, setLanguage],
  )

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider')
  }
  return context
}
