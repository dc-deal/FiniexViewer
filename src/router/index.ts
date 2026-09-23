import { createRouter, createWebHistory } from 'vue-router'
import ChartView from '@/views/ChartView.vue'
import RunsView from '@/views/RunsView.vue'
import DeploymentsView from '@/views/DeploymentsView.vue'
import AboutView from '@/views/AboutView.vue'

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
      component: ChartView
    },
    {
      path: '/runs',
      name: 'runs',
      component: RunsView
    },
    {
      path: '/deployments',
      name: 'deployments',
      component: DeploymentsView
    },
    {
      path: '/about',
      name: 'about',
      component: AboutView
    }
  ]
})

export default router
