import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { i18n } from './i18n'
import { useAuth } from './stores/auth'
import './styles/base.css'

// After a new version goes live, a tab that was opened earlier still points at page files that no longer exist
// (the profile page then fails to open). Load the new version once instead of showing a broken page.
function reloadForNewVersion() {
  try {
    const last = Number(sessionStorage.getItem('qj_reload') ?? 0)
    if (Date.now() - last < 30_000) return
    sessionStorage.setItem('qj_reload', String(Date.now()))
  } catch { /* storage unavailable: reload once anyway */ }
  window.location.reload()
}
window.addEventListener('vite:preloadError', (e) => { e.preventDefault(); reloadForNewVersion() })

const app = createApp(App)
app.use(createPinia())
app.use(i18n)
document.documentElement.lang = i18n.global.locale.value
await useAuth().init()
router.onError((err) => { if (/dynamically imported module|Importing a module script failed|Loading chunk/i.test(String(err?.message ?? err))) reloadForNewVersion() })
app.use(router)
app.mount('#app')
