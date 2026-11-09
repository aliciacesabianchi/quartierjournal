import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { i18n } from './i18n'
import { useAuth } from './stores/auth'
import './styles/base.css'

const app = createApp(App)
app.use(createPinia())
app.use(i18n)
document.documentElement.lang = i18n.global.locale.value
await useAuth().init()
app.use(router)
app.mount('#app')
