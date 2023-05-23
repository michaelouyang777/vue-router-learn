import { warn } from '../util/warn'
import { extend } from '../util/misc'
import { handleRouteEntered } from '../util/route'

export default {
  name: 'RouterView',
  functional: true,
  props: {
    name: {
      type: String,
      default: 'default'
    }
  },
  render (_, { props, children, parent, data }) {
    // used by devtools to display a router-view badge
    data.routerView = true

    // directly use parent context's createElement() function
    // so that components rendered by router-view can resolve named slots
    // 直接使用父组件上下文的createElement()函数
    const h = parent.$createElement
    // 组件上的name属性
    const name = props.name
    // 父组件的路由，即history.current
    // 取值，做了一次依赖手机，加入响应式系统
    const route = parent.$route
    // 做一层缓存
    const cache = parent._routerViewCache || (parent._routerViewCache = {})

    // determine current view depth, also check to see if the tree
    // has been toggled inactive but kept-alive.
    // 这个深度是为了解决路由嵌套问题而存在的，因此matched数组中record的排序是父到子
    let depth = 0
    let inactive = false
    // 从当前组件一直遍历到最外层的根组件app.vue
    // 解决router-view 嵌套问题
    while (parent && parent._routerRoot !== parent) {
      // 获取vnode的data
      const vnodeData = parent.$vnode ? parent.$vnode.data : {}
      // routerView属性标记当前vnode组件是否为一个路由组件
      if (vnodeData.routerView) {
        depth++
      }
      // 在keep-alive中非激活状态
      if (vnodeData.keepAlive && parent._directInactive && parent._inactive) {
        inactive = true
      }
      // 由内而外遍历
      parent = parent.$parent
    }
    data.routerViewDepth = depth

    // render previous view if the tree is inactive and kept-alive
    // 组件被keep-alive缓存了
    if (inactive) {
      // 读取缓存数据
      const cachedData = cache[name]
      // 读取缓存组件
      const cachedComponent = cachedData && cachedData.component
      if (cachedComponent) {
        // #2301
        // pass props
        if (cachedData.configProps) {
          fillPropsinData(cachedComponent, data, cachedData.route, cachedData.configProps)
        }
        // 渲染缓存的组件
        return h(cachedComponent, data, children)
      } else {
        // render previous empty view
        // 没有缓存的组件就渲染空组件
        return h()
      }
    }

    // matched是一个数组，获取matched的深度，也就是层级关系
    // matched本质上就是record对象
    const matched = route.matched[depth]
    // 因为只有record对象才有component
    // 对于没有name属性的routerView而言，name为default
    const component = matched && matched.components[name]

    // render empty node if no matched route or no config component
    // 找不到record或者没有对应的组件就清除缓存，并渲染空数组
    if (!matched || !component) {
      cache[name] = null
      return h()
    }

    // 缓存组件
    cache[name] = { component }

    // attach instance registration hook
    // this will be called in the instance's injected lifecycle hooks
    // beforeCreated生产周期内被调用，将组件实例保存在record对象中
    data.registerRouteInstance = (vm, val) => {
      // val could be undefined for unregistration
      const current = matched.instances[name]
      if (
        (val && current !== vm) ||
        (!val && current === vm)
      ) {
        matched.instances[name] = val
      }
    }

    // also register instance in prepatch hook
    // in case the same component instance is reused across different routes
    // prepatch hookd中注册回调函数，更新组件数据
    ;(data.hook || (data.hook = {})).prepatch = (_, vnode) => {
      matched.instances[name] = vnode.componentInstance
    }

    // register instance in init hook
    // in case kept-alive component be actived when routes changed
    // init hook 注册回调函数，init扣子在keep-alive激活的时候被调用
    // 更新数据
    data.hook.init = (vnode) => {
      if (vnode.data.keepAlive &&
        vnode.componentInstance &&
        vnode.componentInstance !== matched.instances[name]
      ) {
        matched.instances[name] = vnode.componentInstance
      }

      // if the route transition has already been confirmed then we weren't
      // able to call the cbs during confirmation as the component was not
      // registered yet, so we call it here.
      handleRouteEntered(route)
    }

    // record
    const configProps = matched.props && matched.props[name]
    // save route and configProps in cache
    if (configProps) {
      extend(cache[name], {
        route,
        configProps
      })
      fillPropsinData(component, data, route, configProps)
    }

    // 渲染组件
    return h(component, data, children)
  }
}

function fillPropsinData (component, data, route, configProps) {
  // resolve props
  let propsToPass = data.props = resolveProps(route, configProps)
  if (propsToPass) {
    // clone to prevent mutation
    propsToPass = data.props = extend({}, propsToPass)
    // pass non-declared props as attrs
    const attrs = data.attrs = data.attrs || {}
    for (const key in propsToPass) {
      if (!component.props || !(key in component.props)) {
        attrs[key] = propsToPass[key]
        delete propsToPass[key]
      }
    }
  }
}

function resolveProps (route, config) {
  switch (typeof config) {
    case 'undefined':
      return
    case 'object':
      return config
    case 'function':
      return config(route)
    case 'boolean':
      return config ? route.params : undefined
    default:
      if (process.env.NODE_ENV !== 'production') {
        warn(
          false,
          `props in "${route.path}" is a ${typeof config}, ` +
          `expecting an object, function or boolean.`
        )
      }
  }
}
