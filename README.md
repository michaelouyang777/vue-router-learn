# vue-router 源码学习

## vue-router 研究版本
vue-router v3.5.1

<br/>
<br/>
<br/>

## 目录结构

vue-router的主体目录结构如下：
~~~
src
├── components                      // 组件<router-view> and <router-link> 的实现
│   ├── link.js
│   └── view.js
├── history                         // 路由方式的封装
│   ├── abstract.js
│   ├── base.js
│   ├── errors.js
│   ├── hash.js
│   └── html5.js
├── util                            // 各种功能类和功能函数
│   ├── async.js
│   ├── dom.js
│   ├── location.js
│   ├── misc.js
│   ├── params.js
│   ├── path.js
│   ├── push-state.js
│   ├── query.js
│   ├── resolve-components.js
│   ├── route.js
│   ├── scroll.js
│   ├── state-key.js
│   └── warn.js
├── create-matcher.js               // 生成匹配表
├── create-route-map.js
├── index.js                        // 入口文件
└── install.js                      // 单独文件放置安装插件的方法
~~~

整体结构说明：
`components` 下是两个组件 `<router-link>` 和 `<router-view>`
`history` 是路由方式的封装，提供三种方式
`util` 下主要是各种功能类和功能函数
`create-matcher.js` 和 `create-router-map.js` 是生成匹配表
`index.js` 是VueRouter类，也整个插件的入口
`install.js` 提供安装的方法

<br/>
<br/>
<br/>

-------------------------------------------------------------------------------------

<br/>
<br/>
<br/>

## 源码分析

参考文章：
https://blog.csdn.net/u013938465/article/details/79421239
https://juejin.cn/post/6844903877263753223#heading-9


### 前言

在分析源码之前，先了解一下 vue-router 的使用方式

<br/>
<br/>
<br/>

### 1. vue-router的使用

使用方式如下：（当前只演示vue项目的写法）
```js
import Vue from 'vue'
import VueRouter from 'vue-router'
// 第一步：注册插件（如果是在浏览器环境运行的，可以不写该方法）
Vue.use(VueRouter)

// 定义组件（可以从其他文件 import 进来）
const User = { template: '<div>用户</div>' }
const Role = { template: '<div>角色</div>' }

// 定义路由配置表【Array】（每个路由应该映射一个组件）
const routes = [
  { path: '/user', component: User },
  { path: '/home', component: Home }
]

// 第二步：创建 router 实例，并传 `routes` 配置表
const router = new VueRouter({
  mode: 'history',
  routes 
})

// 第三步：创建和挂载根实例
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

<br/>
<br/>
<br/>

### 2. vue-router源码分析

以下分析，根据上面使用示例的步骤进行！！！

#### 第一步：注册插件

~~~ 
使用`Vue.use(VueRouter)`方法将插件注入到Vue中。
use方法会检测注入插件内的install方法，如果有，则执行install方法。 

PS：这是所有vue插件的通用逻辑
~~~

> 注意：如果是在浏览器环境，在index.js内会自动调用use方法。如果是基于node环境，需要手动调用。
```js
// index.js
if (inBrowser && window.Vue) {
  window.Vue.use(VueRouter)
}
```

先看看 vue 内的 use 方法源码实现：

`Vue.use()`方法的内部，其实就是调用plugin的`install`方法。

```js
// vue/src/core/global-api/use.js
/**
 * 定义全局API Vue.use()
 * @param {*} Vue 
 */
export function initUse (Vue: GlobalAPI) {
  /**
   * use方法定义
   * 把use方法挂载到Vue上，成为全局类方法
   * @param {Function | Object} plugin 接收一个Function或Object类型传入的插件
   */
  Vue.use = function (plugin: Function | Object) {
    // 如果插件已经存在，就返回当前对象
    const installedPlugins = (this._installedPlugins || (this._installedPlugins = []))
    if (installedPlugins.indexOf(plugin) > -1) {
      return this
    }

    // additional parameters
    const args = toArray(arguments, 1)
    args.unshift(this)
    // 判断plugin是对象传入的，还是函数传入的
    // 解释：由于Object 和 Function 类型，都可以在其下挂类方法，因此判断plugin是否存在install 和 判断 install 是不是 'function'就可以了
    if (typeof plugin.install === 'function') {
      // 调用的install函数
      plugin.install.apply(plugin, args)
    } 
    // plugin如果是函数传入的
    else if (typeof plugin === 'function') {
      plugin.apply(null, args)
    }

    // 最后把插件缓存起来
    installedPlugins.push(plugin)
    
    return this
  }
}
```

**既然`Vue.use(VueRouter)`会自动加载VueRouter中的`install`方法，那么在vue-router中的`install`方法，又是如何编写的呢？**

下面先看看`index.js`如何引入`install`?

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

// 【兼容写法】如果是浏览器环境，自动执行 Vue.use(VueRouter) 挂载路由
if (inBrowser && window.Vue) {
  window.Vue.use(VueRouter)
}
```

