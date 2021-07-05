/* @flow */

/**
 * 执行队列
 * @param {Array<?NavigationGuard>} queue 队列
 * @param {Function} fn 迭代器
 * @param {Function} cb 
 */
export function runQueue (queue: Array<?NavigationGuard>, fn: Function, cb: Function) {
  const step = index => {
    if (index >= queue.length) {
      cb()
    } else {
      if (queue[index]) {
        fn(queue[index], () => {
          step(index + 1)
        })
      } else {
        step(index + 1)
      }
    }
  }
  step(0)
}
