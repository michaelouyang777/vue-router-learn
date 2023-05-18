/* @flow */

import type Router from '../index'
import { History } from './base'
import { cleanPath } from '../util/path'
import { START } from '../util/route'
import { setupScroll, handleScroll } from '../util/scroll'
import { pushState, replaceState, supportsPushState } from '../util/push-state'

/**
 * h5 - history 模式
 */
export class HTML5History extends History {
  _startLocation: string

  constructor (router: Router, base: ?string) {
    // 调用父类，并传入VueRouter路由实例和基础路径
    super(router, base)
    // 获取根路径
    this._startLocation = getLocation(this.base)
  }

  setupListeners () {
    if (this.listeners.length > 0) {
      return
    }

    const router = this.router
    const expectScroll = router.options.scrollBehavior
    const supportsScroll = supportsPushState && expectScroll

    if (supportsScroll) {
      this.listeners.push(setupScroll())
    }

    const handleRoutingEvent = () => {
      const current = this.current

      // Avoiding first `popstate` event dispatched in some browsers but first
      // history route not updated since async guard at the same time.
      const location = getLocation(this.base)
      if (this.current === START && location === this._startLocation) {
        return
      }

      this.transitionTo(location, route => {
        if (supportsScroll) {
          handleScroll(router, route, current, true)
        }
      })
    }
    window.addEventListener('popstate', handleRoutingEvent)
    this.listeners.push(() => {
      window.removeEventListener('popstate', handleRoutingEvent)
    })
  }

  /**
   * 前进对应步数
   * @param {number} n 传入需要前进后退的数字
   */
  go (n: number) {
    // 通过history.go() 进行页面的跳转
    window.history.go(n)
  }

  /**
   * 导航到不同的 location 向 history 栈添加一个新的记录
   * @param {*} location 
   * @param {*} onComplete 
   * @param {*} onAbort 
   */
  push (location: RawLocation, onComplete?: Function, onAbort?: Function) {
    // 拿到当前路由对象
    const { current: fromRoute } = this
    // 调用跳转核心方法
    this.transitionTo(location, route => {
      pushState(cleanPath(this.base + route.fullPath))
      handleScroll(this.router, route, fromRoute, false)
      onComplete && onComplete(route)
    }, onAbort)
  }

  /**
   * 导航到不同的 location 替换掉当前的 history 记录
   * @param {*} location 
   * @param {*} onComplete 
   * @param {*} onAbort 
   */
  replace (location: RawLocation, onComplete?: Function, onAbort?: Function) {
    const { current: fromRoute } = this
    this.transitionTo(location, route => {
      replaceState(cleanPath(this.base + route.fullPath))
      handleScroll(this.router, route, fromRoute, false)
      onComplete && onComplete(route)
    }, onAbort)
  }

  /**
   * 更新 URL
   * @param {*} push 
   */
  ensureURL (push?: boolean) {
    if (getLocation(this.base) !== this.current.fullPath) {
      const current = cleanPath(this.base + this.current.fullPath)
      push ? pushState(current) : replaceState(current)
    }
  }

  /**
   * 获取根路径
   */
  getCurrentLocation (): string {
    return getLocation(this.base)
  }
}

/**
 * 获取路径
 * @param {*} base 
 * @returns 
 */
export function getLocation (base: string): string {
  // 路径
  let path = window.location.pathname
  // 如果传入的路径存在，并且传入的路径存在于location.pathname中
  if (base && path.toLowerCase().indexOf(base.toLowerCase()) === 0) {
    // 截取path后面部分
    path = path.slice(base.length)
  }
  // 返回组装的路径
  return (path || '/') + window.location.search + window.location.hash
}
