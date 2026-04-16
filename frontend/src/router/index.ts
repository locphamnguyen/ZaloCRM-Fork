import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/LoginView.vue'),
    meta: { layout: 'auth' },
  },
  {
    path: '/setup',
    name: 'Setup',
    component: () => import('@/views/SetupView.vue'),
    meta: { layout: 'auth' },
  },
  {
    path: '/',
    name: 'Dashboard',
    component: () => import('@/views/DashboardView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/chat',
    name: 'Chat',
    component: () => import('@/views/ChatView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/contacts',
    name: 'Contacts',
    component: () => import('@/views/ContactsView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/zalo-accounts',
    name: 'ZaloAccounts',
    component: () => import('@/views/ZaloAccountsView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/appointments',
    name: 'Appointments',
    component: () => import('@/views/AppointmentsView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/reports',
    name: 'Reports',
    component: () => import('@/views/ReportsView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/analytics',
    name: 'Analytics',
    component: () => import('@/views/AnalyticsView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('@/views/SettingsView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/api-settings',
    name: 'ApiSettings',
    component: () => import('@/views/ApiSettingsView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/integrations',
    name: 'Integrations',
    component: () => import('@/views/IntegrationsView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/automation',
    name: 'Automation',
    component: () => import('@/views/AutomationView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/groups',
    name: 'Groups',
    component: () => import('@/views/GroupsView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/friends',
    name: 'Friends',
    component: () => import('@/views/FriendsView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('@/views/NotFoundView.vue'),
  },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

// Auth guard
router.beforeEach(async (to, _from, next) => {
  const authStore = useAuthStore();

  // Skip guard for setup and login pages
  if (to.name === 'Setup' || to.name === 'Login') {
    return next();
  }

  // Check auth for protected routes
  if (to.meta.requiresAuth) {
    if (!authStore.token) {
      return next('/login');
    }
    // Fetch profile if not loaded yet
    if (!authStore.user) {
      await authStore.init();
      if (!authStore.isAuthenticated) {
        return next('/login');
      }
    }
  }

  next();
});
