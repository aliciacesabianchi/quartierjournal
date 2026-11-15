import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { design } from '@/i18n/design'
export function useDesign() { const { locale } = useI18n(); return computed(() => design[locale.value as keyof typeof design] || design.en) }
