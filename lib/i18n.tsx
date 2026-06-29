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
