# 状态面板自定义尺寸功能 · 实现方案

## 文件清单

| 文件 | 操作 |
|------|------|
| `routes/ui.js` | 修改 GET /api/config 和 POST /api/config 增加尺寸字段 |
| `assets/settings.js` | 增加宽高滑块 UI + 拖动预览逻辑 + 持久化保存 |
| `assets/widget.bundle.js` | 增加：加载时从 config 读尺寸 → 调用 `hana.ui.resize` 应用 |
| `plugin-data/san-status-panel/config.json` | 新增字段，自动创建 |

## 数据模型

在 `config.json` 中新增：

```json
{
  "panelWidth": 300,
  "panelHeight": 420
}
```

单位：像素。`panelWidth` 下限 200，上限不超过 Hana 侧栏（建议 400）。
`panelHeight` 下限 200，上限不限（Hana 处理滚动）。

默认值应与当前面板的默认渲染尺寸一致（300 宽 × 420 高）。

## 后端改动（routes/ui.js）

### GET /api/config 增加返回值

在现有 JSON 里加两行：

```javascript
panelWidth: cfg.panelWidth || 300,
panelHeight: cfg.panelHeight || 420,
```

### POST /api/config 不需要改

已有的 `Object.assign(cfg, body)` 会自动合并新字段，无需额外代码。

## 前端改动：设置面板（settings.js）

### 1. 在设置面板的「显示」分组里加两个滑块

区域参考现有代码中的「卡片透明度」滑块的位置。HTML 结构（在 HTML 模板的 settings-panel 里加）：

```html
<div class="setting-item">
  <span>面板宽度</span>
  <div style="display:flex;align-items:center;gap:8px">
    <input type="range" id="widthSlider" class="slider" min="200" max="400" value="300">
    <span class="slider-value" id="widthValue">300px</span>
  </div>
</div>
<div class="setting-item">
  <span>面板高度</span>
  <div style="display:flex;align-items:center;gap:8px">
    <input type="range" id="heightSlider" class="slider" min="200" max="1000" value="420">
    <span class="slider-value" id="heightValue">420px</span>
  </div>
</div>
```

### 2. 加载时读配置值

在 `loadPanelConfig` 函数（处理 config.json 数据的回调）里加上：

```javascript
if (d.panelWidth) {
  document.getElementById("widthSlider").value = d.panelWidth;
  document.getElementById("widthValue").textContent = d.panelWidth + "px";
}
if (d.panelHeight) {
  document.getElementById("heightSlider").value = d.panelHeight;
  document.getElementById("heightValue").textContent = d.panelHeight + "px";
}
```

### 3. 滑块拖动时实时预览

在 settings.js 的初始化部分（约在设置面板的 gear 按钮 click handler 附近），给两个滑块加 `oninput` 事件：

```javascript
document.getElementById("widthSlider").oninput = function () {
  var w = parseInt(this.value);
  document.getElementById("widthValue").textContent = w + "px";
  // 预览：实时调整主面板容器的宽度
  var panel = document.getElementById("panelContainer"); // 或 .panel 的主元素
  if (panel) panel.style.width = w + "px";
  // 预览后通知 Hana 父窗口
  hana.ui.resize({ width: w });
};

document.getElementById("heightSlider").oninput = function () {
  var h = parseInt(this.value);
  document.getElementById("heightValue").textContent = h + "px";
  var panel = document.getElementById("panelContainer");
  if (panel) panel.style.height = h + "px";
  hana.ui.resize({ height: h });
};
```

### 4. 保存尺寸

可以在滑块拖动结束（`mouseup`）时自动保存，或者在设置面板已有的"保存/关闭"逻辑里加。

推荐做法：在 `oninput` 里加防抖保存：

```javascript
var sizeSaveTimer;
function savePanelSize() {
  clearTimeout(sizeSaveTimer);
  sizeSaveTimer = setTimeout(function () {
    var w = parseInt(document.getElementById("widthSlider").value);
    var h = parseInt(document.getElementById("heightSlider").value);
    fetch("/api/plugins/san-status-panel/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ panelWidth: w, panelHeight: h })
    }).catch(function(){});
  }, 500);
}

document.getElementById("widthSlider").oninput = function () {
  var w = parseInt(this.value);
  document.getElementById("widthValue").textContent = w + "px";
  applyPanelSize(w, null);
  savePanelSize();
};

document.getElementById("heightSlider").oninput = function () {
  var h = parseInt(this.value);
  document.getElementById("heightValue").textContent = h + "px";
  applyPanelSize(null, h);
  savePanelSize();
};
```

