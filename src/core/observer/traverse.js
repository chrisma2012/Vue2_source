/* @flow */

import { _Set as Set, isObject } from '../util/index'
import type { SimpleSet } from '../util/index'
import VNode from '../vdom/vnode'

const seenObjects = new Set()

/**
 * 递归遍历对象以唤起所有转换后的 getter，以便对象中的每个嵌套属性
  被收集为“深度”依赖项
 * Recursively traverse an object to evoke all converted
 * getters, so that every nested property inside the object
 * is collected as a "deep" dependency.
 */
export function traverse (val: any) {
  _traverse(val, seenObjects)
  seenObjects.clear()
}

function _traverse (val: any, seen: SimpleSet) {
  let i, keys
  const isA = Array.isArray(val)
  //不是数组的、不是对象的、被冻结对象、VNode节点直接退出
  if ((!isA && !isObject(val)) || Object.isFrozen(val) || val instanceof VNode) {
    return
  }
  if (val.__ob__) {
    const depId = val.__ob__.dep.id
    //如果该对象已被依赖收集则直接退出
    if (seen.has(depId)) {
      return
    }
    seen.add(depId)
  }
  
  //val是数组则遍历全部元素
  if (isA) {
    i = val.length
    while (i--) _traverse(val[i], seen)
  } else {  //val是对象
    keys = Object.keys(val)
    i = keys.length
    while (i--) _traverse(val[keys[i]], seen)
  }
}
