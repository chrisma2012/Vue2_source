/* @flow */

import {
  warn,
  remove,
  isObject,
  parsePath,
  _Set as Set,
  handleError,
  invokeWithErrorHandling,
  noop
} from '../util/index'

import { traverse } from './traverse'
import { queueWatcher } from './scheduler'
import Dep, { pushTarget, popTarget } from './dep'

import type { SimpleSet } from '../util/index'

let uid = 0

/**
 * 观察器解析表达式，收集依赖，并在表达式的值发生变化时触发回调。
 * 用于$watch()和directives指令两者。
 * 
 * A watcher parses an expression, collects dependencies,
 * and fires callback when the expression value changes.
 * This is used for both the $watch() api and directives.
 */
export default class Watcher {
  vm: Component;
  expression: string;
  cb: Function;
  id: number;
  deep: boolean;
  user: boolean;
  lazy: boolean;
  sync: boolean;
  dirty: boolean;
  active: boolean;
  deps: Array<Dep>;
  newDeps: Array<Dep>;
  depIds: SimpleSet;
  newDepIds: SimpleSet;
  before: ?Function; 
  getter: Function;
  value: any;

  constructor(
    vm: Component,
    expOrFn: string | Function,
    cb: Function,
    options?: ?Object,
    isRenderWatcher?: boolean
  ) {
    this.vm = vm
    if (isRenderWatcher) {
      vm._watcher = this
    }
    vm._watchers.push(this)
    // options
    if (options) {
      this.deep = !!options.deep
      this.user = !!options.user
      this.lazy = !!options.lazy
      this.sync = !!options.sync
      this.before = options.before
    } else {
      this.deep = this.user = this.lazy = this.sync = false
    }
    this.cb = cb
    this.id = ++uid // uid for batching 用于批处理的UID
    this.active = true
    this.dirty = this.lazy // for lazy watchers
    this.deps = []
    this.newDeps = []
    this.depIds = new Set()
    this.newDepIds = new Set()
    this.expression = process.env.NODE_ENV !== 'production'
      ? expOrFn.toString()
      : ''
    // parse expression for getter 为getter解析表达式
    if (typeof expOrFn === 'function') {
      this.getter = expOrFn
    } else {
      // 如果不是函数，则调用parsePath函数处理expOrFn字符串。这里主要处理我们平时写的'a.b.c'这种场景
      this.getter = parsePath(expOrFn)
      if (!this.getter) {
        this.getter = noop
        // 如果getter为undefined，则直接将loop赋值给getter，并且在开发环境抛出异常，告诉开发者Watcher只接收点分割的path，如果想用全部的js语法，可以考虑使用函数。
        process.env.NODE_ENV !== 'production' && warn(
          `Failed watching path: "${expOrFn}" ` +
          'Watcher only accepts simple dot-delimited paths. ' +
          'For full control, use a function instead.',
          vm
        )
      }
    }
    // 如果lazy值为true，也就是computed Watcher，则将value的值设置为undefined，否则执行get获取初始值。
    // computed为惰性求值。
    this.value = this.lazy ? undefined : this.get()
  }

  /**
   * 计算getter，同时重新搜集依赖
   * Evaluate the getter, and re-collect dependencies.
   */
  get() {
    //     pushTarget定义在src / core / observer / dep.js
    // javascript复制代码const targetStack = []

    //     export function pushTarget(target: ?Watcher) {
    //       targetStack.push(target)
    //       Dep.target = target
    //     }


    // 这里是将当前的Watch push到targetStack数组中，并且把Dep.target设置为当前的Watcher
    // const targetStack = []
    // export function pushTarget (target: ?Watcher) {
    //   targetStack.push(target)
    //   Dep.target = target
    // }
    pushTarget(this)
    let value
    const vm = this.vm
    try {
      //此处执行时，Observer实例的dep会收集到当前watcher实例this
      value = this.getter.call(vm, vm)
    } catch (e) {
      if (this.user) {
        handleError(e, vm, `getter for watcher "${this.expression}"`)
      } else {
        throw e
      }
    } finally {
      // "touch"每一个属性，将其作为依赖深度追踪，用于深度监听
      // "touch" every property so they are all tracked as
      // dependencies for deep watching
      if (this.deep) {
        traverse(value)
      }
      popTarget()
       //求值完毕，清理Dep依赖收集器，准备下一次的依赖收集
      this.cleanupDeps()
    }
    return value
  }

