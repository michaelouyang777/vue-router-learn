# vue-router 源码学习



## vue-router 研究版本
vue-router v3.5.1




## 目录结构

vue-router的主体目录结构如下：
~~~
src
├── components                      // 是两个组件<router-view> and <router-link> 的实现
│   ├── link.js
│   └── view.js
├── create-matcher.js               // 生成匹配表
├── create-route-map.js
├── history                         // 路由方式的封装
│   ├── abstract.js
│   ├── base.js
│   ├── errors.js
│   ├── hash.js
│   └── html5.js
├── index.js                        // 入口文件
├── install.js                      // 安装插件的方法
└── util                            // 各种功能类和功能函数
    ├── async.js
    ├── dom.js
    ├── location.js
    ├── misc.js
    ├── params.js
    ├── path.js
    ├── push-state.js
    ├── query.js
    ├── resolve-components.js
    ├── route.js
    ├── scroll.js
    ├── state-key.js
    └── warn.js
~~~




--------------------------------------




## 源码分析

参考文章：
https://blog.csdn.net/u013938465/article/details/79421239


### vue-router的安装

#### 1-1. vue-router的使用

在分析源码之前，先整体展示下vue-router使用方式

```js
import Vue from 'vue'
import VueRouter from 'vue-router'
// 1. 注册插件（如果是在浏览器环境运行的，可以不写该方法）
Vue.use(VueRouter)

// 定义组件（可以从其他文件 import 进来）
const User = { template: '<div>用户</div>' }
const Role = { template: '<div>角色</div>' }

// 定义路由【Array】（每个路由应该映射一个组件）
const routes = [
  { path: '/user', component: User },
  { path: '/home', component: Home }
]

// 2. 创建 router 实例，并传 `routes` 配置
const router = new VueRouter({
  routes 
})

// 3. 创建和挂载根实例
// 使用 router-link 组件来导航路由出口，路由匹配到的组件将渲染在这里
const app = new Vue({
  router,
  template: `
    <div id="app">
      <h1>Basic</h1>
      <ul>
        <li><router-link to="/">/</router-link></li>
        <li><router-link to="/user">用户</router-link></li>
        <li><router-link to="/role">角色</router-link></li>
        <router-link tag="li" to="/user">/用户</router-link>
      </ul>
      <router-view class="view"></router-view>
    </div>
  `
}).$mount('#app')
```


#### 1-2 vue-router的使用分析

##### 第一步：注册插件

使用`Vue.use(VueRouter)`方法将插件注入到Vue中。
use方法会检测注入插件内的install方法，如果有，则执行install方法。

> 注意：如果是在浏览器环境，在index.js内会自动调用use方法。如果是基于node环境，需要手动调用。
```js
// index.js
if (inBrowser && window.Vue) {
  window.Vue.use(VueRouter)
}
```

以下是use源码的实现：

`Vue.use()`方法的内部，其实就是调用plugin的install方法。
```js
// core/use.js

export function initUse (Vue: GlobalAPI) {
  // use方法接收一个Function或Object
  // 并把use方法挂载到Vue上，成为类方法
  Vue.use = function (plugin: Function | Object) {
    const installedPlugins = (this._installedPlugins || (this._installedPlugins = []))
    if (installedPlugins.indexOf(plugin) > -1) {
      return this
    }

    // additional parameters
    const args = toArray(arguments, 1)
    args.unshift(this)
    // 判断plugin中的install是否函数
    if (typeof plugin.install === 'function') {
      // 调用的install函数
      plugin.install.apply(plugin, args)
    } else if (typeof plugin === 'function') {
      plugin.apply(null, args)
    }
    installedPlugins.push(plugin)
    return this
  }
}
```

`Vue.use(VueRouter)`会自动加载VueRouter中的install方法，那么在vue-router中的install方法，又是如何编写的呢？

```js
// index.js

// 引入install函数
import { install } from './install'

export default class VueRouter {
  // 声明静态属性
  static install: () => void
  ...
}

// 将引入install函数挂载到VueRouter的静态类方法中
VueRouter.install = install
```

其实VueRouter的install方法就挂载在类方法上。


vue-router中，被执行的install方法解析(对应目录install.js)

install方法内主要做了以下三件事：
1. 通过Vue实例，使用 minxin 混入 beforeCreate 钩子操作（在Vue的生命周期阶段会被调用）
2. 通过 Vue.prototype 定义 $router、$route 属性（方便所有组件可以获取这两个属性）
3. 通过Vue全局注册 router-link 和 router-view 两个组件

```js
// install.js
import View from './components/view'
import Link from './components/link'

export let _Vue

export function install (Vue) {
  if (install.installed && _Vue === Vue) return
  install.installed = true
  _Vue = Vue

  const isDef = v => v !== undefined

  const registerInstance = (vm, callVal) => {
    let i = vm.$options._parentVnode
    if (isDef(i) && isDef(i = i.data) && isDef(i = i.registerRouteInstance)) {
      i(vm, callVal)
    }
  }

  // 1. 调用Vue的全局api mixin，混入
  Vue.mixin({
    // 在beforeCreate扣子函数进行路由注册
    beforeCreate () {
      if (isDef(this.$options.router)) {
        this._routerRoot = this
        this._router = this.$options.router
        this._router.init(this)
        Vue.util.defineReactive(this, '_route', this._router.history.current)
      } else {
        this._routerRoot = (this.$parent && this.$parent._routerRoot) || this
      }
      registerInstance(this, this)
    },
    // 在destroyed的扣子函数销毁实例
    destroyed () {
      registerInstance(this)
    }
  })

  // 2. 将$router、$route对象设置为响应式对象，放置在Vue.prototype内
  Object.defineProperty(Vue.prototype, '$router', {
    get () { return this._routerRoot._router }
  })
  Object.defineProperty(Vue.prototype, '$route', {
    get () { return this._routerRoot._route }
  })

  // 3. 定义全局组件
  Vue.component('RouterView', View)
  Vue.component('RouterLink', Link)

  const strats = Vue.config.optionMergeStrategies
  // use the same hook merging strategy for route hooks
  strats.beforeRouteEnter = strats.beforeRouteLeave = strats.beforeRouteUpdate = strats.created
}
```














