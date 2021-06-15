# vue-router 源码学习



## vue-router 研究版本
vue-router v3.5.1




## 目录结构

vue-router的主体目录结构如下：
~~~
src
├── components                      // 是两个组件<router-view> and <router-link> 的实现
│   ├── link.js
│   └── view.js
├── create-matcher.js               // 生成匹配表
├── create-route-map.js
├── history                         // 路由方式的封装
│   ├── abstract.js
│   ├── base.js
│   ├── errors.js
│   ├── hash.js
│   └── html5.js
├── index.js                        // 入口文件
├── install.js                      // 安装插件的方法
└── util                            // 各种功能类和功能函数
    ├── async.js
    ├── dom.js
    ├── location.js
    ├── misc.js
    ├── params.js
    ├── path.js
    ├── push-state.js
    ├── query.js
    ├── resolve-components.js
    ├── route.js
    ├── scroll.js
    ├── state-key.js
    └── warn.js
~~~




--------------------------------------




## 源码分析



