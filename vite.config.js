import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  // GitHub Pages 项目页：https://angeluser-1981.github.io/4ever-piercing-editor/
  // 用相对 base（./）而不是写死 /4ever-piercing-editor/：
  //   - 仓库改名、换域名、或本地直接预览 dist/ 都不会 404；
  //   - 路由用的是 hash 模式，不需要服务器重写。
  base: './',
})
