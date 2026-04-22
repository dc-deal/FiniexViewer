import { createRouter, createWebHistory } from 'vue-router'
import ViewerView from '@/views/ViewerView.vue'

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
      component: ViewerView
    }
  ]
})

export default router
