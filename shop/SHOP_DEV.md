# 小铺开发指引

## 文件位置

```
san-status-panel/
├── manifest.json          ← contributes.page 声明（导航栏按钮）
├── routes/shop.js          ← 后端路由（/shop 页面 + 商店 API）
└── shop/                   ← 小铺前端资源
    ├── shop.html           ← 页面结构（HTML）
    ├── shop.css            ← 样式（复用 Ardot 二次元 UI：奶油底+圆角白卡+粉彩阴影）
    ├── shop.js             ← 前端逻辑（获取 token、API 封装、渲染购买）
    └── assets/             ← 静态资源（仅作为内联源，不直接经 http 访问）
        ├── mora.png        ← 摩拉货币图标（128px）→ 内联为 data URI
        ├── category-fruit.jpg
        ├── category-meal.jpg
        ├── category-snack.jpg
        ├── category-drink.jpg  ← 四类动漫图标表 Banner（白底 JPEG，来自 Ardot 画布）
        └── icons/          ← 32 张商品图标（用户裁剪，<itemId>.png，图内自带名称标签）
```

## 已实现 API（前缀 /api/plugins/san-status-panel）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET  | /shop | 小铺页面（内联 CSS/JS 后返回） |
| GET  | /api/shop/items | 商品列表（~5KB）+ 分类，`image`/`img` 为 `/api/shop/image/...` 路径 |
| GET  | /api/shop/image/:id | 图片接口（`icon-<id>` = 商品 PNG / `cat-<id>` = Banner JPEG），`Cache-Control: public, max-age=86400, immutable` |

> **图片服务架构（v2）**
> 之前将全部图片内联为 base64 data URI 导致 `/api/shop/items` JSON ~1MB、
> 首屏被 JSON.parse 阻塞。现在改为独立图片接口：JSON 仅 ~5KB 秒出骨架，
> 32 张商品图由浏览器并行加载 + 本地强缓存。前端 `imgUrl()` 自动给路径
> 拼 `token` 参数绕过主机鉴权（data URI 路径直接透传，兼容离线预览）。
> 摩拉金币因在页面多处复用且体积小，仍以内联 base64 直出（首屏无额外请求）。
| GET  | /api/shop/data | 当前摩拉余额 + 背包 inventory + 收入状态 income |
| GET  | /api/shop/income | 收入配置与当前收入状态，返回 `dailyBase`, `tasks`, `studyTiers`, `income` |
| POST | /api/shop/buy | 购买，body: `{ itemId }`，扣摩拉、入背包、写 pending_actions |
| POST | /api/shop/income/daily | 领取保底收入，返回 `mora` + `income` |
| POST | /api/shop/income/daily/auto | 自动发放当日保底收入，内部 / cron 可调用 |
| POST | /api/shop/income/entertainment/start | 开始娱乐任务，body: `{ taskId }`，若已存在进行中任务或任务处于冷却中则返回失败 |
| POST | /api/shop/income/entertainment/claim | 领取完成的娱乐任务收益，若任务未完成则返回 `readyAt` |
| POST | /api/shop/income/study | 直接领取学习收入，body: `{ tier }` |
| POST | /api/shop/income/study/start | 开始学习会话，body: `{ tier }`，开始 45 分钟定时学习任务 |
| POST | /api/shop/income/study/claim | 领取完成的学习会话收益，若学习会话未完成则返回 `readyAt` |

> 娱乐任务冷却机制：同一任务领取完成后，会按 `cooldownHours` 计算下一次可开始时间。当前也只允许一个娱乐任务同时进行。

## 数据文件（ctx.dataDir）

`shop_data.json`：`{ mora: number, inventory: { itemId: count }, purchases: [...], income: {...} }`，初始摩拉 0。
购买成功后会往 `pending_actions.json` 追加 `{ action: "buy", item }`，状态面板可感知。
商品清单在 `routes/shop.js` 顶部的 `ITEMS` / `CATEGORIES` 常量（已命名导出）。

## 渲染链路

