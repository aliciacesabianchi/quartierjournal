import { createRouter, createWebHistory } from 'vue-router'
import { useAuth } from './stores/auth'

export const router = createRouter({
  history: createWebHistory(),
  scrollBehavior: (to, _from, saved) => saved ?? (to.hash ? { el: to.hash } : { top: 0 }),
  routes: [
    { path: '/', name: 'home', component: () => import('./views/HomeView.vue') },
    { path: '/entdecken', name: 'discover', component: () => import('./views/DiscoverView.vue') },
    { path: '/orte', name: 'places', component: () => import('./views/PlacesView.vue') },
    { path: '/a/:id', name: 'activity', component: () => import('./views/ActivityView.vue'), props: true },
    { path: '/woche', name: 'week', component: () => import('./views/WeekView.vue'), meta: { auth: true } },
    { path: '/freunde', name: 'friends', component: () => import('./views/FriendsView.vue'), meta: { auth: true } },
    { path: '/einladung/:kind(freund|event)/:token', name: 'invite', component: () => import('./views/InviteView.vue'), meta: { auth: true }, props: true },
    { path: '/profil', name: 'profile', component: () => import('./views/ProfileView.vue'), meta: { auth: true } },
    { path: '/so-funktionierts', name: 'how', component: () => import('./views/HowView.vue') },
    { path: '/ueber', name: 'about', component: () => import('./views/AboutView.vue') },
    { path: '/kontakt', name: 'contact', component: () => import('./views/ContactView.vue') },
    { path: '/tipp', name: 'suggest', component: () => import('./views/SuggestView.vue') },
    { path: '/admin', name: 'admin', component: () => import('./views/AdminView.vue'), meta: { auth: true } },
    { path: '/login', name: 'login', component: () => import('./views/AuthView.vue') },
    { path: '/passwort', name: 'password', component: () => import('./views/PasswordView.vue') },
    { path: '/datenschutz', name: 'privacy', component: () => import('./views/PrivacyView.vue') },
    { path: '/:rest(.*)*', name: 'notfound', component: () => import('./views/NotFoundView.vue') },
  ],
})

router.beforeEach((to) => {
  const auth = useAuth()
  if (auth.passwordRecovery && to.name !== 'password') return { name: 'password' }
  if (to.meta.auth && !auth.loggedIn) return { name: 'login', query: { next: to.fullPath } }
})