其中 `applyPanelSize` 负责修改 DOM + 通知 Hana 父窗口：

```javascript
function applyPanelSize(w, h) {
  var panel = document.querySelector(".panel");
  if (!panel) return;
  if (w) {
    panel.style.width = w + "px";
    hana.ui.resize({ width: w });
  }
  if (h) {
    panel.style.height = h + "px";
    hana.ui.resize({ height: h });
  }
}
```

### 5. 设置面板关闭后预览不重置

问：设置面板打开时调了尺寸，关闭后尺寸会回到默认吗？
答：如果滑块只改了 `panel.style.width` 的内联样式，不会丢失。但如果面板的 CSS 在 widget.bundle.js 的 `render()` 函数里每次被重新设置（比如 `render()` 里用固定值），那当 SSE 推送状态更新触发 `render()` 时尺寸可能被重置。

**解决方案**：在 `render()` 函数（widget.bundle.js 中）里，每次渲染时重新从配置读取尺寸并应用。在 widget.bundle.js 的开头或初始化处加：

```javascript
// 加载时从 config.json 读尺寸并应用
async function applyStoredSize() {
  try {
    var token = (function () {
      var m = (window.location.search || "").match(/[?&]token=([^&]+)/);
      return m ? decodeURIComponent(m[1]) : "";
    })();
    var url = "/api/plugins/san-status-panel/api/config";
    if (token) url += "?token=" + encodeURIComponent(token);
    var r = await fetch(url);
    var cfg = await r.json();
    if (cfg.panelWidth || cfg.panelHeight) {
      var panel = document.querySelector(".panel");
      if (panel) {
        if (cfg.panelWidth) panel.style.width = cfg.panelWidth + "px";
        if (cfg.panelHeight) panel.style.height = cfg.panelHeight + "px";
      }
      hana.ui.resize({
        width: cfg.panelWidth || 300,
        height: cfg.panelHeight || 420
      });
    }
  } catch (e) {}
}
```

在初始化和每次状态更新后调用此函数。

## 主题颜色跟随

不需要额外代码。当前面板的 CSS 已经使用 `var(--bg)` 作为背景色：

```css
body {
  background: var(--bg, #1a1a2e);
}
```

背景图片用 `background-size: cover` 覆盖时，覆盖不到的边缘区域自然露出 `var(--bg)`，自动跟随 Hana 主题颜色。前端 JS 无需额外处理。

## 预览机制

预览就是滑块拖动时直接改 DOM 的 style + 调用 `hana.ui.resize`。不需要单独的预览按钮或对话框。

效果：拖动宽度滑块时，面板宽度实时变化，Hana 侧栏立即响应。

## 约束与边界情况

1. **侧栏宽度上限由 Hana 决定**。如果 Hana 侧栏最大 320px，设 400px 也不会溢出，Hana 会截断或忽略。这是宿主行为，不是插件问题。
2. **高度不受上限**。Hana 侧栏可滚动。
3. **`hana.ui.resize` 可能被宿主忽略**。如果宿主拒绝改变尺寸，resize 调用不报错也不生效。预览效果可能只在插件 DOM 上可见（面板本身变了，但 iframe 没变）。
4. **初始加载时尺寸的时序**：config.json 的读取和面板渲染是异步的。第一次渲染时面板用默认 CSS 尺寸，config 读回来后调用 `applyStoredSize()` 更新。用户会看到面板从默认尺寸"跳"到配置尺寸的过程。如果介意这个闪烁，可以在 body 上加 `visibility:hidden` 直到尺寸应用完毕再显示。
5. **避免累加 resize 调用**。拖动滑块时 `oninput` 可能每秒触发几十次，每次调 `hana.ui.resize` 可能造成性能问题。建议用 `requestAnimationFrame` 节流：

```javascript
var resizeRAF;
function requestResize(w, h) {
  cancelAnimationFrame(resizeRAF);
  resizeRAF = requestAnimationFrame(function () {
    hana.ui.resize({ width: w, height: h });
  });
}
```

## 测试方法

1. 重启 Hana
2. 打开状态面板的齿轮设置
3. 找到宽度/高度滑块
4. 拖动 → 面板实时变化 → 松开 → 自动保存
5. 关闭设置面板
6. 关闭 widget，重新打开 → 尺寸保持在上次设置的值
7. 在 Hana 主题切换亮暗模式 → 面板未覆盖区域的背景色跟随变化
