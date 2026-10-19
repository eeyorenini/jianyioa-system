/// <reference types='@dcloudio/types' />
import 'vue'

// 构建时由 vite.config.ts 的 define 注入，来源是 package.json 的 version
declare const __APP_VERSION__: string

declare module '@vue/runtime-core' {
  type Hooks = App.AppInstance & Page.PageInstance;

  interface ComponentCustomOptions extends Hooks {

  }
}
