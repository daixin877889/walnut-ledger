import { createRouter, createWebHistory } from 'vue-router'
export const router = createRouter({ history: createWebHistory(), routes: [
  { path: '/', redirect: '/bills' }, { path: '/bills', component: () => import('../features/bills/BillsPage.vue') }, { path: '/reports', component: () => import('../features/reports/ReportsPage.vue') }, { path: '/entry', component: () => import('../features/entry/EntryPage.vue') }, { path: '/accounts', component: () => import('../features/accounts/AccountsPage.vue') }, { path: '/me', component: () => import('../features/profile/ProfilePage.vue') }, { path: '/devices', component: () => import('../features/auth/DevicesPage.vue') },
  { path: '/login', component: () => import('../features/auth/LoginPage.vue') }, { path: '/register', component: () => import('../features/auth/RegisterPage.vue') },
] })
