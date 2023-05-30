/* @flow */

// 引入install函数
import { install } from './install'
import { START } from './util/route'
import { assert, warn } from './util/warn'
import { inBrowser } from './util/dom'
import { cleanPath } from './util/path'
import { createMatcher } from './create-matcher'
import { normalizeLocation } from './util/location'
import { supportsPushState } from './util/push-state'
import { handleScroll } from './util/scroll'

import { HashHistory } from './history/hash'
import { HTML5History } from './history/html5'
import { AbstractHistory } from './history/abstract'

import type { Matcher } from './create-matcher'

import { isNavigationFailure, NavigationFailureType } from './util/errors'

/**
 * VueRouter类
 */
export default class VueRouter {
  // 声明静态属性（赋值在类外面）
  static install: () => void
  static version: string
  static isNavigationFailure: Function
  static NavigationFailureType: any
  static START_LOCATION: Route

  // 声明实例属性
  app: any // Vue 实例
  apps: Array<any>
  ready: boolean
  readyCbs: Array<Function>
  options: RouterOptions // 路由配置
  mode: string; // 路由模式，默认 hash
  history: HashHistory | HTML5History | AbstractHistory
  matcher: Matcher // 一个数组，包含当前路由的所有嵌套路径片段的路由记录。
  fallback: boolean // 当浏览器不支持 history.pushState 控制路由是否应该回退到 hash 模式。默认值为 true。
  beforeHooks: Array<?NavigationGuard> // 前置钩子集合
  resolveHooks: Array<?NavigationGuard>
  afterHooks: Array<?AfterNavigationHook> // 后置钩子集合

