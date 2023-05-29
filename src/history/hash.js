/* @flow */

import type Router from '../index'
import { History } from './base'
import { cleanPath } from '../util/path'
import { getLocation } from './html5'
import { setupScroll, handleScroll } from '../util/scroll'
import { pushState, replaceState, supportsPushState } from '../util/push-state'

export class HashHistory extends History {
  constructor (router: Router, base: ?string, fallback: boolean) {
    super(router, base)
    // 如果是回退hash的情况，并且判断当前路径是否有/#/。如果没有将会添加'/#/'
    if (fallback && checkFallback(this.base)) {
      return
    }
    // 保证 hash 值以/开头，如果没有则开头添加/
    ensureSlash()
  }

  /**
   * 重写父类监听方法
   * - 监听'popstate' / 'hashchange' 事件，执行对应的内容
   * - 记录lister，并对函数进行容错处理
   */
  setupListeners() {
    // 1. 如果存在监听队列，则return
    if (this.listeners.length > 0) {
      return
    }

    // 2. 获取当前路由
    const router = this.router

    const expectScroll = router.options.scrollBehavior
    const supportsScroll = supportsPushState && expectScroll
    if (supportsScroll) {
      this.listeners.push(setupScroll())
    }

    /**
     * 监听事件后的回调
     */
    const handleRoutingEvent = () => {
      const current = this.current
      if (!ensureSlash()) {
        return
      }
      this.transitionTo(getHash(), route => {
        // 如果支持history模式，并且存在scrollBehavior，则滚动到对应位置
        if (supportsScroll) {
          handleScroll(this.router, route, current, true)
        }
        // 如果不支持history模式，则替换hash
        if (!supportsPushState) {
          replaceHash(route.fullPath)
        }
      })
    }
    // 3. 如果支持history模式，则监听'popstate'事件，否则监听'hashchange'事件
    const eventType = supportsPushState ? 'popstate' : 'hashchange'
    window.addEventListener(
      eventType,
      handleRoutingEvent
    )

    // 4. 向listeners记录需要移除的事件
    this.listeners.push(() => {
      window.removeEventListener(eventType, handleRoutingEvent)
    })
  }

  /**
   * 向路由栈中添加一个路由对象，跳转路由
   * @param {*} location 路径
   * @param {*} onComplete 成功的回调
   * @param {*} onAbort 终止的回调
   */
  push (location: RawLocation, onComplete?: Function, onAbort?: Function) {
    const { current: fromRoute } = this
    this.transitionTo(
      location,
      route => {
        pushHash(route.fullPath)
        handleScroll(this.router, route, fromRoute, false)
        onComplete && onComplete(route)
      },
      onAbort
    )
  }

  /**
   * 向路由栈中添加一个路由对象，替换路由
   * @param {*} location 路径
   * @param {*} onComplete 成功的回调
   * @param {*} onAbort 终止的回调
   */
  replace (location: RawLocation, onComplete?: Function, onAbort?: Function) {
    const { current: fromRoute } = this
    this.transitionTo(
      location,
      route => {
        replaceHash(route.fullPath)
        handleScroll(this.router, route, fromRoute, false)
        onComplete && onComplete(route)
      },
      onAbort
    )
  }

  /**
   * 向前或向后转到该路由对象
   * @param {*} n 数字
   */
  go (n: number) {
    window.history.go(n)
  }

  /**
   * 如果不是当前的路由，则根据入参push来执行添加hash或替换hash
   */
  ensureURL (push?: boolean) {
    const current = this.current.fullPath
    if (getHash() !== current) {
      push ? pushHash(current) : replaceHash(current)
    }
  }

  /**
   * 获取“#”后面的hash
   */
  getCurrentLocation () {
    return getHash()
  }
}

/**
 * 检查url是否包含'/#/...'，存在则返回true
 * @param {*} base base uri 前缀
 */
function checkFallback(base) {
  // 获取路径
  const location = getLocation(base)
  // 如果location不是以/#，开头。添加/#，使用window.location.replace替换文档
  if (!/^\/#/.test(location)) {
    window.location.replace(cleanPath(base + '/#' + location))
    return true
  }
}

// 确保url是以/开头
function ensureSlash(): boolean {
  // 判断是否包含#，并获取hash值。如果url没有#，则返回‘’
  const path = getHash()
  // 判断path是否以/开头
  if (path.charAt(0) === '/') {
    return true
  }
  // 如果开头不是‘/’, 则添加/
  replaceHash('/' + path)
  return false
}

// 获取“#”后面的hash
export function getHash (): string {
  // We can't use window.location.hash here because it's not
  // consistent across browsers - Firefox will pre-decode it!
  let href = window.location.href
  const index = href.indexOf('#')
  // empty path
  if (index < 0) return ''

  href = href.slice(index + 1)

  return href
}

// getUrl返回了完整了路径，并且会添加#, 确保存在/#/
function getUrl (path) {
  const href = window.location.href
  const i = href.indexOf('#')
  const base = i >= 0 ? href.slice(0, i) : href
  return `${base}#${path}`
}

// 添加hash记录
function pushHash (path) {
  if (supportsPushState) {
    pushState(getUrl(path))
  } else {
    window.location.hash = path
  }
}

// 替换hash记录
function replaceHash(path) {
  // 如果运行环境支持history的API
  // 那么使用 history.replaceState 替换路由栈
  // 如果不支持，使用 window.location.replace 替换
  if (supportsPushState) {
    replaceState(getUrl(path))
  } else {
    window.location.replace(getUrl(path))
  }
}
