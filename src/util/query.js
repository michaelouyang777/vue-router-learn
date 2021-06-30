/* @flow */

import { warn } from './warn'

const encodeReserveRE = /[!'()*]/g
const encodeReserveReplacer = c => '%' + c.charCodeAt(0).toString(16)
const commaRE = /%2C/g

// fixed encodeURIComponent which is more conformant to RFC3986:
// - escapes [!'()*]
// - preserve commas
const encode = str =>
  encodeURIComponent(str)
    .replace(encodeReserveRE, encodeReserveReplacer)
    .replace(commaRE, ',')

export function decode (str: string) {
  try {
    return decodeURIComponent(str)
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      warn(false, `Error decoding "${str}". Leaving it intact.`)
    }
  }
  return str
}

/**
 * 查询参数
 *
 * @param {?string} query
 * @param {Dictionary<string>} [extraQuery={}]
 * @param {Function} [_parseQuery]
 * @returns {Dictionary<string>} 
 */
export function resolveQuery (
  query: ?string,
  extraQuery: Dictionary<string> = {},
  _parseQuery: ?Function
): Dictionary<string> {
  const parse = _parseQuery || parseQuery
  let parsedQuery
  try {
    parsedQuery = parse(query || '')
  } catch (e) {
    process.env.NODE_ENV !== 'production' && warn(false, e.message)
    parsedQuery = {}
  }
  for (const key in extraQuery) {
    const value = extraQuery[key]
    parsedQuery[key] = Array.isArray(value)
      ? value.map(castQueryParamValue)
      : castQueryParamValue(value)
  }
  return parsedQuery
}

const castQueryParamValue = value => (value == null || typeof value === 'object' ? value : String(value))

/**
 * 解析查询参数
 *
 * @param {string} query
 * @returns {Dictionary<string>}
 */
function parseQuery (query: string): Dictionary<string> {
  const res = {}

  // 匹配 ？、#、& 开头的字符串 如：'?id=1'.match(/^(\?|#|&)/) => ["?", "?", index: 0, input: "?id=1", groups: undefined]
  // '?id=1&name=cllemon'.replace(/^(\?|#|&)/, '') => id=1&name=cllemon
  query = query.trim().replace(/^(\?|#|&)/, '')

  if (!query) {
    return res
  }

  // 如上例： => ["id=1", "name=cllemon"]
  query.split('&').forEach(param => {
    // 匹配 ”+“
    // 如上例："id=1" => ["id", "1"]
    const parts = param.replace(/\+/g, ' ').split('=')
    // 如上例：["id", "1"] => 'id'
    // 解码由 decode 等于 decodeURIComponent() 方法用于 encodeURIComponent 方法或者其它类似方法编码的部分统一资源标识符（URI）。
    const key = decode(parts.shift())
    // 如上例：["1"]
    const val = parts.length > 0 ? decode(parts.join('=')) : null

    if (res[key] === undefined) {
      res[key] = val
    } else if (Array.isArray(res[key])) {
      res[key].push(val)
    } else {
      res[key] = [res[key], val]
    }
  })

  return res
}

export function stringifyQuery (obj: Dictionary<string>): string {
  const res = obj
    ? Object.keys(obj)
      .map(key => {
        const val = obj[key]

        if (val === undefined) {
          return ''
        }

        if (val === null) {
          return encode(key)
        }

        if (Array.isArray(val)) {
          const result = []
          val.forEach(val2 => {
            if (val2 === undefined) {
              return
            }
            if (val2 === null) {
              result.push(encode(key))
            } else {
              result.push(encode(key) + '=' + encode(val2))
            }
          })
          return result.join('&')
        }

        return encode(key) + '=' + encode(val)
      })
      .filter(x => x.length > 0)
      .join('&')
    : null
  return res ? `?${res}` : ''
}