  /**
   * 向此指令添加依赖项
   * Add a dependency to this directive.
   */
  addDep(dep: Dep) {
    const id = dep.id
    if (!this.newDepIds.has(id)) {
      this.newDepIds.add(id) 
      this.newDeps.push(dep)  //该watcher存储目标dep
      if (!this.depIds.has(id)) {
        dep.addSub(this) //dep存储该watcher
      }
    }
  }

  /**
   * 清理依赖项收集。
   * Clean up for dependency collection.
   */
  cleanupDeps() {
    let i = this.deps.length
    while (i--) {
      const dep = this.deps[i]
      if (!this.newDepIds.has(dep.id)) {
        dep.removeSub(this)
      }
    }
    let tmp = this.depIds
    this.depIds = this.newDepIds
    this.newDepIds = tmp
    this.newDepIds.clear()
    tmp = this.deps
    this.deps = this.newDeps
    this.newDeps = tmp
    this.newDeps.length = 0
  }

  /**
   * 订阅器接口。依赖发生变化时会被调用
   * Subscriber interface.
   * Will be called when a dependency changes.
   */
  update() {
    /* istanbul ignore else */
    if (this.lazy) {
      this.dirty = true
    } else if (this.sync) {
      this.run()
    } else {
      queueWatcher(this)
    }
  }

  /**
   * 调度程序作业接口。将由调度程序调用
   * Scheduler job interface.
   * Will be called by the scheduler.
   */
  run() {
    if (this.active) {
      const value = this.get()
      if (
        value !== this.value ||
        //深度观察器和Object/Arrays观察器应该被触发即便值是一样的，因为该值可能已经发生变异。
        // Deep watchers and watchers on Object/Arrays should fire even
        // when the value is the same, because the value may
        // have mutated.
        isObject(value) ||
        this.deep
      ) {
        // set new value 设置新值
        const oldValue = this.value
        this.value = value
        if (this.user) {
          const info = `callback for watcher "${this.expression}"`
          invokeWithErrorHandling(this.cb, this.vm, [value, oldValue], this.vm, info)
        } else {
          //得出结果，执行回调函数
          this.cb.call(this.vm, value, oldValue)
        }
      }
    }
  }

  /**
   * 计算观察器的值。
   * Evaluate the value of the watcher.
   * 这只适用于懒观察器。
   * This only gets called for lazy watchers.
   */
  evaluate() {
    this.value = this.get()
    this.dirty = false
  }

  /**
   * 取决于所有由这个观察器收集的依赖。
   * Depend on all deps collected by this watcher.
   */
  depend() {
    let i = this.deps.length
    while (i--) {
      this.deps[i].depend()
    }
  }

  /**
   * 从所有依赖项的订阅者列表中移除自身
   * Remove self from all dependencies' subscriber list.
   */
  teardown() {
    if (this.active) {
      // 从 VM 的观察者列表中删除自身
      // remove self from vm's watcher list
      // 这是一个有点昂贵的操作，所以如果vm正在被销毁的时候，我们可以跳过这个步骤
      // this is a somewhat expensive operation so we skip it
      // if the vm is being destroyed.
      if (!this.vm._isBeingDestroyed) {
        remove(this.vm._watchers, this)
      }
      let i = this.deps.length
      //从收集了该watcher依赖的所有deps中移除 该watcher
      while (i--) {
        this.deps[i].removeSub(this)
      }
      this.active = false
    }
  }
}
