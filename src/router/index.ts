import { createRouter, createWebHistory } from 'vue-router'
import ChartPlaceholderView from '@/views/ChartPlaceholderView.vue'

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
      component: ChartPlaceholderView
    }
  ]
})

export default router
