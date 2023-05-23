/* @flow */

import { createRoute, isSameRoute, isIncludedRoute } from '../util/route'
import { extend } from '../util/misc'
import { normalizeLocation } from '../util/location'
import { warn } from '../util/warn'

// work around weird flow bug
const toTypes: Array<Function> = [String, Object]
const eventTypes: Array<Function> = [String, Array]

const noop = () => {}

let warnedCustomSlot
let warnedTagProp
let warnedEventProp

export default {
  name: 'RouterLink',
  props: {
    // 目标路由
    to: {
      type: toTypes,
      required: true
    },
    // 渲染的标签元素
    tag: {
      type: String,
      default: 'a'
    },
    custom: Boolean,
    // 精准匹配
    exact: Boolean,
    exactPath: Boolean,
    append: Boolean,
    replace: Boolean,
    // 定义激活时的类名
    activeClass: String,
    // 定义精准匹配后激活的类名
    exactActiveClass: String,
    ariaCurrentValue: {
      type: String,
      default: 'page'
    },
    // 添加的dom事件
    event: {
      type: eventTypes,
      default: 'click'
    }
  },
  // h为this.$createElement，会注入到组件内
  render(h: Function) {
    // VueRouter实例
    const router = this.$router
    // 当前路由
    const current = this.$route
    // 解析 to 的路径对应路由项
    // router.resolve方法核心是调用match方法
    const { location, route, href } = router.resolve(
      this.to,
      current,
      this.append
    )

    const classes = {}
    // 用户自定义的点击激活后的类
    const globalActiveClass = router.options.linkActiveClass
    // 用户自定义的点击精准匹配 激活后的类
    const globalExactActiveClass = router.options.linkExactActiveClass
    // Support global empty active class
    // 激活类降级 用户没有定义就使用默认值
    const activeClassFallback =
      globalActiveClass == null ? 'router-link-active' : globalActiveClass
    // 精准匹配激活类降价 用户没有定义就使用默认值
    const exactActiveClassFallback =
      globalExactActiveClass == null
        ? 'router-link-exact-active'
        : globalExactActiveClass
    // 在父组件内也可以定义
    // 权重优先级 组件内 > 全局设置
    const activeClass =
      this.activeClass == null ? activeClassFallback : this.activeClass
    const exactActiveClass =
      this.exactActiveClass == null
        ? exactActiveClassFallback
        : this.exactActiveClass
    
    // 根据当前路由设置当前对象
    // 跳转到目的地路由
    const compareTarget = route.redirectedFrom
      ? createRoute(null, normalizeLocation(route.redirectedFrom), null, router)
      : route

    // 如果严格模式的话 就判断是否是相同路由（path query params hash）
    // 否则就走包含逻辑（path包含，query包含 hash为空或者相同）
    classes[exactActiveClass] = isSameRoute(current, compareTarget, this.exactPath)
    classes[activeClass] = this.exact || this.exactPath
      ? classes[exactActiveClass]
      : isIncludedRoute(current, compareTarget)

    const ariaCurrentValue = classes[exactActiveClass] ? this.ariaCurrentValue : null
    
    // 事件处理函数
    const handler = e => {
      if (guardEvent(e)) {
        // 路由replace触发改变router-view
        if (this.replace) {
          router.replace(location, noop)
        }
        // 路由push触发改变router-view
        else {
          router.push(location, noop)
        }
      }
    }

    // 事件对象
    // guardEvent 阻止一些组合操作
    const on = { click: guardEvent }
    // this.event为外界传入的 默认为click
    // 所以上方的guardEvent会被覆盖
    if (Array.isArray(this.event)) {
      this.event.forEach(e => {
        on[e] = handler
      })
    } else {
      on[this.event] = handler
    }

    // 添加元素的类
    const data: any = { class: classes }

    // 作用域插槽，只支持name为default的插槽
    // 作用域插槽的组件用函数包裹了，因此可以传参props
    // 这里的props是子组件内部的数据
    const scopedSlot =
      !this.$scopedSlots.$hasNormal &&
      this.$scopedSlots.default &&
      this.$scopedSlots.default({
        href,
        route,
        navigate: handler,
        isActive: classes[activeClass],
        isExactActive: classes[exactActiveClass]
      })

    // 作用域插槽只能获取href, route, navigate, isActive, isExactActive这五个值
    // 默认返回<span>标签包括的元素
    // https://router.vuejs.org/zh/api/#router-link
    if (scopedSlot) {
      if (process.env.NODE_ENV !== 'production' && !this.custom) {
        !warnedCustomSlot && warn(false, 'In Vue Router 4, the v-slot API will by default wrap its content with an <a> element. Use the custom prop to remove this warning:\n<router-link v-slot="{ navigate, href }" custom></router-link>\n')
        warnedCustomSlot = true
      }
      if (scopedSlot.length === 1) {
        return scopedSlot[0]
      } else if (scopedSlot.length > 1 || !scopedSlot.length) {
        if (process.env.NODE_ENV !== 'production') {
          warn(
            false,
            `<router-link> with to="${
              this.to
            }" is trying to use a scoped slot but it didn't provide exactly one child. Wrapping the content with a span element.`
          )
        }
        return scopedSlot.length === 0 ? h() : h('span', {}, scopedSlot)
      }
    }
    
    if (process.env.NODE_ENV !== 'production') {
      if ('tag' in this.$options.propsData && !warnedTagProp) {
        warn(
          false,
          `<router-link>'s tag prop is deprecated and has been removed in Vue Router 4. Use the v-slot API to remove this warning: https://next.router.vuejs.org/guide/migration/#removal-of-event-and-tag-props-in-router-link.`
        )
        warnedTagProp = true
      }
      if ('event' in this.$options.propsData && !warnedEventProp) {
        warn(
          false,
          `<router-link>'s event prop is deprecated and has been removed in Vue Router 4. Use the v-slot API to remove this warning: https://next.router.vuejs.org/guide/migration/#removal-of-event-and-tag-props-in-router-link.`
        )
        warnedEventProp = true
      }
    }

    // 没有作用域插槽就根据tag标签做处理，tag默认为a
    if (this.tag === 'a') {
      // 添加回调函数，这里创建的是真实元素
      // 在vue中data.on给了$listeners, data.nativeOn的值给了data.on
      data.on = on
      // 添加href属性
      data.attrs = { href, 'aria-current': ariaCurrentValue }
    } else {
      // find the first <a> child and apply listener and href
      // 如果没有a标签就寻找 普通默认插槽的第一个子标签为a的标签
      const a = findAnchor(this.$slots.default)
      if (a) {
        // in case the <a> is a static node
        // 这里主要是对a标签，做新增事件处理
        a.isStatic = false
        const aData = (a.data = extend({}, a.data))
        aData.on = aData.on || {}
        // transform existing events in both objects into arrays so we can push later
        // 处理a标签的事件（用数组保存），便于后续处理
        for (const event in aData.on) {
          const handler = aData.on[event]
          if (event in on) {
            aData.on[event] = Array.isArray(handler) ? handler : [handler]
          }
        }
        // append new listeners for router-link
        // 添加新的事件
        for (const event in on) {
          if (event in aData.on) {
            // on[event] is always a function
            aData.on[event].push(on[event])
          } else {
            aData.on[event] = handler
          }
        }

        const aAttrs = (a.data.attrs = extend({}, a.data.attrs))
        aAttrs.href = href
        aAttrs['aria-current'] = ariaCurrentValue
      } else {
        // doesn't have <a> child, apply listener to self
        // 找不到子标签a，就给data添加on回调，创建对应的元素
        data.on = on
      }
    }
    // 渲染router-link
    return h(this.tag, data, this.$slots.default)
  }
}

function guardEvent (e) {
  // don't redirect with control keys
  // 忽略带有功能键的点击
  if (e.metaKey || e.altKey || e.ctrlKey || e.shiftKey) return
  // don't redirect when preventDefault called
  // 已阻止的返回
  if (e.defaultPrevented) return
  // don't redirect on right click
  // 右击
  if (e.button !== undefined && e.button !== 0) return
  // don't redirect if `target="_blank"`
  // `target="_blank"` 忽略
  if (e.currentTarget && e.currentTarget.getAttribute) {
    const target = e.currentTarget.getAttribute('target')
    if (/\b_blank\b/i.test(target)) return
  }
  // this may be a Weex event which doesn't have this method
  // 阻止默认行为 防止跳转
  if (e.preventDefault) {
    e.preventDefault()
  }
  return true
}

// 找到第一个A标签
function findAnchor (children) {
  if (children) {
    let child
    for (let i = 0; i < children.length; i++) {
      child = children[i]
      if (child.tag === 'a') {
        return child
      }
      if (child.children && (child = findAnchor(child.children))) {
        return child
      }
    }
  }
}
