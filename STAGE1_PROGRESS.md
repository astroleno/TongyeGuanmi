# 阶段 1 进度：迁移根目录 ink（进行中）

## 已完成

1. ✅ 复制根目录 `ink-scene-transition.js` → `ink-scene-transition-root.js`
2. ✅ 备份当前 `split-scene-ink-transition.js`
3. ✅ 找到唯一使用点：`split-scene-bridge.js`

## 接口差异分析

### 根目录 createInkSceneTransition（WebGL）
```js
createInkSceneTransition(canvas, {
  targetSrc: 'url/to/image.png',  // 纹理 URL
  farOnly: false,
  hideAtEnd: false,
  colorLift: 0
});

// 返回
{
  render(progress, ...)
}
```

### 当前 createSplitSceneInkTransition（Canvas 2D）
```js
createSplitSceneInkTransition(canvas, {
  previousTexture: canvasOrElement,  // DOM 元素
  nextTexture: canvasOrElement,
  direction: 'down',
  seed: 1
});

// 返回
{
  update(progress, options)  // 实时采样 DOM → canvas
}
```

## 关键挑战

**split-scene-bridge 需要实时采样两个 DOM 纹理**：
- `previousProjection.layer`（前一幕的 DOM/canvas）
- `nextProjection.layer`（后一幕的 DOM/canvas）

**根目录 ink 只接受静态 URL**：
- 不支持实时采样 DOM

## 解决方案

### 方案 A：改造根目录 ink，支持 DOM 纹理
- 修改 WebGL shader，从 `gl.texImage2D(URL)` 改为 `gl.texImage2D(domElement)`
- 每帧 `update()` 时重新上传纹理

### 方案 B：预渲染 DOM → texture URL
- split-scene-bridge 在转场开始时，把两个 projection 渲染成 blob URL
- 传给根目录 ink

### 方案 C：混合方案
- 用根目录 ink 的 fbm shader
- 保留 split-scene-ink 的 Canvas 2D 纹理采样
- 只替换边界生成逻辑

## 推荐：方案 A

- 根目录 ink 的 shader 已经支持 `nextSceneElement`（看代码有这个参数）
- 可能只需要适配参数传递方式

## 下一步

1. 查看根目录 ink 的 `nextSceneElement` 参数如何使用
2. 确认是否支持实时 DOM 采样
3. 如果支持，直接适配 split-scene-bridge 的调用方式
4. 如果不支持，实现方案 A 的改造