从上面代码可以看到`install`方法，其实是挂载在VueRouter类上，成为了类方法。


`install`方法中的逻辑，单独抽象成一个`install.js`存放

`install`方法内主要做了以下三件事：
1. 通过Vue实例，使用 `minxin` 混入 `beforeCreate`、`destroyed` 生命周期，在相关节点上进行操作（在Vue的生命周期阶段会被调用）
2. 通过Vue.prototype 定义 $router、$route 属性（方便所有组件可以获取这两个属性）
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

> 备注：
> - install方法中，第一件主要的事情，就是调用Vue.mixin()方法，该方法会在new Vue()初始化根实例的生命周期的时候触发里面的内容。也就是说Vue.mixin()里面的代码逻辑是被挂载在vm根实例下，等待时机执行。
> - [Object.defineProperty()](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/Object/defineProperty)

<br/>
<br/>
<br/>
<br/>
<br/>

#### 第二步：初始化router实例

```js
const router = new VueRouter({
  mode: 'history',
  routes 
})
```

使用`new VueRouter()`初始化router实例，并传入一个对象，对象内包裹mode、routes（路由配置）等参数。
[Router构建选项](https://v3.router.vuejs.org/zh/api/#router-%E6%9E%84%E5%BB%BA%E9%80%89%E9%A1%B9)

**那么VueRouter类的构造函数又是怎么实现的？**

生成实例主要做了以下两件事：<br/>
> 第一件事：根据传入的routes（在options内）生成路由配置记录表<br/>
> 第二件事：根据不同的mode模式生成监控路由变化的History对象

```js
// index.js

export default class VueRouter {
  // ...

  constructor (options: RouterOptions = {}) {
    this.app = null
    this.apps = []
    this.options = options
    this.beforeHooks = []
    this.resolveHooks = []
    this.afterHooks = []
    
    // 路由匹配器。createMatcher函数返回一个对象 {match, addRoutes} 【重要】
    this.matcher = createMatcher(options.routes || [], this)

    // 获取传入的路由模式，默认使用hash
    let mode = options.mode || 'hash'

    // h5的history有兼容性 对history做降级处理
    this.fallback = mode === 'history' && !supportsPushState && options.fallback !== false
    if (this.fallback) {
      mode = 'hash'
    }
    if (!inBrowser) {
      mode = 'abstract'
    }
    this.mode = mode

    // 根据不同的mode来生成不同的history实例
    switch (mode) {
      case 'history':
        this.history = new HTML5History(this, options.base)
        break
      case 'hash':
        this.history = new HashHistory(this, options.base, this.fallback)
        break
      case 'abstract':
        this.history = new AbstractHistory(this, options.base)
        break
      default:
        if (process.env.NODE_ENV !== 'production') {
          assert(false, `invalid mode: ${mode}`)
        }
    }
  }

  // ...
}
```

下面来看看第一件事情：根据传入的routes（在options内）生成路由配置记录表

##### 基础概念 —— 路由匹配器matcher
路由匹配器macther是由create-matcher生成一个对象，其将传入VueRouter类的路由记录进行内部转换，对外提供根据location匹配路由方法——match、注册路由方法——addRoutes。
* match方法：根据内部的路由映射匹配location对应的路由对象route
* addRoutes方法：将路由记录添加到matcher实例的路由映射中

**生成matcher**
```js
// index.js

constructor (options: RouterOptions = {}) {
  ...
  // 路由匹配器
  this.matcher = createMatcher(options.routes || [], this)
  ...
}
```

**`createMatcher`函数接收2个参数：**
- routes 是 用户定义的路由配置；
- router 是 `new VueRouter()` 返回的实例。
- 返回了一个对象 { match, addRoute, getRoutes, addRoutes }

```js
// create-matcher.js

/**
 * 路由匹配器
 * 进行路由地址到路由对象的转换、路由记录的映射、路由参数处理等操作
 */
export function createMatcher (routes: Array<RouteConfig>, router: VueRouter): Matcher {
  const { pathList, pathMap, nameMap } = createRouteMap(routes)

  /**
   * 将路由记录添加到matcher实例的路由映射中
   */
  function addRoutes (routes) {
    createRouteMap(routes, pathList, pathMap, nameMap)
  }

  function addRoute (parentOrRoute, route) {
    // ...
  }

  function getRoutes () {
    return pathList.map(path => pathMap[path])
  }

  /**
   * 根据内部的路由映射匹配location对应的路由对象route
   */
  function match (raw: RawLocation, currentRoute?: Route, redirectedFrom?: Location): Route {
    // ...

    return _createRoute(null, location)
  }

  function redirect (record: RouteRecord, location: Location): Route {
    // ...

  }

  function alias (record: RouteRecord, location: Location, matchAs: string): Route {
    // ... 

    return _createRoute(null, location)
  }

  /**
   * 将外部传入的路由记录转换成统一的route对象
   */
  function _createRoute (record: ?RouteRecord, location: Location, redirectedFrom?: Location): Route {
    // ... 

    return createRoute(record, location, redirectedFrom, router)
  }

  // 返回的对象
  return {
    match, // 当前路由的match 
    addRoute,
    getRoutes,
    addRoutes // 更新路由配置
  }
}
```

下面具体分析一下`createMatcher`函数内的`createRouteMap`函数：

```js
const { pathList, pathMap, nameMap } = createRouteMap(routes)
```

**`createRouteMap`函数分析：**
1. 第一步：声明3个的变量：
   - pathList：路由路径列表，存储所有的path，用于控制路径匹配优先级
   - pathMap： 路由路径与路由记录的映射表，表示一个path到RouteRecord的映射关系
   - nameMap： 路由名称与路由记录的映射表，表示name到RouteRecord的映射关系
2. 第二步：遍历routes，对每一项进行处理。
3. 第三步：针对通配符路由的处理，确保通配符路由始终位于末尾。
4. 最后一步：返回一个对象，对象内包含pathList，pathMap，nameMap。

```js
// create-route-map.js

/**
 * 创建路由映射表
 */
export function createRouteMap (
  routes: Array<RouteConfig>,
  oldPathList?: Array<string>,
  oldPathMap?: Dictionary<RouteRecord>,
  oldNameMap?: Dictionary<RouteRecord>,
  parentRoute?: RouteRecord
): {
  pathList: Array<string>,
  pathMap: Dictionary<RouteRecord>,
  nameMap: Dictionary<RouteRecord>
} {
  // 路由路径列表，存储所有的path，用于控制路径匹配优先级
  const pathList: Array<string> = oldPathList || []
  // 路由路径与路由记录的映射表，表示一个path到RouteRecord的映射关系
  const pathMap: Dictionary<RouteRecord> = oldPathMap || Object.create(null)
  // 路由名称与路由记录的映射表，表示name到RouteRecord的映射关系
  const nameMap: Dictionary<RouteRecord> = oldNameMap || Object.create(null)

  // 对路由表内部每一项进行处理
  routes.forEach(route => {
    addRouteRecord(pathList, pathMap, nameMap, route, parentRoute)
  })

  // 针对通配符路由的处理，确保通配符路由始终位于末尾
  for (let i = 0, l = pathList.length; i < l; i++) {
    if (pathList[i] === '*') {
      pathList.push(pathList.splice(i, 1)[0])
      l--
      i--
    }
  }

  return {
    pathList, // 路径列表
    pathMap,  // 路径映射表
    nameMap   // 名称映射表
  }
}
```

**`addRouteRecord`函数分析：**
主要对路由配置的每一项进行处理，最终写入相应的 pathList（路径列表），pathMap（路径映射表），nameMap（名称映射表）。
1. 定义路由记录构建选项
2. 是否存在嵌套路由，若存在子路由，递归处理子路由表
3. 如果路径映射表里不存在路径，则给路径列表添加路径 和 给路径映射表添加路径记录
4. 是否存在别名置项，如果存在，则递归别名配置项
5. 判断路由是否存在name属性，有的话再判断名称映射表中是否存在name属性，没有的话则添加一条记录

```js
// create-route-map.js

// 引入第三方库：路径转为正则
import Regexp from 'path-to-regexp'

/**
 * 添加路由记录
 * 
 * @param {Array<string>} pathList 路径列表
 * @param {Dictionary<RouteRecord>} pathMap 路径映射表
 * @param {Dictionary<RouteRecord>} nameMap 名称映射表
 * @param {RouteConfig} route 路由项
 * @param {RouteRecord} [parent] 父路由项
 * @param {string} [matchAs]
 */
function addRouteRecord (
  pathList: Array<string>,
  pathMap: Dictionary<RouteRecord>,
  nameMap: Dictionary<RouteRecord>,
  route: RouteConfig,
  parent?: RouteRecord,
  matchAs?: string
) {
  ...

  // 定义路由记录构建选项
  const record: RouteRecord = {
    path: normalizedPath, // 规范化之后的路径
    regex: compileRouteRegex(normalizedPath, pathToRegexpOptions), // 路由正则
    components: route.components || { default: route.component }, // 路由组件
    alias: route.alias // 路由别名
      ? typeof route.alias === 'string'
        ? [route.alias]
        : route.alias
      : [],
    instances: {},
    enteredCbs: {},
    name, // 路由的名称
    parent, // 父路由
    matchAs,
    redirect: route.redirect, // 重定向
    beforeEnter: route.beforeEnter, // 进入前钩子函数，形如：(to: Route, from: Route, next: Function) => void;
    meta: route.meta || {}, // 路由元信息
    props:
      route.props == null
        ? {}
        : route.components
          ? route.props
          : { default: route.props }
  }

  // 是否存在嵌套路由
  if (route.children) {
    // Warn if route is named, does not redirect and has a default child route.
    // If users navigate to this route by name, the default child will
    // not be rendered (GH Issue #629)
    // 如果路由已命名并具有默认子路由，则发出警告。
    // 如果用户按名称导航到此路由，则不会呈现默认的子节点(GH问题#629)。
    if (process.env.NODE_ENV !== 'production') {
      if (
        route.name &&
        !route.redirect &&
        route.children.some(child => /^\/?$/.test(child.path)) // 匹配空字符串
      ) {
        warn(
          false,
          `Named Route '${route.name}' has a default child route. ` +
            `When navigating to this named route (:to="{name: '${
              route.name
            }'"), ` +
            `the default child route will not be rendered. Remove the name from ` +
            `this route and use the name of the default child route for named ` +
            `links instead.`
        )
      }
    }
    // 若存在子路由，递归处理子路由表
    route.children.forEach(child => {
      const childMatchAs = matchAs
        ? cleanPath(`${matchAs}/${child.path}`)
        : undefined
      addRouteRecord(pathList, pathMap, nameMap, child, record, childMatchAs)
    })
  }

  // 如果路径映射表里不存在路径
  if (!pathMap[record.path]) {
    // 给路径列表添加路径
    pathList.push(record.path)
    // 给路径映射表添加路径记录
    pathMap[record.path] = record
  }

  // 是否存在别名配置 string | Array<string>
  if (route.alias !== undefined) {
    // 对别名进行格式整理，统一转为数组（便于后续遍历操作处理）
    const aliases = Array.isArray(route.alias) ? route.alias : [route.alias]
    // 递归别名配置项
    for (let i = 0; i < aliases.length; ++i) {
      // 拿到单个别名项
      const alias = aliases[i]
      if (process.env.NODE_ENV !== 'production' && alias === path) {
        warn(
          false,
          `Found an alias with the same value as the path: "${path}". You have to remove that alias. It will be ignored in development.`
        )
        // skip in dev to make it work
        continue
      }
      // 别名路由项对象
      const aliasRoute = {
        path: alias,
        children: route.children
      }
      // 递归处理
      addRouteRecord(
        pathList,
        pathMap,
        nameMap,
        aliasRoute,
        parent,
        record.path || '/' // matchAs
      )
    }
  }

  // 如果路由存在name属性
  if (name) {
    // 判断名称映射表中是否存在name属性，没有的话则添加一条记录
    if (!nameMap[name]) {
      nameMap[name] = record
    } else if (process.env.NODE_ENV !== 'production' && !matchAs) {
      warn(
        false,
        `Duplicate named routes definition: ` +
          `{ name: "${name}", path: "${record.path}" }`
      )
    }
  }
}