  constructor (options: RouterOptions = {}) {
    this.app = null
    this.apps = []
    this.options = options
    this.beforeHooks = []
    this.resolveHooks = []
    this.afterHooks = []

    
    // 【第一件事】：根据传入的routes（在options内）生成路由配置记录表
    // 创建 matcher 匹配函数，createMatcher函数返回一个对象 { match, addRoute, getRoutes, addRoutes } 【重要】
    this.matcher = createMatcher(options.routes || [], this)


    // 【第二件事】：根据不同的mode模式生成监控路由变化的History对象
    // 获取传入的路由模式，默认使用hash
    let mode = options.mode || 'hash'

    // 如果传入的模式为 ·history· 在浏览器环境下不支持 history 模式，则强制回退到 hash 模式（降级处理）
    this.fallback = mode === 'history' && !supportsPushState && options.fallback !== false
    if (this.fallback) {
      mode = 'hash'
    }
    // 如果不是在浏览器环境内，使用 abstract 模式
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

  match (raw: RawLocation, current?: Route, redirectedFrom?: Location): Route {
    return this.matcher.match(raw, current, redirectedFrom)
  }

  /**
   * 获取当前路由
   */
  get currentRoute (): ?Route {
    return this.history && this.history.current
  }

  /**
   * 初始化
   * @param {*} app 
   */
  init(app: any /* Vue component instance */) {
    // 断言有没有安装插件，如果没有抛出错误提示
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
    // 使用$once监听组件destroyed生命周期钩子，保证对应组件销毁时组件app实例从router.apps上移除，避免内存泄露
    app.$once('hook:destroyed', () => {
      // 从this.apps从查询是否存在传入app
      const index = this.apps.indexOf(app)
      // 如果index > -1，说明已经存在，那么从this.apps中移除
      if (index > -1) this.apps.splice(index, 1)
      // 判断当前this.app与传入的app是不是同一个，如果是，则从this.apps中取出第一个app
      if (this.app === app) this.app = this.apps[0] || null
      // 判断当前this.app是否存在，不存在则销毁。
      if (!this.app) this.history.teardown()
    })

    // 判断this.app是否存在，有则返回。保证VueRouter只初始化一次，如果初始化了就终止后续逻辑
    if (this.app) {
      return
    }
    // 将存入的app实例赋给this.app
    this.app = app
    

    // 获取history实例
    const history = this.history

    // 针对不同路由模式做不同的处理
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

  /**
   * Router 实例方法 beforeEach 全局前置的导航守卫。
   * 当一个导航触发时，全局前置守卫按照创建顺序调用。
   * 守卫是异步解析执行，此时导航在所有守卫 resolve 完之前一直处于 等待中。
   * @param {Function} fn (to, from, next) => {}
   * @memberof VueRouter
   *
   */
  beforeEach (fn: Function): Function {
    return registerHook(this.beforeHooks, fn)
  }

  beforeResolve (fn: Function): Function {
    return registerHook(this.resolveHooks, fn)
  }
  
  /**
   * Router 实例方法 afterEach 全局后置钩子
   * @param {Function} fn (to, from) => {}
   * @memberof VueRouter
   */
  afterEach (fn: Function): Function {
    return registerHook(this.afterHooks, fn)
  }
  
  /**
   * 对外暴露 API
   * https://v3.router.vuejs.org/zh/api/#router-onready
   */
  onReady (cb: Function, errorCb?: Function) {
    this.history.onReady(cb, errorCb)
  }

  /**
   * 对外暴露 API
   * https://v3.router.vuejs.org/zh/api/#router-onerror
   */
  onError (errorCb: Function) {
    this.history.onError(errorCb)
  }
  
  /**
   * 编程式导航 push 导航到对应的 location
   * 这个方法会向 history 栈添加一个新的记录，
   * 所以，当用户点击浏览器后退按钮时，则回到之前的 location。
   *
   * @param {RawLocation} location
   * @memberof VueRouter
   */
  push (location: RawLocation, onComplete?: Function, onAbort?: Function) {
    // $flow-disable-line
    if (!onComplete && !onAbort && typeof Promise !== 'undefined') {
      return new Promise((resolve, reject) => {
        this.history.push(location, resolve, reject)
      })
    } else {
      this.history.push(location, onComplete, onAbort)
    }
  }
  
  /**
   * 编程式导航 replace 导航到对应的 location
   * 它不会向 history 添加新记录，而是跟它的方法名一样 —— 替换掉当前的 history 记录。
   *
   * @param {RawLocation} location
   * @memberof VueRouter
   */
  replace (location: RawLocation, onComplete?: Function, onAbort?: Function) {
    // $flow-disable-line
    if (!onComplete && !onAbort && typeof Promise !== 'undefined') {
      return new Promise((resolve, reject) => {
        this.history.replace(location, resolve, reject)
      })
    } else {
      this.history.replace(location, onComplete, onAbort)
    }
  }

  /**
   * 在 history 记录中向前或者后退多少步，类似 window.history.go(n)。
   *
   * @param {number} n
   * @memberof VueRouter
   */
  go (n: number) {
    this.history.go(n)
  }

  /**
   * 后退
   *
   * @memberof VueRouter
   */
  back () {
    this.go(-1)
  }
  
  /**
   * 前进
   *
   * @memberof VueRouter
   */
  forward () {
    this.go(1)
  }

  /**
   * 获取匹配到的组件列表
   *
   * @returns {Array<any>}
   * @memberof VueRouter
   */
  getMatchedComponents (to?: RawLocation | Route): Array<any> {
    const route: any = to
      ? to.matched
        ? to
        : this.resolve(to).route
      : this.currentRoute
    if (!route) {
      return []
    }
    return [].concat.apply(
      [],
      route.matched.map(m => {
        return Object.keys(m.components).map(key => {
          return m.components[key]
        })
      })
    )
  }

  resolve (
    to: RawLocation,
    current?: Route,
    append?: boolean
  ): {
    location: Location,
    route: Route,
    href: string,
    // for backwards compat
    normalizedTo: Location,
    resolved: Route
  } {
    current = current || this.history.current
    const location = normalizeLocation(to, current, append, this)
    const route = this.match(location, current)
    const fullPath = route.redirectedFrom || route.fullPath
    const base = this.history.base
    const href = createHref(base, fullPath, this.mode)
    return {
      location,
      route,
      href,
      // for backwards compat
      normalizedTo: location,
      resolved: route
    }
  }

  getRoutes () {
    return this.matcher.getRoutes()
  }

  addRoute (parentOrRoute: string | RouteConfig, route?: RouteConfig) {
    this.matcher.addRoute(parentOrRoute, route)
    if (this.history.current !== START) {
      this.history.transitionTo(this.history.getCurrentLocation())
    }
  }

  addRoutes (routes: Array<RouteConfig>) {
    if (process.env.NODE_ENV !== 'production') {
      warn(false, 'router.addRoutes() is deprecated and has been removed in Vue Router 4. Use router.addRoute() instead.')
    }
    this.matcher.addRoutes(routes)
    if (this.history.current !== START) {
      this.history.transitionTo(this.history.getCurrentLocation())
    }
  }
}

/**
 * 注册路由扣子
 * @param {Array<any>} list 队列
 * @param {Function} fn 回调
 * @returns {Function} 返回一个函数体
 */
function registerHook (list: Array<any>, fn: Function): Function {
  list.push(fn)
  return () => {
    const i = list.indexOf(fn)
    if (i > -1) list.splice(i, 1)
  }
}

function createHref (base: string, fullPath: string, mode) {
  var path = mode === 'hash' ? '#' + fullPath : fullPath
  return base ? cleanPath(base + '/' + path) : path
}

// VueRouter类有5个静态属性，全局在类外面统一赋值，值的内容都是从外面引入
// 将引入install函数挂载到VueRouter的静态类方法中
VueRouter.install = install
VueRouter.version = '__VERSION__'
VueRouter.isNavigationFailure = isNavigationFailure
VueRouter.NavigationFailureType = NavigationFailureType
VueRouter.START_LOCATION = START

// 【兼容写法】如果是浏览器环境，自动执行 Vue.use(VueRouter) 挂载路由
if (inBrowser && window.Vue) {
  window.Vue.use(VueRouter)
}
