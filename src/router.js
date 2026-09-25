import { createRouter, createWebHashHistory } from 'vue-router'
import Home from './views/Home.vue'
import Editor from './views/Editor.vue'

export default createRouter({
  history: createWebHashHistory(),
  scrollBehavior: () => ({ top: 0 }),
  routes: [
    { path: '/', name: 'home', component: Home },
    { path: '/editor', name: 'editor', component: Editor },
  ],
})
