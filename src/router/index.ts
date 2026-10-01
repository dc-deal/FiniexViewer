import { createRouter, createWebHistory } from 'vue-router'

/**
 * Every view is loaded on demand.
 *
 * Statically imported, the whole application arrived in one file — 592 kB before this, and a
 * reader opening the run list paid for the charting library they had not asked for. A route
 * component is the natural seam: Vite gives each one its own chunk and the browser fetches it when
 * the route is entered.
 */
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/viewer'
    },
    {
      path: '/viewer',
      name: 'viewer',
      component: () => import('@/views/ChartView.vue')
    },
    {
      path: '/runs',
      name: 'runs',
      component: () => import('@/views/RunsView.vue')
    },
    {
      path: '/deployments',
      name: 'deployments',
      component: () => import('@/views/DeploymentsView.vue')
    },
    {
      path: '/about',
      name: 'about',
      component: () => import('@/views/AboutView.vue')
    }
  ]
})

export default router
