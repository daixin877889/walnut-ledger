import { createRouter, createWebHistory } from 'vue-router'
import { currentSession } from '../core/session/current-session'
export const router = createRouter({ history: createWebHistory(), routes: [
  { path: '/categories', component: () => import('../features/entry/CategoriesPage.vue') },
  { path: '/ledgers', component: () => import('../features/ledgers/LedgersPage.vue') },
  { path: '/budgets', component: () => import('../features/budgets/BudgetPage.vue') },
  { path: '/export', component: () => import('../features/exports/ExportPage.vue') },
  { path: '/', redirect: '/bills' }, { path: '/bills', component: () => import('../features/bills/BillsPage.vue') }, { path: '/reports', component: () => import('../features/reports/ReportsPage.vue') }, { path: '/entry', component: () => import('../features/entry/EntryPage.vue') }, { path: '/accounts', component: () => import('../features/accounts/AccountsPage.vue') }, { path: '/me', component: () => import('../features/profile/ProfilePage.vue') }, { path: '/devices', component: () => import('../features/auth/DevicesPage.vue') },
  { path: '/login', component: () => import('../features/auth/LoginPage.vue') }, { path: '/register', component: () => import('../features/auth/RegisterPage.vue') },
] })
router.beforeEach(async to => {
  if (to.path === '/login' || to.path === '/register') return true
  return await currentSession.getAccessToken() || await currentSession.getRefreshToken() ? true : '/login'
})
