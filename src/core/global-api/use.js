/* @flow */

import { toArray } from '../util/index'

export function initUse(Vue: GlobalAPI) {
  Vue.use = function (plugin: Function | Object) {
    //将this._installedPlugins赋值给installedPlugins，如果_installedPlugins还未定义，则用
    //[]初始化
    const installedPlugins = (this._installedPlugins || (this._installedPlugins = []))
    //如果传入的插件已经安装，直接返回
    if (installedPlugins.indexOf(plugin) > -1) {
      return this
    }

    // additional parameters
    const args = toArray(arguments, 1)
    //将当前vue实例也push进参数
    args.unshift(this)
    //判断plugin的install属性师傅为function
    if (typeof plugin.install === 'function') {
      plugin.install.apply(plugin, args)
    } else if (typeof plugin === 'function') {
      plugin.apply(null, args)

    }
    installedPlugins.push(plugin)
    return this
  }
}
