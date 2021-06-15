# vue-router 源码学习



## vue-router 研究版本
vue-router v3.5.1




## 目录结构

vue-router的主体目录结构如下：
~~~
src
├── components                      // 组件<router-view> and <router-link> 的实现
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
├── install.js                      // 单独文件放置安装插件的方法
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






















##### 第二步：初始化router实例

初始化router实例，并传入 `routes` 路由配置
```js
const router = new VueRouter({
  routes 
})
```

生成实例过程中，主要做了以下两件事：
1、根据配置数组(传入的routes)生成路由配置记录表。
2、根据不同模式生成监控路由变化的History对象

> 注：
> History类由HTML5History、HashHistory、AbstractHistory三类继承
> history/base.js实现了基本history的操作
> history/hash.js，history/html5.js和history/abstract.js继承了base，只是根据不同的模式封装了一些基本操作




那么VueRouter类的构造函数又是怎么实现的？

<!-- 
TODO

编写VueRouter构造函数当中做了些什么


 -->






















##### 第三步：生成vue实例

```js
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

把router实例以参数的形式，传入到`new Vue()`中，并初始化vm实例。
此时会执行Vue的生命周期。那么在install方法中使用mixin混入到Vue中的这部分逻辑就会执行，代码如下：

```js
// install.js

// 调用Vue的全局api mixin，混入
Vue.mixin({
  // 在beforeCreate扣子函数进行路由注册
  beforeCreate () {
    // 验证vue是否有router对象
    // 没有router对象，则初始化
    if (isDef(this.$options.router)) {
      // 将_routerRoot指向根组件
      this._routerRoot = this
      // 将router对象挂载到根组件元素_router上
      this._router = this.$options.router
      // 初始化，建立路由监控
      this._router.init(this)
      // 劫持数据_route，一旦_route数据发生变化后，通知router-view执行render方法
      Vue.util.defineReactive(this, '_route', this._router.history.current)
    } else {
      // 如果有router对象，去寻找根组件，将_routerRoot执行根组件（解决嵌套关系时候_routerRoot指向不一致问题）
      this._routerRoot = (this.$parent && this.$parent._routerRoot) || this
    }
    registerInstance(this, this)
  },
  // 在destroyed的扣子函数销毁实例
  destroyed () {
    registerInstance(this)
  }
})
```

首先会执行`beforeCreate`扣子函数，验证vue是否有router对象，没有则初始化。有则根组件的`_routerRoot`。然后调用`registerInstance`注册实例。

在没有router对象时，会调用`this.$options.router`拿到传入到`new Vue({ router })`中的router实例，通过这个实例可以调用VueRouter的实例方法init，即`this._router.init(this)`，下面来看看init实例方法中实现：

```js
// index.js

  init (app: any /* Vue component instance */) {
    process.env.NODE_ENV !== 'production' &&
      assert(
        install.installed,
        `not installed. Make sure to call \`Vue.use(VueRouter)\` ` +
          `before creating root instance.`
      )
    // 首先将传入的app实例，存入this.apps中
    this.apps.push(app)


    // set up app destroyed handler
    // https://github.com/vuejs/vue-router/issues/2639
    // 声明式地注册组件destroyed生命周期钩子，保证对应组件销毁时组件app实例从router.apps上移除。
    app.$once('hook:destroyed', () => {
      // clean out app from this.apps array once destroyed
      // 从this.apps从查询是否存在传入app
      const index = this.apps.indexOf(app)
      // 如果index > -1，说明已经存在，那么从this.apps中移除
      if (index > -1) this.apps.splice(index, 1)
      // ensure we still have a main app or null if no apps
      // we do not release the router so it can be reused
      // 判断当前this.app与传入的app是不是同一个，如果是，则从this.apps中取出第一个app
      if (this.app === app) this.app = this.apps[0] || null
      // 判断当前this.app是否存在，不存在则销毁。
      if (!this.app) this.history.teardown()
    })


    // main app previously initialized
    // return as we don't need to set up new history listener
    // 判断this.app是否存在，有则返回
    if (this.app) {
      return
    }
    // 将存入的app实例赋给this.app
    this.app = app


    // 获取history实例
    const history = this.history
    if (history instanceof HTML5History || history instanceof HashHistory) {
      // 定义handleInitialScroll函数
      const handleInitialScroll = routeOrError => {
        const from = history.current
        const expectScroll = this.options.scrollBehavior
        const supportsScroll = supportsPushState && expectScroll

        if (supportsScroll && 'fullPath' in routeOrError) {
          handleScroll(this, routeOrError, from, false)
        }
      }

      // 定义setupListeners函数
      const setupListeners = routeOrError => {
        history.setupListeners()
        handleInitialScroll(routeOrError)
      }
      
      // 使用 history.transitionTo 分路由模式触发路由变化
      history.transitionTo(
        history.getCurrentLocation(),
        setupListeners,
        setupListeners
      )
    }


    // 使用 history.listen 监听路由变化来更新根组件实例 app._route 是当前跳转的路由
    history.listen(route => {
      this.apps.forEach(app => {
        app._route = route
      })
    })
  }
```

init方法中主要做了如下几件事：
1. **监听destroyed生命周期**  通过 `app.$once('hook:destroyed', () => {}` 声明式地监听组件destroyed生命周期钩子，保证对应组件销毁时组件app实例从router.apps上移除。
2. **保证路由初仅始化一次**  由于init是被全局注册的mixin调用，此处通过`if(this.app)`判断`this.app`是否存在，保证路由初始化仅仅在根组件 <App /> 上初始化一次，`this.app`最后保存的根据组件实例。
3. **触发路由变化**  使用 `history.transitionTo` 分路由模式触发路由变化。
4. **开始路由监听**  使用 `history.listen` 监听路由变化，来更新根组件实例 app._route 是当前跳转的路由。

至此，路由的初始化工作就完成了。


那么路由引入的组件，如何展示在`<router-view />`上？



































路由的更新方式

一、主动触发

router-link绑定了click方法，触发history.push或者history.replace，从而触发history.transitionTo。
transitionTo用于处理路由转换，其中包含了updateRoute用于更新_route。
在beforeCreate中有劫持_route的方法，当_route变化后，触发router-view的变化。


二、地址变化（如：在浏览器地址栏直接输入地址）

HashHistory和HTML5History会分别监控hashchange和popstate来对路由变化作对用的处理 。
HashHistory和HTML5History捕获到变化后会对应执行push或replace方法，从而调用transitionTo
,剩下的就和上面主动触发一样啦。






总结

1、安装插件

混入beforeCreate生命周期处理，初始化_routerRoot，_router，_route等数据
全局设置vue静态访问router和router和route，方便后期访问
完成了router-link和 router-view 两个组件的注册，router-link用于触发路由的变化，router-view作 为功能组件，用于触发对应路由视图的变化


2、根据路由配置生成router实例

根据配置数组生成路由配置记录表
生成监控路由变化的hsitory对象


3、将router实例传入根vue实例

根据beforeCreate混入，为根vue对象设置了劫持字段_route，用户触发router-view的变化
调用init()函数，完成首次路由的渲染，首次渲染的调用路径是 调用history.transitionTo方法，根据router的match函数，生成一个新的route对象
接着通过confirmTransition对比一下新生成的route和当前的route对象是否改变，改变的话触发updateRoute，更新hsitory.current属性，触发根组件的_route的变化,从而导致组件的调用render函数，更新router-view

另外一种更新路由的方式是主动触发
router-link绑定了click方法，触发history.push或者history.replace,从而触发history.transitionTo
同时会监控hashchange和popstate来对路由变化作对用的处理




