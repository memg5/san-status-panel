# 会话选择支持 Bridge/WeChat 会话 · 实现方案

## 目标

让状态面板的「会话选择」下拉列表能显示并选中 bridge（微信）通话的桑多涅会话，戳一下/投喂可以发到微信端的桑多涅对话中。

## 当前行为

1. 会话列表只扫描 `agents/{id}/sessions/` 目录顶层，子目录（`bridge/owner/`、`phone/sessions/`）被忽略
2. `tryTriggerReply` 显式过滤 `/bridge|phone/` 路径
3. Hana 框架校验 `session:send` 的路径格式，bridge 路径会被拒绝

## 实现步骤

### 步骤 1：修改 session 列表 API（GET /api/agent-sessions）

文件：`routes/ui.js`，约第 490 行附近。

**当前代码**只扫描顶层：

```javascript
var sfs = fs.readdirSync(sd)
  .filter(function (f) { return f.endsWith(".jsonl") && !f.startsWith("session-titles"); })
  .sort().reverse().slice(0, 12);
```

**需要改为**递归扫描子目录：

```javascript
// 递归扫描 sessions 目录下所有 .jsonl 文件
function scanSessions(dir, maxResults) {
  var result = [];
  function walk(d) {
    try {
      var items = fs.readdirSync(d, { withFileTypes: true });
      for (var i = 0; i < items.length && result.length < maxResults; i++) {
        var item = items[i];
        var full = path.join(d, item.name);
        if (item.isDirectory()) {
          walk(full);
        } else if (item.name.endsWith(".jsonl") && !item.name.startsWith("session-titles")) {
          result.push(full);
        }
      }
    } catch (e) {}
  }
  walk(dir);
  // 按修改时间倒序
  result.sort(function (a, b) {
    try { return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs; } catch (e) { return 0; }
  });
  return result.slice(0, maxResults);
}

var sfs = scanSessions(sd, 12);
```

### 步骤 2：为每个 session 提取 sessionId

在生成 session 对象的地方（目前是 `sessions.push({ id: fp, label: slabel, active: isActive })`），增加 `sid` 字段：

```javascript
// 从文件名提取 sessionId
function extractSessionId(filename) {
  // 格式: YYYY-MM-DDTHH-MM-SS-XXXZ_SESSIONID.jsonl
  var parts = path.basename(filename).split("_");
  if (parts.length >= 2) {
    return parts[parts.length - 1].replace(".jsonl", "");
  }
  return null;
}

// 在 session 列表中追加 sid
sessions.push({
  id: fp,
  sid: extractSessionId(fp),
  label: slabel,
  active: isActive
});
```

### 步骤 3：为 bridge/phone 会话标记类型

方便前端区分别显示。

```javascript
sessions.push({
  id: fp,
  sid: extractSessionId(fp),
  label: slabel,
  active: isActive,
  bridge: /bridge|phone/.test(fp)  // 标记是否为 bridge 会话
});
```

### 步骤 4：修改配置存储（POST /api/config）

文件：`routes/ui.js`，约第 373 行。

当前存 `targetSession`（路径），需要同时存 `targetSessionId`：

**不需要改后端代码。** `Object.assign(cfg, body)` 会自动合并新字段。

### 步骤 5：修改前端会话选择 UI（settings.js）

文件：`assets/settings.js`，约第 7400 字符偏移附近。

**当前**点击保存时：

```javascript
fetch("/api/plugins/san-status-panel/api/config", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    targetAgent: this.dataset.aid,
    targetSession: this.dataset.sid  // 这里存的是路径
  })
})
```

**改为**同时保存 sessionId：

```javascript
var sessionData = {
  targetAgent: this.dataset.aid,
  targetSession: this.dataset.sid     // 文件路径（保留兼容）
};
// 如果有 sessionId，一起保存
if (this.dataset.sessionid) {
  sessionData.targetSessionId = this.dataset.sessionid;
}
fetch("/api/plugins/san-status-panel/api/config", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(sessionData)
})
```

在创建 session item DOM 时，把 `g.sessions[s].sid` 存到 `data-sessionid` 属性：

