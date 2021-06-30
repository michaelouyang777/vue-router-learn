/* @flow */
// 引入第三方库：路径转为正则
import Regexp from 'path-to-regexp'
import { cleanPath } from './util/path'
import { assert, warn } from './util/warn'

 /**
  * 创建路由映射表
  * 
  * @param {Array<RouteConfig>} routes 路由配置
  * @param {Array<string>} [oldPathList] 旧的路径列表
  * @param {Dictionary<RouteRecord>} [oldPathMap] 旧的路径映射表
  * @param {Dictionary<RouteRecord>} [oldNameMap] 旧的名称映射表
  * @param {RouteRecord} [parentRoute] 父路由的RouteRecord
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
  // $flow-disable-line
  const pathMap: Dictionary<RouteRecord> = oldPathMap || Object.create(null)
  // 路由名称与路由记录的映射表，表示name到RouteRecord的映射关系
  // $flow-disable-line
  const nameMap: Dictionary<RouteRecord> = oldNameMap || Object.create(null)

  // 遍历routes，对每一项进行处理
  routes.forEach(route => {
    addRouteRecord(pathList, pathMap, nameMap, route, parentRoute)
  })

  // ensure wildcard routes are always at the end
  // 确保通配符路由始终位于末尾
  for (let i = 0, l = pathList.length; i < l; i++) {
    if (pathList[i] === '*') {
      pathList.push(pathList.splice(i, 1)[0])
      l--
      i--
    }
  }

  if (process.env.NODE_ENV === 'development') {
    // warn if routes do not include leading slashes
    const found = pathList
    // check for missing leading slash
      .filter(path => path && path.charAt(0) !== '*' && path.charAt(0) !== '/')

    if (found.length > 0) {
      const pathNames = found.map(path => `- ${path}`).join('\n')
      warn(false, `Non-nested routes must include a leading slash character. Fix the following routes: \n${pathNames}`)
    }
  }

  return {
    pathList, // 路径列表
    pathMap,  // 路径映射表
    nameMap   // 名称映射表
  }
}

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
  // 解构路径和名称，若路径不存在，则抛出异常
  const { path, name } = route

  if (process.env.NODE_ENV !== 'production') {
    assert(path != null, `"path" is required in a route configuration.`)
    assert(
      typeof route.component !== 'string',
      `route config "component" for path: ${String(
        path || name
      )} cannot be a ` + `string id. Use an actual component instead.`
    )

    warn(
      // eslint-disable-next-line no-control-regex
      !/[^\u0000-\u007F]+/.test(path),
      `Route with path "${path}" contains unencoded characters, make sure ` +
        `your path is correctly encoded before passing it to the router. Use ` +
        `encodeURI to encode static segments of your path.`
    )
  }

  // 路径转正则的配置
  const pathToRegexpOptions: PathToRegexpOptions = route.pathToRegexpOptions || {}
  // 规范化路由路径
  const normalizedPath = normalizePath(path, parent, pathToRegexpOptions.strict)

  if (typeof route.caseSensitive === 'boolean') {
    pathToRegexpOptions.sensitive = route.caseSensitive
  }

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

  // 是否存在别名置项 string | Array<string>
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
