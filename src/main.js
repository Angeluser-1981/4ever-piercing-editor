import { createApp } from 'vue'
import VueKonva from 'vue-konva'
import App from './App.vue'
import router from './router.js'
import './styles.css'

createApp(App).use(router).use(VueKonva).mount('#app')
