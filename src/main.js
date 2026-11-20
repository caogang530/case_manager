import { createApp, h } from 'vue'
import { createPinia } from 'pinia'
import {
  ElButton, ElConfigProvider, ElDialog, ElDropdown, ElDropdownItem, ElDropdownMenu,
  ElForm, ElFormItem, ElIcon, ElImage, ElInput, ElOption, ElSelect, ElTooltip,
} from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/es/components/button/style/css'
import 'element-plus/es/components/dialog/style/css'
import 'element-plus/es/components/dropdown/style/css'
import 'element-plus/es/components/form/style/css'
import 'element-plus/es/components/form-item/style/css'
import 'element-plus/es/components/icon/style/css'
import 'element-plus/es/components/image/style/css'
import 'element-plus/es/components/input/style/css'
import 'element-plus/es/components/message/style/css'
import 'element-plus/es/components/message-box/style/css'
import 'element-plus/es/components/select/style/css'
import 'element-plus/es/components/tooltip/style/css'
import App from './App.vue'
import router from './router'
import './styles.css'

const app = createApp({ render: () => h(ElConfigProvider, { locale: zhCn }, () => h(App)) })
for (const component of [
  ElButton, ElDialog, ElDropdown, ElDropdownItem, ElDropdownMenu, ElForm, ElFormItem,
  ElIcon, ElImage, ElInput, ElOption, ElSelect, ElTooltip,
]) {
  app.use(component)
}
app.use(createPinia())
app.use(router)
app.mount('#app')
