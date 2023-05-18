/**
 * 导出处理之后的路径地址
 *
 * @param {string} relative 相对路径
 * @param {string} base 基础路径
 * @param {boolean} [append] 是否在当前 (相对) 路径前添加基路径
 * @returns {string}
 */
export function resolvePath (
  relative: string,
  base: string,
  append?: boolean
): string {
  const firstChar = relative.charAt(0)
  if (firstChar === '/') {
    return relative
  }

  if (firstChar === '?' || firstChar === '#') {
    return base + relative
  }

  const stack = base.split('/')

  // 删除后段如果：
  // - 没有附加
  // - 附加到尾随斜杠(最后一段为空)
  if (!append || !stack[stack.length - 1]) {
    stack.pop()
  }

  // resolve 相对路径
  // '/vue-router/releases'.replace(/^\//, '') => "vue-router/releases"
  // 'vue-router/releases'.split('/') => ["vue-router", "releases"]
  const segments = relative.replace(/^\//, '').split('/')
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    if (segment === '..') {
      stack.pop()
    } else if (segment !== '.') {
      stack.push(segment)
    }
  }

  // ensure leading slash
  // 确保领先的削减
  if (stack[0] !== '') {
    stack.unshift('')
  }

  return stack.join('/')
}

/**
 * 解析路径
 * @param {string} path
 * @returns {{
 *   path: string;
 *   query: string;
 *   hash: string;
 * }}
 */
export function parsePath (path: string): {
  path: string;
  query: string;
  hash: string;
} {
  let hash = ''
  let query = ''

  // 是否存在 #
  const hashIndex = path.indexOf('#')
  if (hashIndex >= 0) {
    hash = path.slice(hashIndex) // 截取 hash 值
    path = path.slice(0, hashIndex) // 截取路径
  }

  // 是否存在查询参数
  const queryIndex = path.indexOf('?')
  if (queryIndex >= 0) {
    query = path.slice(queryIndex + 1) // 截取参数
    path = path.slice(0, queryIndex) // 截取路径
  }

  return {
    path,
    query,
    hash
  }
}

// 将path中的 //, 替换为 /
export function cleanPath (path: string): string {
  return path.replace(/\/\//g, '/')
}
