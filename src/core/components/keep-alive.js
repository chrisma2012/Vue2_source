/* @flow */

import { isRegExp, remove } from 'shared/util'
import { getFirstComponentChild } from 'core/vdom/helpers/index'

type CacheEntry = {
  name: ?string;
  tag: ?string;
  componentInstance: Component;
};

type CacheEntryMap = { [key: string]: ?CacheEntry };

function getComponentName(opts: ?VNodeComponentOptions): ?string {
  return opts && (opts.Ctor.options.name || opts.tag)
}

//判断传入的值是否有命中，支持数组、字符串、正则格式。
function matches(pattern: string | RegExp | Array<string>, name: string): boolean {
  if (Array.isArray(pattern)) {
    return pattern.indexOf(name) > -1
  } else if (typeof pattern === 'string') {
    return pattern.split(',').indexOf(name) > -1
  } else if (isRegExp(pattern)) {
    return pattern.test(name)
  }
  /* istanbul ignore next */
  return false
}

function pruneCache(keepAliveInstance: any, filter: Function) {
  const { cache, keys, _vnode } = keepAliveInstance
  for (const key in cache) {
    const entry: ?CacheEntry = cache[key]
    if (entry) {
      const name: ?string = entry.name
      //遍历当前keep-alive组件上的cache映射，将名字不符合规则的组件移除
      if (name && !filter(name)) {
        pruneCacheEntry(cache, key, keys, _vnode)
      }
    }
  }
}

function pruneCacheEntry(
  cache: CacheEntryMap,
  key: string,
  keys: Array<string>,
  current?: VNode
) {
  const entry: ?CacheEntry = cache[key]
  //如果映射缓存中存在目标组件实例，并且不是当前活动组件，则销毁该组件
  if (entry && (!current || entry.tag !== current.tag)) {
    entry.componentInstance.$destroy()
  }
  cache[key] = null
  remove(keys, key)
}

const patternTypes: Array<Function> = [String, RegExp, Array]


//导出的格式为标准的vue组件格式。即keep-alive组件
export default {
  name: 'keep-alive',
  abstract: true, //抽象组件，不会被渲染到真实DOM中，也不会出现在父组件链中。

  props: {
    include: patternTypes,
    exclude: patternTypes,
    max: [String, Number]
  },

  methods: {
    cacheVNode() {
      const { cache, keys, vnodeToCache, keyToCache } = this
      // 存储新的路由组件
      if (vnodeToCache) {
        const { tag, componentInstance, componentOptions } = vnodeToCache
        cache[keyToCache] = {
          name: getComponentName(componentOptions),
          tag,
          componentInstance,
        }
        keys.push(keyToCache)
        // prune oldest entry
        //根据设置的max属性，裁剪cache缓存数组大小
        if (this.max && keys.length > parseInt(this.max)) {
          pruneCacheEntry(cache, keys[0], keys, this._vnode)
        }
        this.vnodeToCache = null
      }
    }
  },

  created() {
    //keep-alive组件状态初始化
    this.cache = Object.create(null)
    this.keys = []
  },

  destroyed() {
    //销毁CacheEntryMap的所有组件
    for (const key in this.cache) {
      pruneCacheEntry(this.cache, key, this.keys)
    }
  },

  mounted() {
    //缓存并刷新vnode组件
    this.cacheVNode()
    //监听include、exclude等props，如果值发生了变化，则重新对cache缓存的vnode比较，
    //移除不存在指定列表里的vnode组件
    this.$watch('include', val => {
      pruneCache(this, name => matches(val, name))
    })
    this.$watch('exclude', val => {
      pruneCache(this, name => !matches(val, name))
    })
  },

  updated() {
    //缓存并刷新vnode组件
    this.cacheVNode()
  },

  render() {
    const slot = this.$slots.default
    const vnode: VNode = getFirstComponentChild(slot)
    const componentOptions: ?VNodeComponentOptions = vnode && vnode.componentOptions
    if (componentOptions) {
      // check pattern
      const name: ?string = getComponentName(componentOptions)
      const { include, exclude } = this
      //如果当前keep-alive的子组件名字不在included（或者在excluded内）,则直接返回vnode。
      //该vnode由getFirstComponentChild(slot)获得
      if (
        // not included
        (include && (!name || !matches(include, name))) ||
        // excluded
        (exclude && name && matches(exclude, name))
      ) {
        return vnode
      }

      const { cache, keys } = this
      const key: ?string = vnode.key == null
        // same constructor may get registered as different local components
        // so cid alone is not enough (#3269)
        ? componentOptions.Ctor.cid + (componentOptions.tag ? `::${componentOptions.tag}` : '')
        : vnode.key
      //如果映射缓存内有目标Vnode，
      if (cache[key]) {
        vnode.componentInstance = cache[key].componentInstance
        // make current key freshest
        // 从keys数组删除目标key，然后再重新push进去，保证目标key是在最前面的
        remove(keys, key)
        keys.push(key)
      } else {
        // delay setting the cache until update
        //通过设置vnodeToCache的值为vnode，然后在update阶段由watch监听的回调进行vnode收集。
        this.vnodeToCache = vnode
        this.keyToCache = key
      }
      // 将当前vnode的keepAlive状态置为true
      vnode.data.keepAlive = true
    }
    //为避免componentOptions为false，用slot && slot[0]进行兜底
    return vnode || (slot && slot[0])
  }
}
