import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './styles/tokens.css'
import './styles/base.css'
import 'splitpanes/dist/splitpanes.css'
import App from './App.vue'
import router from './router/index'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
