import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './styles/tokens.css'
import './styles/base.css'
import './styles/card.css'
import 'dockview-vue/dist/styles/dockview.css'
import './styles/dock_theme.css'
import App from './App.vue'

const app = createApp(App)
app.use(createPinia())
app.mount('#app')
