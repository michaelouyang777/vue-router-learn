/* @flow */

import type VueRouter from '../index'
import { parsePath, resolvePath } from './path'
import { resolveQuery } from './query'
import { fillParams } from './params'
import { warn } from './warn'
import { extend } from './misc'

/**
 * 规范化目标路由的链接
 * 
 * @param {RawLocation} raw 目标路由的链接
 * @param {Route} [current] 当前路由
 * @param {boolean} [append] 是否在当前 (相对) 路径前添加基路径
 * @param {VueRouter} [router] 
 */
export function normalizeLocation (
  raw: RawLocation,
  current: ?Route,
  append: ?boolean,
  router: ?VueRouter
): Location {
  // 处理目标路由的链接（to），支持多种写法
  // 'home'
  // { path: 'home' }
  // { path: `/user/${userId}` }
  // { name: 'user', params: { userId: 123 }}
  // { path: 'register', query: { plan: 'private' }}
  let next: Location = typeof raw === 'string' ? { path: raw } : raw
  // named target
  // 若已经被规范化直接返回 next
  if (next._normalized) {
    return next
  } 
  // 如果存在name属性
  else if (next.name) {
    next = extend({}, raw)
    const params = next.params
    if (params && typeof params === 'object') {
      next.params = extend({}, params)
    }
    return next
  }

  // relative params
  if (!next.path && next.params && current) {
    next = extend({}, next)
    next._normalized = true
    const params: any = extend(extend({}, current.params), next.params)
    if (current.name) {
      next.name = current.name
      next.params = params
    } else if (current.matched.length) {
      const rawPath = current.matched[current.matched.length - 1].path
      next.path = fillParams(rawPath, params, `path ${current.path}`)
    } else if (process.env.NODE_ENV !== 'production') {
      warn(false, `relative params navigation requires a current route.`)
    }
    return next
  }

  // 解析路径 返回 { path, query, hash }
  const parsedPath = parsePath(next.path || '')
  // current.path - 字符串，对应当前路由的路径，总是解析为绝对路径
  const basePath = (current && current.path) || '/'
  // 获取最终路径地址
  const path = parsedPath.path
    ? resolvePath(parsedPath.path, basePath, append || next.append)
    : basePath

  // 获取查询参数
  const query = resolveQuery(
    parsedPath.query,
    next.query,
    router && router.options.parseQuery
  )

  // 当前路由的 hash 值 (带 #) ，如果没有 hash 值，则为空字符串
  let hash = next.hash || parsedPath.hash
  if (hash && hash.charAt(0) !== '#') {
    hash = `#${hash}`
  }

  return {
    _normalized: true,
    path,
    query,
    hash
  }
}
