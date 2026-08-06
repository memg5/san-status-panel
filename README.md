# 桑多涅 · 状态面板（SanStatus Panel）

一个带角色温度的 Hana 状态面板插件：状态卡片 + 每日便签 + 猫猫生活区（账本 / 学习 / 玩耍）。

> 插件页面里的便签、账本、状态气泡由 Agent 亲自撰写——不是模板，是"角色在生活"的记录。

## ✨ 功能

### 状态面板（Widget）
- 精力 / 饱腹 / 心情实时状态卡，由 Agent 自主更新
- 自定义头像、背景、字体颜色、卡片透明度
- 戳一下 / 送咖啡 / 投喂 互动，Agent 会感知并回应

### 猫猫生活区（Page）
- **每日便签**：Agent 结合记忆每日亲笔写一条便签，附带实时天气（Open-Meteo，默认内置坐标，可通过设置面板获取浏览器精确位置）
- **行动账本**：记录每一笔购买与使用（"真使用"机制——背包里的东西吃/喝掉会真实扣减），支持桑多涅亲笔概括
- **学习区**：番茄钟计时，学满领取摩拉，累计学习时长
- **玩耍区**：三种打工任务（维修店 / 钓鱼 / 农场），需 Agent 审批，完成后自动入账，带冷却

### 工具（Tools）
- `san_update_status` — 更新状态面板数值
- `san_buy_item` — 替主人购买商品（余额底线保护）
- `san_use_item` — 真正使用背包物品（扣库存、记流水、状态变化）
- `san_daily_note` — 每日亲笔便签
- `san_approve_entertainment_task` — 打工任务审批（Agent 自主判断）

## 📦 安装

**方式一：下载 zip（推荐，最简单）**

1. 在仓库页面点击 **Code → Download ZIP**，或从 [Releases](https://github.com/memg5/san-status-panel/releases) 下载最新版 `san-status-panel-vX.X.X.zip`。
2. 解压到 Hana 的插件目录：

   ```
   ~/.hanako/plugins/san-status-panel/
   ```

   （Windows 路径示例：`C:\Users\你的用户名\.hanako\plugins\san-status-panel\`）

3. 重启 Hana，在设置中启用「桑多涅 · 状态面板」。

**方式二：git clone**

```bash
git clone https://github.com/memg5/san-status-panel.git ~/.hanako/plugins/san-status-panel
```

> 数据存储于 Hana 的插件数据目录（`plugin-data/san-status-panel/`），与源码隔离，卸载插件不影响已存数据。

## ⚙️ 配置

- **默认坐标**：`routes/ui.js` 中的 `GET /api/location` 返回内置默认坐标（可修改为你的城市）。
- **天气**：Open-Meteo 免费 API，无需 Key。
- **精确位置**：设置面板 →「位置（天气）」→「获取精确位置」会请求浏览器定位权限（需宿主应用支持 Geolocation）。

## 🛠️ 开发

```
san-status-panel/
├── index.js            # 插件入口
├── manifest.json       # 插件清单
├── lib/now.js          # 统一时间戳（双格式，防模型误读 UTC）
├── routes/             # 路由（ui / shop / trigger-reply）
├── tools/              # Agent 工具
├── shop/               # 猫猫生活区前端
└── assets/             # 状态面板前端
```

## 📄 许可

[MIT](LICENSE) © 2026 桑多涅 · 枫丹工坊
