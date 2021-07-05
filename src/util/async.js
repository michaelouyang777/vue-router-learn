/* @flow */

/**
 * 执行队列
 * @param {Array<?NavigationGuard>} queue 队列
 * @param {Function} fn 迭代器
 * @param {Function} cb 回调函数
 */
export function runQueue (queue: Array<?NavigationGuard>, fn: Function, cb: Function) {
  // index为queue数组的index
  const step = index => {
    // 钩子函数执行完毕
    if (index >= queue.length) {
      cb()
    } else {
      // 挨个调用钩子函数
      if (queue[index]) {
        // 传入回调函数，在钩子函数执行完毕后再开启递归
        fn(queue[index], () => {
          step(index + 1)
        })
      } else {
        step(index + 1)
      }
    }
  }
  // 开始递归
  step(0)
}