/**
 * 解析路径为正则
 * 
 * @param {*} path 
 * @param {*} pathToRegexpOptions 
 */
function compileRouteRegex (
  path: string,
  pathToRegexpOptions: PathToRegexpOptions
): RouteRegExp {
  // 根据路径返回一个正则
  const regex = Regexp(path, [], pathToRegexpOptions)
  if (process.env.NODE_ENV !== 'production') {
    const keys: any = Object.create(null)
    regex.keys.forEach(key => {
      warn(
        !keys[key.name],
        `Duplicate param keys in route with path: "${path}"`
      )
      keys[key.name] = true
    })
  }
  return regex
}

/**
 * 规范化路径
 *
 * @param {string} path
 * @param {RouteRecord} [parent]
 * @param {boolean} [strict]
 * @returns {string}
 */
function normalizePath (
  path: string,
  parent?: RouteRecord,
  strict?: boolean
): string {
  // 替换字符结尾为'/' => '' 如：'/foo/' => '/foo'
  if (!strict) path = path.replace(/\/$/, '')
  if (path[0] === '/') return path
  if (parent == null) return path
  // 替换 '//' => '/' 如：'router//foo//' => 'router/foo/'
  return cleanPath(`${parent.path}/${path}`)
}
```

pathMap存储的数据结构如下：
```js
pathMap：{
  '': {
    beforeEnter: undefined,
    components: {
      default: { template: "<div>home</div>" },
      __proto__: Object
    },
    instances: {},
    matchAs: undefined,
    meta: {},
    name: undefined,
    parent: undefined,
    path: "",
    redirect: undefined,
    __proto__: Object,
  },
  '/bar': {
    beforeEnter: undefined,
    components: {
      default: {template: "<div>bar</div>"},
      __proto__: Object
    },
    instances: {},
    matchAs: undefined,
    meta: {},
    name: undefined,
    parent: undefined,
    path: "/bar",
    redirect: undefined,
    __proto__: Object
  },
  '/bar/child': {
    beforeEnter: undefined,
    components: {
      default: {template: "<div>Child</div>"},
      __proto__: Object
    },
    instances: {},
    matchAs: undefined,
    meta: {},
    name: undefined,
    parent: {path: "/bar", ... },
    path: "/bar/child",
    redirect: undefined,
    __proto__: Object
  },
  '/foo': {
    beforeEnter: undefined,
    components: {
      default: {template: "<div>foo</div>"},
      __proto__: Object
    },
    instances: {},
    matchAs: undefined,
    meta: {},
    name: undefined,
    parent: undefined,
    path: "/foo",
    redirect: undefined,
    __proto__: Object
  }
}
```

分析完`createMatcher`函数内的`const { pathList, pathMap, nameMap } = createRouteMap(routes)`的内部实现之后，下面继续分析`createMatcher`函数。

`createMatcher`函数返回了一个对象 { match, addRoute, getRoutes, addRoutes }

下面看看 `match` 函数的实现

```js
  /**
   * 根据内部的路由映射匹配location对应的路由对象route
   * @param {*} raw 
   * @param {*} currentRoute 当前路由配置
   * @param {*} redirectedFrom 
   */
  function match (
    raw: RawLocation,
    currentRoute?: Route,
    redirectedFrom?: Location
  ): Route {
    // 规范化目标路由的链接
    const location = normalizeLocation(raw, currentRoute, false, router)
    const { name } = location

    // 判断location.name是否存在
    if (name) {
      // 若存在名称，从名称映射表中取对应记录
      const record = nameMap[name]
      if (process.env.NODE_ENV !== 'production') {
        warn(record, `Route with name '${name}' does not exist`)
      }
      
      // 如果没有record，则直接返回，并调用_createRoute，传入null，生成路由
      if (!record) return _createRoute(null, location)

      // 获取record.regex.keys列表，过滤符合条件的，再映射一个key.name的列表
      const paramNames = record.regex.keys
        .filter(key => !key.optional)
        .map(key => key.name)

      // 如果location.params不是一个object类型，就指定一个空对象
      if (typeof location.params !== 'object') {
        location.params = {}
      }

      // 判断currentRoue是否存在，并且currentRoute.params是否object类型
      if (currentRoute && typeof currentRoute.params === 'object') {
        // 遍历currentRoute.params
        for (const key in currentRoute.params) {
          // 如果key不存在于location.params中，但key存在于paramNames中
          if (!(key in location.params) && paramNames.indexOf(key) > -1) {
            // currentRoute.params中的key，存到location.params中
            location.params[key] = currentRoute.params[key]
          }
        }
      }
      // 处理路径
      location.path = fillParams(record.path, location.params, `named route "${name}"`)
      // 生成路由
      return _createRoute(record, location, redirectedFrom)
    } 
    // 或者判断location.path是否存在
    else if (location.path) {
      location.params = {}
      for (let i = 0; i < pathList.length; i++) {
        const path = pathList[i]
        const record = pathMap[path]
        if (matchRoute(record.regex, location.path, location.params)) {
          // 生成路由
          return _createRoute(record, location, redirectedFrom)
        }
      }
    }
    // 没有匹配，则直接返回，并调用_createRoute，传入null，生成路由
    return _createRoute(null, location)
  }
