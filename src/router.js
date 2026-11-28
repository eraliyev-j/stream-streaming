import { createRouter, createWebHistory, createWebHashHistory } from 'vue-router'
import { session, refreshSession } from './store/session.js'

const routes = [
  { path: '/login', name: 'login', component: () => import('./views/LoginView.vue'), meta: { public: true } },
  { path: '/', name: 'dashboard', component: () => import('./views/DashboardView.vue') },
  { path: '/datasets', name: 'datasets', component: () => import('./views/DatasetsView.vue') },
  { path: '/datasets/:id', name: 'dataset', component: () => import('./views/DatasetDetailView.vue'), props: true },
  { path: '/explore', name: 'explore', component: () => import('./views/ExploreView.vue') },
  { path: '/upload', name: 'upload', component: () => import('./views/UploadView.vue') },
  { path: '/team', name: 'team', component: () => import('./views/TeamView.vue') },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  // Hash URLs in the standalone single-file build so it works from file://
  // eslint-disable-next-line no-undef
  history: typeof __HASH_ROUTER__ !== 'undefined' && __HASH_ROUTER__ ? createWebHashHistory() : createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

// Everyone must sign in before seeing or uploading data
router.beforeEach(async (to) => {
  if (!session.ready) await refreshSession()
  if (!to.meta.public && !session.profile) return { name: 'login', query: { next: to.fullPath } }
  if (to.name === 'login' && session.profile) return { name: 'dashboard' }
})

export default router
