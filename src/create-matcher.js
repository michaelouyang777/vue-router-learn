/* @flow */

/**
 * 该文件内处理的事情：
 *   进行路由地址到路由对象的转换、
 *   路由记录的映射、
 *   路由参数处理等操作
 */

import type VueRouter from './index'
import { resolvePath } from './util/path'
import { assert, warn } from './util/warn'
import { createRoute } from './util/route'
import { fillParams } from './util/params'
import { createRouteMap } from './create-route-map'
import { normalizeLocation } from './util/location'
import { decode } from './util/query'

/**
 * 声明Matcher对象
 * match：根据location匹配路由方法
 * addRoutes：注册路由方法
 * addRoute：注册单个路由的方法
 * getRoutes：获取routes对象
 */
export type Matcher = {
  match: (raw: RawLocation, current?: Route, redirectedFrom?: Location) => Route;
  addRoutes: (routes: Array<RouteConfig>) => void;
  addRoute: (parentNameOrRoute: string | RouteConfig, route?: RouteConfig) => void;
  getRoutes: () => Array<RouteRecord>;
};

/**
 * 路由匹配器
 * 进行路由地址到路由对象的转换、路由记录的映射、路由参数处理等操作
 * @param {Array<RouteConfig>} routes 路由配置
 * @param {VueRouter} router 路由实例
 * @return {Matcher}
 */
export function createMatcher (
  routes: Array<RouteConfig>,
  router: VueRouter
): Matcher {
  const { pathList, pathMap, nameMap } = createRouteMap(routes)

  /**
   * 将路由记录添加到matcher实例的路由映射中
   * @param {*} routes 
   */
  function addRoutes (routes) {
    createRouteMap(routes, pathList, pathMap, nameMap)
  }

  function addRoute (parentOrRoute, route) {
    const parent = (typeof parentOrRoute !== 'object') ? nameMap[parentOrRoute] : undefined
    // $flow-disable-line
    createRouteMap([route || parentOrRoute], pathList, pathMap, nameMap, parent)

    // add aliases of parent
    if (parent) {
      createRouteMap(
        // $flow-disable-line route is defined if parent is
        parent.alias.map(alias => ({ path: alias, children: [route] })),
        pathList,
        pathMap,
        nameMap,
        parent
      )
    }
  }

  function getRoutes () {
    return pathList.map(path => pathMap[path])
  }

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

  function redirect (
    record: RouteRecord,
    location: Location
  ): Route {
    const originalRedirect = record.redirect
    let redirect = typeof originalRedirect === 'function'
      ? originalRedirect(createRoute(record, location, null, router))
      : originalRedirect

    if (typeof redirect === 'string') {
      redirect = { path: redirect }
    }

    if (!redirect || typeof redirect !== 'object') {
      if (process.env.NODE_ENV !== 'production') {
        warn(
          false, `invalid redirect option: ${JSON.stringify(redirect)}`
        )
      }
      return _createRoute(null, location)
    }

    const re: Object = redirect
    const { name, path } = re
    let { query, hash, params } = location
    query = re.hasOwnProperty('query') ? re.query : query
    hash = re.hasOwnProperty('hash') ? re.hash : hash
    params = re.hasOwnProperty('params') ? re.params : params

    if (name) {
      // resolved named direct
      const targetRecord = nameMap[name]
      if (process.env.NODE_ENV !== 'production') {
        assert(targetRecord, `redirect failed: named route "${name}" not found.`)
      }
      return match({
        _normalized: true,
        name,
        query,
        hash,
        params
      }, undefined, location)
    } else if (path) {
      // 1. resolve relative redirect
      const rawPath = resolveRecordPath(path, record)
      // 2. resolve params
      const resolvedPath = fillParams(rawPath, params, `redirect route with path "${rawPath}"`)
      // 3. rematch with existing query and hash
      return match({
        _normalized: true,
        path: resolvedPath,
        query,
        hash
      }, undefined, location)
    } else {
      if (process.env.NODE_ENV !== 'production') {
        warn(false, `invalid redirect option: ${JSON.stringify(redirect)}`)
      }
      return _createRoute(null, location)
    }
  }

  function alias (
    record: RouteRecord,
    location: Location,
    matchAs: string
  ): Route {
    const aliasedPath = fillParams(matchAs, location.params, `aliased route with path "${matchAs}"`)
    const aliasedMatch = match({
      _normalized: true,
      path: aliasedPath
    })
    if (aliasedMatch) {
      const matched = aliasedMatch.matched
      const aliasedRecord = matched[matched.length - 1]
      location.params = aliasedMatch.params
      return _createRoute(aliasedRecord, location)
    }
    return _createRoute(null, location)
  }

  // 将外部传入的路由记录转换成统一的route对象
  function _createRoute (
    record: ?RouteRecord,
    location: Location,
    redirectedFrom?: Location
  ): Route {
    if (record && record.redirect) {
      return redirect(record, redirectedFrom || location)
    }
    if (record && record.matchAs) {
      return alias(record, location, record.matchAs)
    }
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

function matchRoute (
  regex: RouteRegExp,
  path: string,
  params: Object
): boolean {
  const m = path.match(regex)

  if (!m) {
    return false
  } else if (!params) {
    return true
  }

  for (let i = 1, len = m.length; i < len; ++i) {
    const key = regex.keys[i - 1]
    if (key) {
      // Fix #1994: using * with props: true generates a param named 0
      params[key.name || 'pathMatch'] = typeof m[i] === 'string' ? decode(m[i]) : m[i]
    }
  }

  return true
}

function resolveRecordPath (path: string, record: RouteRecord): string {
  return resolvePath(path, record.parent ? record.parent.path : '/', true)
}