```

> normalizeLocation 函数的实现如下：
> 
> ```js
> // util/location.js
> 
> /**
>  * 规范化目标路由的链接
>  * 
>  * @param {RawLocation} raw 目标路由的链接
>  * @param {Route} [current] 当前路由
>  * @param {boolean} [append] 是否在当前 (相对) 路径前添加基路径
>  * @param {VueRouter} [router] 
>  */
> export function normalizeLocation (
>   raw: RawLocation,
>   current: ?Route,
>   append: ?boolean,
>   router: ?VueRouter
> ): Location {
>   // 处理目标路由的链接（to），支持多种写法
>   // 'home'
>   // { path: 'home' }
>   // { path: `/user/${userId}` }
>   // { name: 'user', params: { userId: 123 }}
>   // { path: 'register', query: { plan: 'private' }}
>   let next: Location = typeof raw === 'string' ? { path: raw } : raw
>   // named target
>   // 若已经被规范化直接返回 next
>   if (next._normalized) {
>     return next
>   } 
>   // 如果存在name属性
>   else if (next.name) {
>     next = extend({}, raw)
>     const params = next.params
>     if (params && typeof params === 'object') {
>       next.params = extend({}, params)
>     }
>     return next
>   }
> 
>   // relative params
>   if (!next.path && next.params && current) {
>     next = extend({}, next)
>     next._normalized = true
>     const params: any = extend(extend({}, current.params), next.params)
>     if (current.name) {
>       next.name = current.name
>       next.params = params
>     } else if (current.matched.length) {
>       const rawPath = current.matched[current.matched.length - 1].path
>       next.path = fillParams(rawPath, params, `path ${current.path}`)
>     } else if (process.env.NODE_ENV !== 'production') {
>       warn(false, `relative params navigation requires a current route.`)
>     }
>     return next
>   }
> 
>   // 解析路径 返回 { path, query, hash }
>   const parsedPath = parsePath(next.path || '')
>   // current.path - 字符串，对应当前路由的路径，总是解析为绝对路径
>   const basePath = (current && current.path) || '/'
>   // 获取最终路径地址
>   const path = parsedPath.path
>     ? resolvePath(parsedPath.path, basePath, append || next.append)
>     : basePath
> 
>   // 获取查询参数
>   const query = resolveQuery(
>     parsedPath.query,
>     next.query,
>     router && router.options.parseQuery
>   )
> 
>   // 当前路由的 hash 值 (带 #) ，如果没有 hash 值，则为空字符串
>   let hash = next.hash || parsedPath.hash
>   if (hash && hash.charAt(0) !== '#') {
>     hash = `#${hash}`
>   }
> 
>   return {
>     _normalized: true,
>     path,
>     query,
>     hash
>   }
> }
> ```
> 
> 关于 `normalizeLocation` 函数中所涉及到 **径路处理** 或 **参数处理** 的函数有：
> - parsePath
> - resolvePath
> - resolveQuery
> 
> 以上3个函数的相关的说明，请查看源码 `src/util/query.js`

最终 `match` 函数会返回一个通过 `_createRoute`函数生成路由对象，数据结构如下：
```
route = {
  fullPath: '/',
  hash: '',
  matched: [
    {
      beforeEnter: undefined,
      components: {
        default: {
          template: '<div>home</div>'
        }
      },
      instances: {},
      matchAs: undefined,
      meta: {},
      name: undefined,
      parent: undefined,
      path: '',
      redirect: undefined
    }
  ],
  meta: {},
  name: undefined,
  params: {},
  path: '/',
  query: {},
  __proto__: Object
};
```

`_createRoute` 函数里面做了三件事情：
1. 判断如果有record.redirect属性，则执行重定向的逻辑。
2. 判断如果有record.matchAs属性，则执行别名处理的逻辑。
3. 不论是执行重定向的逻辑还是别名处理的逻辑，最后统一返回 `createRoute` 函数创建路由对象。



下面来说第二件事情：根据不同的mode模式生成监控路由变化的History对象
##### 基础概念 —— History类

History 有 HTML5History、HashHistory、AbstractHistory 三类，同时它们继承了统一个父类 History类，这是history的基类。

继承关系图如下：
```
History
├── HTML5History
├── HashHistory
├── AbstractHistory
```

首先先来看看base基类 History ：

```js
export class History {
  router: Router
  base: string
  current: Route
  pending: ?Route
  cb: (r: Route) => void
  ready: boolean
  readyCbs: Array<Function>
  readyErrorCbs: Array<Function>
  errorCbs: Array<Function>
  listeners: Array<Function>
  cleanupListeners: Function

