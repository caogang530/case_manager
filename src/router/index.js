import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/libraries' },
    { path: '/libraries', name: 'libraries', component: () => import('../views/LibraryList.vue') },
    { path: '/libraries/:id', name: 'library-detail', component: () => import('../views/LibraryDetail.vue') },
    { path: '/plans', name: 'plans', component: () => import('../views/PlanList.vue') },
    { path: '/plans/:id', name: 'plan-detail', component: () => import('../views/PlanDetail.vue') },
  ],
})

export default router
