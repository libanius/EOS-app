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