  // implemented by sub-classes
  // 以下这些方法由子类去实现
  +go: (n: number) => void
  +push: (loc: RawLocation, onComplete?: Function, onAbort?: Function) => void
  +replace: (
    loc: RawLocation,
    onComplete?: Function,
    onAbort?: Function
  ) => void
  +ensureURL: (push?: boolean) => void
  +getCurrentLocation: () => string
  +setupListeners: Function

  constructor (router: Router, base: ?string) {
    // VueRouter 实例
    this.router = router
    // 应用的根路径
    this.base = normalizeBase(base)
    // start with a route object that stands for "nowhere"
    // 从一个表示 “nowhere” 的 route 对象开始
    this.current = START
    // 等待状态标志
    this.pending = null
    this.ready = false
    this.readyCbs = []
    this.readyErrorCbs = []
    this.errorCbs = []
    this.listeners = []
  }

  /**
   * 注册回调
   */
  listen (cb: Function) {
    // ...
  }

  /**
   * 准备函数
   */
  onReady (cb: Function, errorCb: ?Function) {
    // ...
  }

  /**
   * 错误函数
   */
  onError (errorCb: Function) {
    // ...
  }

  /**
   * 核心跳转方法
   */
  transitionTo (location: RawLocation, onComplete?: Function, onAbort?: Function) {
    // ...
  }