```
用户点击导航栏"小铺"按钮
  → Hana 创建全屏 iframe
    → iframe 加载 /shop 路由（routes/shop.js）
      → routes/shop.js 读 shop.html、shop.css、shop.js
        → 把 CSS 和 JS 内联替换进 HTML（/* INLINE_CSS */ → 文件内容）
          → 返回完整 HTML 给 iframe
            → 浏览器渲染页面
```

## 技术栈

| 层 | 技术 | 约束 |
|----|------|------|
| 页面结构 | HTML5 | 不含 DOCTYPE 外的框架 |
| 样式 | CSS3 | 可以用 `var(--bg)`、`var(--text)` 等 Hana 主题变量跟随亮暗切换 |
| 前端逻辑 | 纯 JavaScript | 无构建工具，不能 import / require |
| 和后端通信 | `fetch()` + token | token 从 `window.location.search` 提取 |
| Hana 宿主通信 | `@hana/plugin-sdk` | 理论上可用（通过 postMessage），但当前 widget.bundle.js 用的是直接 fetch |
| 后端 API | Hono 风格路由 | `app.get("/api/shop/...")` |
| 数据持久化 | `ctx.dataDir` | `path.join(ctx.dataDir, "shop_data.json")` |

## 可用 CSS 变量（Hana 主题注入）

```css
background: var(--bg);              /* 主背景 */
color: var(--text);                 /* 主文字 */
border: 1px solid var(--border);    /* 边框 */
color: var(--text-secondary);       /* 次级文字 */
accent-color: var(--accent);        /* 强调色 */
```

## 前端获取 token 的标准写法

shop.js 里已经有封装：

```javascript
// 当前已有（可直接用）
var token = (
  (window.location.search || "").match(/[?&]token=([^&]+)/) || []
)[1];
if (token) token = decodeURIComponent(token);

function api(path, opts) {
  var url = "/api/plugins/san-status-panel" + path;
  if (token) url += (url.indexOf("?") >= 0 ? "&" : "?") + "token=" + encodeURIComponent(token);
  return fetch(url, opts || {}).then(function (r) { return r.json(); });
}
```

## 添加新功能的标准操作

### 1. 加后端 API（routes/shop.js）

在 `export default function (app, ctx)` 内部添加路由：

```javascript
// 获取商品列表
app.get("/api/shop/items", (c) => {
  var items = [
    { id: 1, name: "咖啡", price: 5, emoji: "☕" },
    { id: 2, name: "蛋糕", price: 10, emoji: "🍰" }
  ];
  return c.json({ ok: true, items: items });
});

// 购买
app.post("/api/shop/buy", async (c) => {
  var body = await c.req.json().catch(() => ({}));
  var itemId = body.itemId;
  // 处理购买逻辑
  return c.json({ ok: true, message: "购买成功" });
});
```

### 2. 前端调 API（shop/shop.js）

```javascript
// 加载商品列表
api("/api/shop/items").then(function (data) {
  if (data.ok) {
    // 渲染商品列表到 DOM
    data.items.forEach(function (item) { ... });
  }
});

// 购买
function buyItem(id) {
  api("/api/shop/buy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemId: id })
  }).then(function (data) {
    console.log(data.message);
  });
}
```

### 3. 更新 HTML（shop/shop.html）

在 `<div id="app">` 里面加内容。保持占位标记：

```html
<style>/* INLINE_CSS */</style>  ← 不要删，CSS 会被自动替换
<script>/* INLINE_JS */</script>  ← 不要删，JS 会被自动替换
```

### 4. 重新加载插件

修改任何后端文件（routes/shop.js）→ 重启 Hana
修改前端文件（shop/*）→ 刷新 iframe 或重新进入小铺即可

## 架构原则

1. **所有数据通过后端 API 获取**，前端不直接读文件
2. **API 和面板共享 dataDir**（`ctx.dataDir`），可以用同一个 JSON 文件做数据桥
3. **shop.js 是纯前端**，不能 import，不能用 node API，和普通网页一样
4. **routes/shop.js 是 Node 环境**，可以用 fs、path 等模块，可以读写文件
5. **小铺和状态面板是同一个插件**，API 端点都在 `/api/plugins/san-status-panel/` 下，注意路径不冲突
