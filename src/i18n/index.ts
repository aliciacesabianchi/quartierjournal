import { createI18n } from 'vue-i18n'
import en from './en'
import de from './de'
import it from './it'
import fr from './fr'

export const LOCALES = ['de', 'en', 'it', 'fr'] as const
export type Locale = (typeof LOCALES)[number]
export const LOCALE_LABELS: Record<Locale, string> = { de: 'DE', en: 'EN', it: 'IT', fr: 'FR' }
// BCP-47 tags for Intl date/time formatting (Swiss variants)
export const INTL_LOCALE: Record<Locale, string> = { de: 'de-CH', en: 'en-GB', it: 'it-CH', fr: 'fr-CH' }

const STORAGE_KEY = 'qj_lang'

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && (LOCALES as readonly string[]).includes(saved)) return saved as Locale
  } catch { /* storage unavailable */ }
  const nav = (navigator.language || 'de').slice(0, 2)
  return (LOCALES as readonly string[]).includes(nav) ? (nav as Locale) : 'de'
}

export const i18n = createI18n({
  legacy: false,
  locale: initialLocale(),
  fallbackLocale: 'de',
  messages: { de, en, it, fr },
})

export function setLocale(l: Locale) {
  i18n.global.locale.value = l
  document.documentElement.lang = l
  try { localStorage.setItem(STORAGE_KEY, l) } catch { /* ignore */ }
}

export function currentLocale(): Locale {
  return i18n.global.locale.value as Locale
}
