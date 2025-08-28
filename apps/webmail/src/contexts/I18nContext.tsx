import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

export type Locale = 'en' | 'es' | 'fr' | 'de' | 'ar' | 'he' | 'ja' | 'zh'

export interface LocaleConfig {
  code: Locale
  name: string
  direction: 'ltr' | 'rtl'
  timezone: string
}

const SUPPORTED_LOCALES: Record<Locale, LocaleConfig> = {
  en: { code: 'en', name: 'English', direction: 'ltr', timezone: 'UTC' },
  es: { code: 'es', name: 'Español', direction: 'ltr', timezone: 'UTC' },
  fr: { code: 'fr', name: 'Français', direction: 'ltr', timezone: 'UTC' },
  de: { code: 'de', name: 'Deutsch', direction: 'ltr', timezone: 'UTC' },
  ar: { code: 'ar', name: 'العربية', direction: 'rtl', timezone: 'UTC' },
  he: { code: 'he', name: 'עברית', direction: 'rtl', timezone: 'UTC' },
  ja: { code: 'ja', name: '日本語', direction: 'ltr', timezone: 'Asia/Tokyo' },
  zh: { code: 'zh', name: '中文', direction: 'ltr', timezone: 'Asia/Shanghai' },
}

// Basic translations - in production this would come from translation files
const TRANSLATIONS: Record<Locale, Record<string, string>> = {
  en: {
    'mail.inbox': 'Inbox',
    'mail.sent': 'Sent',
    'mail.drafts': 'Drafts',
    'mail.trash': 'Trash',
    'mail.compose': 'Compose',
    'mail.reply': 'Reply',
    'mail.forward': 'Forward',
    'mail.delete': 'Delete',
    'mail.archive': 'Archive',
    'mail.mark_read': 'Mark as Read',
    'mail.mark_unread': 'Mark as Unread',
    'mail.star': 'Star',
    'mail.unstar': 'Unstar',
    'auth.login': 'Sign In',
    'auth.logout': 'Sign Out',
    'auth.email': 'Email',
    'auth.password': 'Password',
    'quarantine.title': 'Quarantine',
    'quarantine.request_release': 'Request Release',
    'quarantine.admin_approval': 'Admin must approve releases',
    'notifications.new_mail': 'New Mail',
    'common.loading': 'Loading...',
    'common.error': 'Error',
    'common.success': 'Success',
    'common.cancel': 'Cancel',
    'common.save': 'Save',
  },
  es: {
    'mail.inbox': 'Bandeja de entrada',
    'mail.sent': 'Enviados',
    'mail.drafts': 'Borradores',
    'mail.trash': 'Papelera',
    'mail.compose': 'Redactar',
    'auth.login': 'Iniciar sesión',
    'auth.logout': 'Cerrar sesión',
    'common.loading': 'Cargando...',
    'common.error': 'Error',
    'common.success': 'Éxito',
  },
  fr: {
    'mail.inbox': 'Boîte de réception',
    'mail.sent': 'Envoyés',
    'mail.drafts': 'Brouillons',
    'mail.trash': 'Corbeille',
    'mail.compose': 'Composer',
    'auth.login': 'Se connecter',
    'auth.logout': 'Se déconnecter',
    'common.loading': 'Chargement...',
    'common.error': 'Erreur',
    'common.success': 'Succès',
  },
  de: {
    'mail.inbox': 'Posteingang',
    'mail.sent': 'Gesendet',
    'mail.drafts': 'Entwürfe',
    'mail.trash': 'Papierkorb',
    'mail.compose': 'Verfassen',
    'auth.login': 'Anmelden',
    'auth.logout': 'Abmelden',
    'common.loading': 'Wird geladen...',
    'common.error': 'Fehler',
    'common.success': 'Erfolg',
  },
  ar: {
    'mail.inbox': 'صندوق الوارد',
    'mail.sent': 'المرسل',
    'mail.drafts': 'المسودات',
    'mail.trash': 'المحذوفات',
    'mail.compose': 'إنشاء',
    'auth.login': 'تسجيل الدخول',
    'auth.logout': 'تسجيل الخروج',
    'common.loading': 'جار التحميل...',
    'common.error': 'خطأ',
    'common.success': 'نجح',
  },
  he: {
    'mail.inbox': 'תיבת דואר נכנס',
    'mail.sent': 'נשלח',
    'mail.drafts': 'טיוטות',
    'mail.trash': 'אשפה',
    'mail.compose': 'חבר',
    'auth.login': 'התחבר',
    'auth.logout': 'התנתק',
    'common.loading': 'טוען...',
    'common.error': 'שגיאה',
    'common.success': 'הצלחה',
  },
  ja: {
    'mail.inbox': '受信トレイ',
    'mail.sent': '送信済み',
    'mail.drafts': '下書き',
    'mail.trash': 'ゴミ箱',
    'mail.compose': '作成',
    'auth.login': 'ログイン',
    'auth.logout': 'ログアウト',
    'common.loading': '読み込み中...',
    'common.error': 'エラー',
    'common.success': '成功',
  },
  zh: {
    'mail.inbox': '收件箱',
    'mail.sent': '已发送',
    'mail.drafts': '草稿',
    'mail.trash': '垃圾箱',
    'mail.compose': '撰写',
    'auth.login': '登录',
    'auth.logout': '退出',
    'common.loading': '正在加载...',
    'common.error': '错误',
    'common.success': '成功',
  },
}

interface I18nContextType {
  locale: Locale
  localeConfig: LocaleConfig
  setLocale: (locale: Locale) => void
  t: (key: string, fallback?: string) => string
  formatDate: (date: string | Date) => string
  formatTime: (date: string | Date) => string
  formatNumber: (num: number) => string
}

const I18nContext = createContext<I18nContextType | undefined>(undefined)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(() => {
    // Get from localStorage or detect from browser
    const stored = localStorage.getItem('ceerion-locale') as Locale
    if (stored && SUPPORTED_LOCALES[stored]) {
      return stored
    }
    
    // Detect from browser language
    const browserLang = navigator.language.split('-')[0] as Locale
    return SUPPORTED_LOCALES[browserLang] ? browserLang : 'en'
  })

  const localeConfig = SUPPORTED_LOCALES[locale]

  const handleSetLocale = (newLocale: Locale) => {
    setLocale(newLocale)
    localStorage.setItem('ceerion-locale', newLocale)
    
    // Update document direction for RTL languages
    document.documentElement.dir = SUPPORTED_LOCALES[newLocale].direction
    document.documentElement.lang = newLocale
  }

  const t = (key: string, fallback?: string): string => {
    return TRANSLATIONS[locale]?.[key] || TRANSLATIONS.en[key] || fallback || key
  }

  const formatDate = (date: string | Date): string => {
    const d = new Date(date)
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: localeConfig.timezone
    }).format(d)
  }

  const formatTime = (date: string | Date): string => {
    const d = new Date(date)
    return new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: localeConfig.timezone
    }).format(d)
  }

  const formatNumber = (num: number): string => {
    return new Intl.NumberFormat(locale).format(num)
  }

  // Apply RTL/LTR to document on mount and locale change
  useEffect(() => {
    document.documentElement.dir = localeConfig.direction
    document.documentElement.lang = locale
  }, [locale, localeConfig.direction])

  const value = {
    locale,
    localeConfig,
    setLocale: handleSetLocale,
    t,
    formatDate,
    formatTime,
    formatNumber,
  }

  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n() {
  const context = useContext(I18nContext)
  if (context === undefined) {
    throw new Error('useI18n must be used within an I18nProvider')
  }
  return context
}

export { SUPPORTED_LOCALES }
