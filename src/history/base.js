/* @flow */

import { _Vue } from '../install'
import type Router from '../index'
import { inBrowser } from '../util/dom'
import { runQueue } from '../util/async'
import { warn } from '../util/warn'
import { START, isSameRoute, handleRouteEntered } from '../util/route'
import {
  flatten,
  flatMapComponents,
  resolveAsyncComponents
} from '../util/resolve-components'
import {
  createNavigationDuplicatedError,
  createNavigationCancelledError,
  createNavigationRedirectedError,
  createNavigationAbortedError,
  isError,
  isNavigationFailure,
  NavigationFailureType
} from '../util/errors'

/**
 * 基类
 */
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
   * 在index.js的init方法中用到
   */
  listen (cb: Function) {
    this.cb = cb
  }
  
  /**
   * 准备函数
   * 在index.js的onReady方法中用到
   */
  onReady (cb: Function, errorCb: ?Function) {
    if (this.ready) {
      cb()
    } else {
      this.readyCbs.push(cb)
      if (errorCb) {
        this.readyErrorCbs.push(errorCb)
      }
    }
  }

  /**
   * 错误函数
   * 在index.js的onError方法中用到
   */
  onError (errorCb: Function) {
    this.errorCbs.push(errorCb)
  }

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
        // 触发跳转后的路由钩子afterEach
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

  /**
   * 确认过渡
   * @param {Route} route 解析后的跳转路由
   * @param {Function} onComplete 成功的回调
   * @param {Function} [onAbort] 失败的回调
   */
  confirmTransition (route: Route, onComplete: Function, onAbort?: Function) {
    // 当前跳转前的路由
    const current = this.current
    this.pending = route
  
    /**
     * 1. 定义终止路由跳转函数
     * @param {*} err 
     */
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
    // 2. 判断是否导航到相同的路由，如果是就终止导航
    if (
      isSameRoute(route, current) &&
      // in the case the route map has been dynamically appended to
      lastRouteIndex === lastCurrentIndex &&
      route.matched[lastRouteIndex] === current.matched[lastCurrentIndex]
    ) {
      this.ensureURL()
      return abort(createNavigationDuplicatedError(current, route))
    }

  
    /**
     * 3. 将需要执行的路由守卫，以及最后解析异步组件，存放到一个数组中
     */
    // 获取所有需要激活，更新，销毁的路由
    const { updated, deactivated, activated } = resolveQueue(
      this.current.matched,
      route.matched
    )
    // 获取所有需要执行的路由守卫
    const queue: Array<?NavigationGuard> = [].concat(
      // 1. 组件内部 beforeRouteLeave
      extractLeaveGuards(deactivated),
      // 2. 全部前置守卫 beforeEach
      this.router.beforeHooks,
      // 3. vue组件内部 beforeRouteUpdate
      extractUpdateHooks(updated),
      // 4. 路由配置里面的 beforeEnter
      activated.map(m => m.beforeEnter),
      // 5. 解析异步组件
      resolveAsyncComponents(activated)
    )

  
    /**
     * 4. 定义迭代器
     * @param {*} hook 定义全局/组件内部的路由钩子函数
     * @param {*} next 为renQueue内部的回调函数 ()=>{step(index+1)}，必须被执行
     */
    const iterator = (hook: NavigationGuard, next) => {
      if (this.pending !== route) {
        return abort(createNavigationCancelledError(current, route))
      }
      try {
        /**
         * hook为路由守卫等钩子函数，调用
         * hook统一传入三个参数（to, from, next）
         * 文档中的next参数是指(to: any) => {...}，与上面的next不同
         */
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
            // hook内部调用next时候，可以传入路径相关内容
            // 这时候就直接会转到改路径，类似于 -> redirect
            abort(createNavigationRedirectedError(current, route))
            // 如果有replace属性就调用replace方法，否则调用push方法
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

  
    /**
     * 5. 按照queue队列一个一个执行异步回调（迭代所有的路由守卫）
     * @param {*} queue 函数队列
     * @param {*} iterator 迭代器 参数1 queue[index] 参数二 next， next执行的时候 当前queue[index]执行完，进入下一个queue[index+1]
     * @param {*} function 迭代完成后的回调函数
     */
    runQueue(queue, iterator, () => {
      // wait until async components are resolved before
      // 在解析异步组件之前
      // extracting in-component enter guards
      // 6. 组件内部的 beforeRouteEnter
      const enterGuards = extractEnterGuards(activated)
      // 7. 全部的beforeResolve
      const queue = enterGuards.concat(this.router.resolveHooks)
      runQueue(queue, iterator, () => {
        if (this.pending !== route) {
          return abort(createNavigationCancelledError(current, route))
        }
        this.pending = null
        // 8. 导航被确认
        onComplete(route)
        if (this.router.app) {
          this.router.app.$nextTick(() => {
            // 9. 用创建好的实例调用 beforeRouteEnter 守卫中传给 next 的回调函数
            handleRouteEntered(route)
          })
        }
      })
    })
  }

  /**
   * 更新当前路由
   */
  updateRoute (route: Route) {
    this.current = route
    this.cb && this.cb(route)
  }

  /**
   * 定义一个空函数，让子类重写
   */
  setupListeners () {
    // Default implementation is empty
  }

  /**
   * 重置操作
   */
  teardown () {
    // clean up event listeners
    // https://github.com/vuejs/vue-router/issues/2341
    this.listeners.forEach(cleanupListener => {
      cleanupListener()
    })
    this.listeners = []

    // reset current history route
    // https://github.com/vuejs/vue-router/issues/3294
    this.current = START
    this.pending = null
  }
}

/**
 * 规范化应用的根路径
 * @param {*} base 
 */
function normalizeBase (base: ?string): string {
  if (!base) {
    if (inBrowser) {
      // respect <base> tag
      // HTML <base> 元素 指定用于一个文档中包含的所有相对 URL 的根 URL。一份中只能有一个 <base> 元素
      const baseEl = document.querySelector('base')
      base = (baseEl && baseEl.getAttribute('href')) || '/'
      // strip full URL origin
      base = base.replace(/^https?:\/\/[^\/]+/, '')
    } else {
      base = '/'
    }
  }
  // make sure there's the starting slash
  // 确保有开始斜杠
  if (base.charAt(0) !== '/') {
    base = '/' + base
  }
  // remove trailing slash
  // 去除末尾斜杠
  return base.replace(/\/$/, '')
}

function resolveQueue (
  current: Array<RouteRecord>,
  next: Array<RouteRecord>
): {
  updated: Array<RouteRecord>,
  activated: Array<RouteRecord>,
  deactivated: Array<RouteRecord>
} {
  let i
  const max = Math.max(current.length, next.length)
  for (i = 0; i < max; i++) {
    if (current[i] !== next[i]) {
      break
    }
  }
  return {
    updated: next.slice(0, i),
    activated: next.slice(i),
    deactivated: current.slice(i)
  }
}

/**
 * 返回指定的数组内的路由钩子函数
 * @param {*} records 
 * @param {*} name 
 * @param {*} bind 
 * @param {*} reverse 
 * @returns 
 */
function extractGuards (
  records: Array<RouteRecord>,
  name: string,
  bind: Function,
  reverse?: boolean
): Array<?Function> {
  // records 就是一个数组RouterRecord类型元素组成的数组
  const guards = flatMapComponents(records, (def, instance, match, key) => {
    // 获取组件内对应的属性，这里就是组件内的路由钩子函数
    const guard = extractGuard(def, name)
    if (guard) {
      return Array.isArray(guard)
        ? guard.map(guard => bind(guard, instance, match, key))
        : bind(guard, instance, match, key)
    }
  })
  // 是否反转数组
  return flatten(reverse ? guards.reverse() : guards)
}

function extractGuard (
  def: Object | Function,
  key: string
): NavigationGuard | Array<NavigationGuard> {
  if (typeof def !== 'function') {
    // extend now so that global mixins are applied.
    def = _Vue.extend(def)
  }
  return def.options[key]
}

function extractLeaveGuards (deactivated: Array<RouteRecord>): Array<?Function> {
  return extractGuards(deactivated, 'beforeRouteLeave', bindGuard, true)
}

function extractUpdateHooks (updated: Array<RouteRecord>): Array<?Function> {
  return extractGuards(updated, 'beforeRouteUpdate', bindGuard)
}

function bindGuard (guard: NavigationGuard, instance: ?_Vue): ?NavigationGuard {
  if (instance) {
    return function boundRouteGuard () {
      // 内置钩子的context设置为所在的vue实例
      return guard.apply(instance, arguments)
    }
  }
}

/**
 * 
 * @param {*} activated 激活的组件
 */
function extractEnterGuards (
  activated: Array<RouteRecord>
): Array<?Function> {
  return extractGuards(
    activated,
    'beforeRouteEnter',
    // 此回调函数会处理提取的原始钩子函数
    (guard, _, match, key) => {
      return bindEnterGuard(guard, match, key)
    }
  )
}

/**
 * 获取到vue的实例对象
 * @param {*} guard 为用户自定义的路由钩子函数
 * @param {*} match 
 * @param {*} key 
 */
function bindEnterGuard (
  guard: NavigationGuard,
  match: RouteRecord,
  key: string
): NavigationGuard {
  // 这里相当于做了一层wrapped
  // guard是用户自定义的路由钩子，针对路由钩子的第三个参数next可以使用next(vm=>{...})
  return function routeEnterGuard (to, from, next) {
    // 在runQueue异步执行的时候，会执行routeEnterGuard再调用用户自定义的
    // 但是这里的用户在next中传入的cb被保留到了cbs数组中
    // 等到视图渲染之后在调用
    return guard(to, from, cb => {
      if (typeof cb === 'function') {
        if (!match.enteredCbs[key]) {
          match.enteredCbs[key] = []
        }
        match.enteredCbs[key].push(cb)
      }
      next(cb)
    })
  }
}