```javascript
si.dataset.sessionid = g.sessions[s].sid || "";
```

**不需要给 bridge 会话加视觉标记**（除非你想区分），marker 只用于未来扩展。

### 步骤 6：修改 tryTriggerReply（最关键的改动）

文件：`routes/ui.js`，约第 559 行。

**删除 bridge/phone 过滤，增加 sessionId 逻辑。**

**当前代码**：

```javascript
if (cfg.targetSession) {
  fp = cfg.targetSession;
  if (
    !fs.existsSync(fp) ||
    /bridge\\?|phone\\?/.test(fp)
  ) fp = null;
}
```

**改为**：

```javascript
if (cfg.targetSession) {
  fp = cfg.targetSession;
  // 不再过滤 bridge/phone，让 Hana 决定是否接受
  if (!fs.existsSync(fp)) fp = null;
}
```

同时删除缓存扫描里的 bridge 过滤：

```javascript
// 当前（第二步缓存）:
!/bridge\\?|phone\\?/.test(si.sessionPath)
// → 删除这一行
```

**核心改动：如果是 bridge 会话，传 sessionId 而不是 sessionPath**。

在 `session:send` 调用之前加判断：

```javascript
if (!fp) return;

// 如果是 bridge/phone 路径，用 sessionId 替代 sessionPath
var sendPayload = { text: text, sessionPath: fp };
if (/bridge|phone/.test(fp)) {
  var sessionId = cfg.targetSessionId;
  if (!sessionId) {
    // 从文件名提取
    var parts = path.basename(fp).split("_");
    if (parts.length >= 2) {
      sessionId = parts[parts.length - 1].replace(".jsonl", "");
    }
  }
  if (sessionId) {
    sendPayload = { text: text, sessionId: sessionId };
  }
}
pluginCtx.bus.request("session:send", sendPayload).catch(function () {});
```

**为什么用 `{ sessionId }` 而不是 `{ sessionPath }`？**

Hana 0.407.3 的 `session:send` 处理函数会校验路径格式：`agents/{id}/sessions/*.jsonl`。bridge 的路径是 `agents/{id}/sessions/bridge/owner/*.jsonl`，不匹配这个模式。

但传 `sessionId` 时，Hana 会通过 session-manifest 数据库查找该 session 的实际文件路径，绕过路径格式校验。

### 步骤 7：处理 `GET /api/config` 返回值

文件：`routes/ui.js`，约第 356 行。

增加 `targetSessionId` 字段：

```javascript
return c.json({
  bg: cfg.bg || null,
  // ... 其他字段 ...
  targetAgent: cfg.targetAgent || "",
  targetSession: cfg.targetSession || "",
  targetSessionId: cfg.targetSessionId || "",  // 新增
  // ...
});
```

## 边界情况

| 情况 | 处理方式 |
|------|---------|
| bridge session 文件被删除 | `fs.existsSync(fp)` 检查，路径不存在回退到缓存扫描 |
| 没有 `targetSessionId` | 从文件名实时提取 |
| bridge session 的 sessionId 无效 | `session:send` 静默失败，不阻塞其他功能 |
| 选择未激活的 bridge 会话 | 同普通会话，active 标记逻辑不变 |
| bridge 会话列表为空 | 正常显示空状态 |

## 验证方法

1. 重启 Hana
2. 打开状态面板设置 → 会话选择
3. 展开 `hanako`（桑多涅老板）的分组
4. 确认能看到 bridge 相关会话（路径中包含 `bridge/owner/`）
5. 选中一个 bridge 会话
6. 回到对话界面，点"戳一下"
7. 检查微信端是否收到消息

## 文件改动清单

| 文件 | 改动 |
|------|------|
| `routes/ui.js` GET /api/agent-sessions | 递归扫描子目录，提取 sessionId，标记 bridge |
| `routes/ui.js` GET /api/config | 加 targetSessionId 字段 |
| `routes/ui.js` tryTriggerReply | 删 bridge/phone 过滤，bridge 路径改用 sessionId |
| `assets/settings.js` | session item 加 data-sessionid，保存时传 targetSessionId |