  /**
   * 确认过渡
   */
  confirmTransition (route: Route, onComplete: Function, onAbort?: Function) {
    // ...
  }

  /**
   * 路由更新
   */
  updateRoute (route: Route) {
    // ...
  }

  setupListeners () {
    // ...
  }

  teardown () {
    // ...
  }
}
```

下面重点分析一下两个方法（`transitionTo` 与 `confirmTransition`）

**`transitionTo` 函数**

`transitionTo` 函数有三个参数：
- location   ：目标路径；
- onComplete ：成功的回调函数；
- onAbort    ：失败的回调函数；

`transitionTo` 函数做了以下几件事情：
1. 通过 VueRouter 实例的 matcher 方法返回匹配到 route 对象。
2. 调用 `confirmTransition` 方法(传入参数为 匹配的路由对象，成功的回调函数，失败的回调函数)。
   - 成功的回调函数：<br/>
       <1> 更新 history.current 属性的值为匹配后的 router；<br/>
       <2> 调用 onComplete 函数；<br/>
       <3> 调用全局的 afterEach 钩子。<br/>
   - 失败的回调函数：<br/>
       <1> 触发失败的回调 onAbort

```js
  /**
   * 核心跳转方法
   * @param {RawLocation} location 目标路径
   * @param {Function} [onComplete] 成功的回调函数
   * @param {Function} [onAbort] 失败的回调函数
   */
  transitionTo (
    location: RawLocation,
    onComplete?: Function,
    onAbort?: Function
  ) {
    let route
    // catch redirect option https://github.com/vuejs/vue-router/issues/3201
    try {
      // 获取路由匹配信息
      // location：目标路由
      // this.current：当前页面路由
      route = this.router.match(location, this.current)
    } catch (e) {
      this.errorCbs.forEach(cb => {
        cb(e)
      })
      // Exception should still be thrown
      throw e
    }
    
    // 把当前路由缓存起来
    const prev = this.current
    // 调用最终跳转方法，并传入路由对象信息，和回调
    // 回调：更新路由，执行传入回调, 更新 URL
    this.confirmTransition(
      // 匹配的路由对象
      route,
      // 成功的回调
      () => {
        // 更新this.current
        this.updateRoute(route)
        // onComplete 跳转完成触发
        onComplete && onComplete(route)
        // 抽象方法
        this.ensureURL()
        // 触发跳转后的路由钩子
        this.router.afterHooks.forEach(hook => {
          hook && hook(route, prev)
        })

        // fire ready cbs once
        if (!this.ready) {
          this.ready = true
          this.readyCbs.forEach(cb => {
            cb(route)
          })
        }
      },
      // 失败的回调
      err => {
        if (onAbort) {
          onAbort(err)
        }
        if (err && !this.ready) {
          // Initial redirection should not mark the history as ready yet
          // because it's triggered by the redirection instead
          // https://github.com/vuejs/vue-router/issues/3225
          // https://github.com/vuejs/vue-router/issues/3331
          if (!isNavigationFailure(err, NavigationFailureType.redirected) || prev !== START) {
            this.ready = true
            this.readyErrorCbs.forEach(cb => {
              cb(err)
            })
          }
        }
      }
    )
  }
