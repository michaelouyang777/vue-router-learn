import View from './components/view'
import Link from './components/link'

// 声明局部变量_Vue，并导出，供其他地方使用Vue对象
export let _Vue

/**
 * 声明install函数
 * @param {*} Vue 
 */
export function install (Vue) {
  // 判断是否已经加载过VueRouter，有则返回，防止插件被多次安装
  if (install.installed && _Vue === Vue) return
  // 设置标识installed为true，防止重复执行install
  install.installed = true
  // 将传入的Vue对象存入当前局部变量
  _Vue = Vue

  /**
   * 定义一个名为isDef的函数，用于判断一个值是否存在
   * @param {*} v 
   */
  const isDef = v => v !== undefined

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

  // 调用Vue的全局api mixin，添加生命周期扣子触发时机需要执行的逻辑，当应用执行全局new Vue()的时候会触发
  // TODO Q：这里使用了大量的this，分别是代表了什么？
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

  // 在 Vue 原型上添加 $router 属性( VueRouter )并代理到 this.$root._router
  Object.defineProperty(Vue.prototype, '$router', {
    get () { return this._routerRoot._router }
  })
  // 在 Vue 原型上添加 $route 属性( 当前路由对象 )并代理到 this.$root._route
  Object.defineProperty(Vue.prototype, '$route', {
    get () { return this._routerRoot._route }
  })

  // 定义全局组件
  Vue.component('RouterView', View)
  Vue.component('RouterLink', Link)

  const strats = Vue.config.optionMergeStrategies
  // use the same hook merging strategy for route hooks
  strats.beforeRouteEnter = strats.beforeRouteLeave = strats.beforeRouteUpdate = strats.created
}
