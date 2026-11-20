import { createRouter, createWebHistory } from 'vue-router'

const index = () => import('../views/ResourceIndex.vue')
const workspace = () => import('../views/EditorWorkspace.vue')

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/libraries' },
    { path: '/libraries', name: 'libraries', component: index, props: { mode: 'library' } },
    { path: '/libraries/:id', name: 'library-detail', component: workspace, props: { mode: 'library' } },
    { path: '/plans', name: 'plans', component: index, props: { mode: 'plan' } },
    { path: '/plans/:id', name: 'plan-detail', component: workspace, props: { mode: 'plan' } },
    { path: '/:pathMatch(.*)*', redirect: '/libraries' },
  ],
})