```


** `confirmTransition` 函数**

`confirmTransition` 是一个很重要的函数方法，文档内**完整的导航解析流程**就在此函数内定义。

在 `transitionTo` 函数执行时调用 `confirmTransition` 函数，往 `confirmTransition` 函数传入一个成功的回调，该回调会调用全局的 **afterEach** 钩子。

```js
  /**
   * 确认过渡
   * @param {Route} route 解析后的跳转路由
   * @param {Function} onComplete 成功的回调
   * @param {Function} [onAbort] 失败的回调
   */
  confirmTransition (route: Route, onComplete: Function, onAbort?: Function) {
    // 当前的路由
    const current = this.current
    this.pending = route
    const abort = err => {
      // changed after adding errors with
      // https://github.com/vuejs/vue-router/pull/3047 before that change,
      // redirect and aborted navigation would produce an err == null
      if (!isNavigationFailure(err) && isError(err)) {
        if (this.errorCbs.length) {
          this.errorCbs.forEach(cb => {
            cb(err)
          })
        } else {
          warn(false, 'uncaught error during route navigation:')
          console.error(err)
        }
      }
      onAbort && onAbort(err)
    }
    // 获取要跳转的record
    const lastRouteIndex = route.matched.length - 1
    // 获取当前的record
    const lastCurrentIndex = current.matched.length - 1
    // 如果跳转前后的路由相同就调用失败的回调
    if (
      isSameRoute(route, current) &&
      // in the case the route map has been dynamically appended to
      lastRouteIndex === lastCurrentIndex &&
      route.matched[lastRouteIndex] === current.matched[lastCurrentIndex]
    ) {
      this.ensureURL()
      return abort(createNavigationDuplicatedError(current, route))
    }

    // 解析钩子函数队列，包括导航的路由守卫，并异步调用
    const { updated, deactivated, activated } = resolveQueue(
      this.current.matched,
      route.matched
    )

    const queue: Array<?NavigationGuard> = [].concat(
      // in-component leave guards
      // 组件内部beforeRouteLeave
      extractLeaveGuards(deactivated),
      // global before hooks
      // 全部前置守卫 beforeEach
      this.router.beforeHooks,
      // in-component update hooks
      // vue组件内部 beforeRouteUpdate
      extractUpdateHooks(updated),
      // in-config enter guards
      // 路由配置里面的beforeEnter
      activated.map(m => m.beforeEnter),
      // async components
      // 解析异步组件
      resolveAsyncComponents(activated)
    )

    /**
     * 迭代器
     * @param {*} hook 
     * @param {*} next
     */
    const iterator = (hook: NavigationGuard, next) => {
      if (this.pending !== route) {
        return abort(createNavigationCancelledError(current, route))
      }
      try {
        // hook为路由守卫等钩子函数
        hook(route, current, (to: any) => {
          if (to === false) {
            // next(false) -> abort navigation, ensure current URL
            this.ensureURL(true)
            abort(createNavigationAbortedError(current, route))
          } else if (isError(to)) {
            this.ensureURL(true)
            abort(to)
          } else if (
            typeof to === 'string' ||
            (typeof to === 'object' &&
              (typeof to.path === 'string' || typeof to.name === 'string'))
          ) {
            // next('/') or next({ path: '/' }) -> redirect
            abort(createNavigationRedirectedError(current, route))
            if (typeof to === 'object' && to.replace) {
              this.replace(to)
            } else {
              this.push(to)
            }
          } else {
            // confirm transition and pass on the value
            // next为调用下一个queue数组的函数元素
            next(to)
          }
        })
      } catch (e) {
        abort(e)
      }
    }

    // 按照queue队列一个一个执行异步回调
    runQueue(queue, iterator, () => {
      // wait until async components are resolved before
      // 在解析异步组件之前
      // extracting in-component enter guards
      // 组件内部的beforeRouteEnter
      const enterGuards = extractEnterGuards(activated)
      // 全部的beforeResolve
      const queue = enterGuards.concat(this.router.resolveHooks)
      runQueue(queue, iterator, () => {
        if (this.pending !== route) {
          return abort(createNavigationCancelledError(current, route))
        }
        this.pending = null
        // 导航被确认
        onComplete(route)
        if (this.router.app) {
          this.router.app.$nextTick(() => {
            handleRouteEntered(route)
          })
        }
      })
    })
  }
```


















#### 第三步：生成vue实例

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

首先会执行`beforeCreate`扣子函数，验证vue是否有router对象，没有则初始化。有则寻找父组件的`_routerRoot`。

在没有router对象时，会调用`this.$options.router`拿到传入到`new Vue({ router })`中的router实例，通过这个实例可以调用VueRouter的实例方法init方法，即`this._router.init(this)`，来初始化router。下面来看看init实例方法中实现：

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


执行完init方法初始化router之后，最后会调用`registerInstance`方法，注册实例。

```js
  /**
   * 定义注册实例函数
   * @param {*} vm vue实例
   * @param {*} callVal 回调
   */
  const registerInstance = (vm, callVal) => {
    let i = vm.$options._parentVnode
    if (isDef(i) && isDef(i = i.data) && isDef(i = i.registerRouteInstance)) {
      i(vm, callVal)
    }
  }
```

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




