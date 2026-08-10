// routes/ui.js — v0.4.0 模块化重构
// CSS → assets/style.css  |  JS → assets/settings.js  |  路由 → 本文件

import fs from "node:fs";
import path from "node:path";
import { createTriggerReply } from "./trigger-reply.js";
import { nowStamp, nowLocal } from "../lib/now.js";
export default function (app, ctx) {
  const dataDir = ctx.dataDir;
  const actionsPath = path.join(dataDir, "pending_actions.json");
  const configPath = path.join(dataDir, "config.json");
  const assetsDir = path.join(dataDir, "assets");
  const HANA_HOME = path.dirname(path.dirname(dataDir));
  try { fs.mkdirSync(assetsDir, { recursive: true }); } catch (e) {}

  // ---- 插件资源目录 ----
  const pluginAssets = path.join(ctx.pluginDir, "assets");

  // ================================================================
  //  配置读写
  // ================================================================
  function readConfig() {
    try { if (fs.existsSync(configPath)) return JSON.parse(fs.readFileSync(configPath, "utf-8")); } catch (e) {}
    return {};
  }
  function saveConfig(cfg) {
    try { fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), "utf-8"); } catch (e) {}
  }

  // ================================================================
  //  状态推送策略（2026-08-09 改为短轮询）
  // ================================================================
  // 原 SSE 长连接方案在 Hana 0.446.6 下会导致切换会话时 iframe 重挂载风暴
  // （每次切换开 5-50 条连接），最终卡死。现改为前端 setInterval 轮询 /api/status，
  // status.json 仅几百字节，轮询开销可忽略。

  // 触发 Agent 回复（共享逻辑：poke / send / 娱乐任务申请 共用）
  const tryTriggerReply = createTriggerReply({ dataDir, configPath, log: ctx.log });

  // ================================================================
  //  静态资源服务 (CSS / JS / Widget Bundle)
  // ================================================================
  function serveFile(filePath, contentType) {
    try {
      if (!fs.existsSync(filePath)) return null;
      var content = fs.readFileSync(filePath, "utf-8");
      // widget.bundle.js: 保留轮询（短轮询方案，不再移除）
      return new Response(content, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=3600"
        }
      });
    } catch (e) {
      return null;
    }
  }

  app.get("/static/style.css", (c) => {
    var r = serveFile(path.join(pluginAssets, "style.css"), "text/css; charset=utf-8");
    return r || c.text("/* not found */", 404);
  });

  app.get("/static/settings.js", (c) => {
    var r = serveFile(path.join(pluginAssets, "settings.js"), "application/javascript; charset=utf-8");
    return r || c.text("// not found", 404);
  });

  app.get("/static/widget.bundle.js", (c) => {
    var r = serveFile(path.join(pluginAssets, "widget.bundle.js"), "application/javascript; charset=utf-8");
    return r || c.text("// not found", 404);
  });

  // ================================================================
  //  HTML 模板
  // ================================================================
  var HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
  <title>桑多涅状态</title>
  <style>/* CSS_INLINE */</style>
</head>
<body data-surface="/* SURFACE_KIND */">
  <!-- ====== 主面板 ====== -->
  <div class="panel">
    <div class="panel-bg" id="panelBg"></div>
    <div class="panel-content">

      <!-- 顶栏 -->
      <div class="header-bar">
        <div class="status-tag-cloud" id="statusTagCloud">
          <span class="status-tag">...</span>
        </div>
        <div class="header-right">
          <span class="indicator" id="indicator"></span>
          <div class="settings-btn-wrap">
            <button class="settings-btn" id="settingsBtn">\u2699</button>
          </div>
        </div>
      </div>

      <!-- 头像 & 名称 -->
      <div class="avatar-section" id="avatarSection">
        <div class="avatar-circle" id="avatarCircle">\u6851</div>
        <div class="panel-title" id="panelTitle">\u6851\u591a\u5948</div>
      </div>

      <!-- 状态卡 -->
      <div class="glass-card">
        <div id="content"></div>
      </div>

      <!-- 记忆碎片卡 -->
      <div class="glass-card memory-card" id="memoryCard">
        <div id="memoryText" style="font-size:13px;color:var(--text-secondary);font-style:italic"></div>
      </div>

      <!-- 底部操作栏 -->
      <div class="action-bar">
        <button class="action-btn" id="btnPoke">\u6233\u4e00\u4e0b</button>
        <div class="action-divider"></div>
        <button class="action-btn" id="btnCoffee">\u9001\u5496\u5561</button>
        <div class="action-divider"></div>
        <button class="action-btn" id="btnFeed">\u6295\u5582</button>
      </div>
    </div>
  </div>

  <!-- ====== 遮罩 & 设置面板 ====== -->
  <div class="panel-overlay" id="panelOverlay"></div>
  <div class="settings-panel" id="settingsPanel">
    <div class="sp-header">
      <span>\u8bbe\u7f6e</span>
      <span class="sp-close" id="spClose">\u2716</span>
    </div>
    <div class="sp-body">

      <!-- 会话选择 -->
      <div class="sp-group">
        <div class="sp-ttl">\u4f1a\u8bdd\u9009\u62e9</div>
        <div id="sessionGroupsContainer">
          <div style="padding:20px;text-align:center;color:#999">...</div>
        </div>
      </div>

      <!-- 显示设置 -->
      <div class="sp-group">
        <div class="sp-ttl">\u663e\u793a</div>
        <div class="setting-item">
          <span>\u5934\u50cf</span>
          <input type="checkbox" id="showAvatarToggle" checked>
        </div>
        <div class="setting-item">
          <span>\u540d\u79f0</span>
          <input type="checkbox" id="showNameToggle" checked>
        </div>
        <div class="setting-item">
          <span>\u4e0a\u4f20\u5934\u50cf</span>
          <button id="uploadAvatarBtn" style="background:none;border:1px solid var(--text-accent);color:var(--text-accent);border-radius:14px;padding:4px 12px;font-size:12px;cursor:pointer">\u4e0a\u4f20</button>
        </div>
        <div class="setting-item">
          <span>\u4e0a\u4f20\u80cc\u666f</span>
          <button id="uploadBgBtn" style="background:none;border:1px solid var(--text-accent);color:var(--text-accent);border-radius:14px;padding:4px 12px;font-size:12px;cursor:pointer">\u4e0a\u4f20</button>
        </div>
        <div class="setting-item">
          <span>\u4e0a\u4f20\u7acb\u7ed8</span>
          <button id="uploadNotePhotoBtn" style="background:none;border:1px solid var(--text-accent);color:var(--text-accent);border-radius:14px;padding:4px 12px;font-size:12px;cursor:pointer">\u4e0a\u4f20</button>
        </div>
        <div class="setting-item">
          <span>\u5361\u7247\u900f\u660e\u5ea6</span>
          <div style="display:flex;align-items:center;gap:8px">
            <input type="range" id="opacitySlider" class="slider" min="30" max="100" value="65">
            <span class="slider-value" id="opacityValue">65%</span>
          </div>
        </div>
        <div class="setting-item">
          <span>\u5b57\u4f53\u989c\u8272</span>
          <div>
            <span class="color-dot active" data-primary="#4A4A5A" data-secondary="#7A7A9A" data-accent="#6b5b95" style="background:#6b5b95"></span>
            <span class="color-dot" data-primary="#4A2020" data-secondary="#8B4A4A" data-accent="#c62828" style="background:#c62828"></span>
            <span class="color-dot" data-primary="#2A4A2A" data-secondary="#5A7A5A" data-accent="#2E7D32" style="background:#2E7D32"></span>
            <span class="color-dot" data-primary="#2A3A5A" data-secondary="#4A6A8A" data-accent="#1565C0" style="background:#1565C0"></span>
            <span class="color-dot" data-primary="#4A3A2A" data-secondary="#8A6A4A" data-accent="#EF6C00" style="background:#EF6C00"></span>
          </div>
        </div>
      </div>

      <!-- 位置（天气用） -->
      <div class="sp-group">
        <div class="sp-ttl">位置（天气）</div>
        <div class="setting-item">
          <span>当前位置</span>
          <span id="locStatus" style="font-size:12px;color:#999;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">未获取</span>
        </div>
        <div class="setting-item">
          <span>获取精确位置</span>
          <button id="locateBtn" style="background:none;border:1px solid var(--text-accent);color:var(--text-accent);border-radius:14px;padding:4px 12px;font-size:12px;cursor:pointer">获取</button>
        </div>
        <div class="setting-item" style="font-size:11px;color:#bbb;line-height:1.5">
          <span>会请求浏览器定位权限，获取后天气按当前位置显示。默认坐标（可配置）。</span>
        </div>
      </div>

      <!-- 版本信息 -->
      <div class="sp-group">
        <div class="setting-item" style="font-size:12px;color:#999;">
          <span>SanStatus v0.4.0</span>
        </div>
      </div>
    </div>
  </div>

  <!-- ====== 背景调整弹窗 ====== -->
  <div class="adjust-modal" id="bgAdjustModal">
    <div class="adjust-panel">
      <div class="adjust-header">
        <span>\u8c03\u6574\u80cc\u666f</span>
        <span class="adjust-tip">\u62d6\u62fd\u79fb\u52a8 \u00b7 \u6eda\u8f6e\u7f29\u653e</span>
      </div>
      <div class="adjust-preview bg-preview" id="bgPreview">
        <div class="adjust-preview-bg" id="bgPreviewBg"></div>
      </div>
      <div class="adjust-controls">
        <div class="slider-row">
          <span>\u56fe\u7247\u7f29\u653e</span>
          <input type="range" id="bgScaleSlider" class="slider" min="50" max="300" value="120">
          <span class="slider-value" id="bgScaleValue">120%</span>
        </div>
      </div>
      <div class="adjust-footer">
        <div class="footer-left">
          <label class="btn-reselect">\u91cd\u65b0\u9009\u62e9
            <input type="file" id="bgReselect" accept="image/*" hidden>
          </label>
        </div>
        <div class="footer-right">
          <button class="btn-cancel" id="bgAdjustCancel">\u53d6\u6d88</button>
          <button class="btn-confirm" id="bgAdjustConfirm">\u786e\u5b9a</button>
        </div>
      </div>
    </div>
  </div>

  <!-- ====== 头像调整弹窗 ====== -->
  <div class="adjust-modal" id="avatarAdjustModal">
    <div class="adjust-panel">
      <div class="adjust-header">
        <span>\u8c03\u6574\u5934\u50cf</span>
        <span class="adjust-tip">\u62d6\u62fd\u79fb\u52a8 \u00b7 \u6eda\u8f6e\u7f29\u653e</span>
      </div>
      <div class="adjust-preview avatar-preview" id="avatarPreview">
        <div class="adjust-preview-bg" id="avatarPreviewBg"></div>
      </div>
      <div class="adjust-controls">
        <div class="slider-row">
          <span>\u56fe\u7247\u7f29\u653e</span>
          <input type="range" id="avatarScaleSlider" class="slider" min="100" max="300" value="120">
          <span class="slider-value" id="avatarScaleValue">120%</span>
        </div>
      </div>
      <div class="adjust-footer">
        <div class="footer-left">
          <label class="btn-reselect">\u91cd\u65b0\u9009\u62e9
            <input type="file" id="avatarReselect" accept="image/*" hidden>
          </label>
        </div>
        <div class="footer-right">
          <button class="btn-cancel" id="avatarAdjustCancel">\u53d6\u6d88</button>
          <button class="btn-confirm" id="avatarAdjustConfirm">\u786e\u5b9a</button>
        </div>
      </div>
    </div>
  </div>

  <!-- ====== 立绘调整弹窗 ====== -->
  <div class="adjust-modal" id="notePhotoAdjustModal">
    <div class="adjust-panel">
      <div class="adjust-header">
        <span>\u8c03\u6574\u7acb\u7ed8</span>
        <span class="adjust-tip">\u62d6\u62fd\u79fb\u52a8 \u00b7 \u6eda\u8f6e\u7f29\u653e</span>
      </div>
      <div class="adjust-preview note-photo-preview" id="notePhotoPreview">
        <div class="adjust-preview-bg" id="notePhotoPreviewBg"></div>
      </div>
      <div class="adjust-controls">
        <div class="slider-row">
          <span>\u56fe\u7247\u7f29\u653e</span>
          <input type="range" id="notePhotoScaleSlider" class="slider" min="100" max="300" value="120">
          <span class="slider-value" id="notePhotoScaleValue">120%</span>
        </div>
      </div>
      <div class="adjust-footer">
        <div class="footer-left">
          <label class="btn-reselect">\u91cd\u65b0\u9009\u62e9
            <input type="file" id="notePhotoReselect" accept="image/*" hidden>
          </label>
        </div>
        <div class="footer-right">
          <button class="btn-cancel" id="notePhotoAdjustCancel">\u53d6\u6d88</button>
          <button class="btn-confirm" id="notePhotoAdjustConfirm">\u786e\u5b9a</button>
        </div>
      </div>
    </div>
  </div>

  <!-- ====== 脚本 ====== -->
  <!-- 核心: Token 拦截 + 状态轮询 + SSE -->
  <script>
    var t = (function () {
      var m = (window.location.search || "").match(/[?&]token=([^&]+)/);
      return m ? decodeURIComponent(m[1]) : "";
    })();
    var f = window.fetch;
    window.fetch = function (u, o) {
      if (t && typeof u === "string" && u.indexOf("/api/plugins/san-status-panel/api/") >= 0) {
        u += (u.indexOf("?") >= 0 ? "&" : "?") + "token=" + encodeURIComponent(t);
      }
      return f.call(this, u, o);
    };
    window.sp = function () {
      fetch("/api/plugins/san-status-panel/api/poke", { method: "POST" })
        .then(function () { setTimeout(loadStatus, 800); })
        .catch(function () {});
    };
    window.si = function (i) {
      fetch("/api/plugins/san-status-panel/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item: i })
      }).then(function () { setTimeout(loadStatus, 800); })
        .catch(function () {});
    };
    // 短轮询方案（2026-08-09）：SSE 长连接在 Hana 0.446.6 切换会话时会风暴式累积导致卡死
    var pt = setInterval(function () { loadStatus(); }, 3000);
  </script>

  <!-- Widget 核心渲染逻辑 -->
  <script>/* WIDGET_JS_INLINE */</script>

  <!-- 设置面板 & 交互逻辑 -->
  <script>/* SETTINGS_JS_INLINE */</script>
</body>
</html>`;

  // ================================================================
  //  路由定义
  // ================================================================
  // ---- Widget 页面 ----
  function inlineHTML(surfaceKind) {
    var css = "", wjs = "", sjs = "";
    try { css = fs.readFileSync(path.join(pluginAssets, "style.css"), "utf-8"); } catch(e){}
    try { wjs = fs.readFileSync(path.join(pluginAssets, "widget.bundle.js"), "utf-8"); } catch(e){}
    try { sjs = fs.readFileSync(path.join(pluginAssets, "settings.js"), "utf-8"); } catch(e){}
    return HTML
      .replace("/* SURFACE_KIND */", surfaceKind === "card" ? "card" : "widget")
      .replace("/* CSS_INLINE */", css)
      .replace("/* WIDGET_JS_INLINE */", wjs)
      .replace("/* SETTINGS_JS_INLINE */", sjs);
  }
  app.get("/widget", (c) => c.html(inlineHTML("widget")));
  app.get("/card/status", (c) => c.html(inlineHTML("card")));

  // ---- 状态查询（短轮询方案 2026-08-09）----
  // 背景：SSE 长连接在 Hana 0.446.6 切换会话时会随 iframe 重挂载风暴式创建，
  //   连接数瞬间冲到 50+ 导致卡死。status.json 是几百字节的小文件，
  //   短轮询开销可忽略，且不产生长连接累积问题。
  app.get("/api/status", (c) => {
    c.header("Access-Control-Allow-Origin", "*");
    try {
      var p = path.join(dataDir, "status.json");
      if (fs.existsSync(p)) return c.json(JSON.parse(fs.readFileSync(p, "utf-8")));
    } catch (e) {}
    return c.json({ activity: "等待桑多涅更新", energy: "?", mood: "?", updatedAt: null });
  });

  // ---- 配置读写 ----
  app.get("/api/config", (c) => {
    var cfg = readConfig();
    return c.json({
      bg: cfg.bg || null,
      avatar: cfg.avatar || null,
      showAvatar: cfg.showAvatar !== false,
      showName: cfg.showName !== false,
      name: cfg.name || "桑多涅",
      targetAgent: cfg.targetAgent || "",
      targetSession: cfg.targetSession || "",
      targetSessionId: cfg.targetSessionId || "",  // 新增：用于 bridge 会话
      textColor: cfg.textColor || null,
      cardOpacity: cfg.cardOpacity || 65,
      bgConfig: cfg.bgConfig || null,
      avatarConfig: cfg.avatarConfig || null,
      notePhoto: cfg.notePhoto || null,
      notePhotoConfig: cfg.notePhotoConfig || null,
      location: cfg.location || null
    });
  });

  app.post("/api/config", async (c) => {
    try {
      var body = await c.req.json();
      var cfg = readConfig();
      Object.assign(cfg, body);
      saveConfig(cfg);
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ ok: false }, 500);
    }
  });

  // ---- 位置读取（天气系统用） ----
  // 位置由设置面板「获取当前位置」通过浏览器 Geolocation 获取并存入 config.location。
  // 读取时默认坐标（可配置），没有定位时使用。
  app.get("/api/location", (c) => {
    var cfg = readConfig();
    var loc = cfg.location || { city: "默认坐标", region: "湖北", country: "CN", lat: 29.51, lon: 109.41, source: "default" };
    return c.json({ ok: true, location: loc });
  });

  // ================================================================
  //  记忆碎片（每日 3 句）：读取当前会话的当日对话，提取用户短句
  // ================================================================
  const fragmentsPath = path.join(dataDir, "daily-fragments.json");
  function todayLocal() {
    var d = new Date(Date.now() + 8 * 3600 * 1000); // Asia/Shanghai
    return d.toISOString().slice(0, 10); // YYYY-MM-DD
  }
  function resolveSessionPath(cfg) {
    // 优先 config.targetSession；为空时自动找 agents/{targetAgent}/sessions 下最新会话
    if (cfg.targetSession && fs.existsSync(cfg.targetSession)) return cfg.targetSession;
    try {
      var agentId = cfg.targetAgent || "hanako";
      var sessDir = path.join(HANA_HOME, "agents", agentId, "sessions");
      if (fs.existsSync(sessDir)) {
        var files = fs.readdirSync(sessDir).filter(function (f) { return f.endsWith(".jsonl"); })
          .map(function (f) { return path.join(sessDir, f); })
          .filter(function (f) {
            try { return fs.statSync(f).size > 1024; } catch (e) { return false; } // 跳过空/新文件
          })
          .sort(function (a, b) { return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs; });
        if (files.length > 0) return files[0];
      }
    } catch (e) {}
    return "";
  }
  function pickFragments(sessionPath, limit) {
    // 从会话文件提取 3~7 天前的用户文本消息，随机选 limit 条
    // 策略：优先非技术短句（生活向），随机挑选（不是最近）
    try {
      if (!sessionPath || !fs.existsSync(sessionPath)) return [];
      var raw = fs.readFileSync(sessionPath, "utf-8");
      var now = Date.now();
      var start = now - 7 * 24 * 3600 * 1000; // 7 天前
      var end = now - 3 * 24 * 3600 * 1000;   // 3 天前
      var techRe = /(git|mcp|插件|修复|测试|代码|文件|配置|路由|接口|token|key|部署|打包|命令|函数|错误|bug|发布|下载|github|仓库)/i;
      var life = [], tech = [];
      for (var line of raw.split("\n")) {
        if (line.indexOf('"message"') < 0) continue;
        try {
          var ev = JSON.parse(line);
          var m = ev.message;
          if (!m || m.role !== "user") continue;
          var ts = Date.parse(ev.timestamp || "");
          if (isNaN(ts) || ts < start || ts > end) continue; // 只看 3~7 天前
          var text = "";
          if (typeof m.content === "string") text = m.content;
          else if (Array.isArray(m.content)) {
            text = m.content.filter(function (p) { return p && p.type === "text" && typeof p.text === "string"; }).map(function (p) { return p.text; }).join(" ");
          }
          text = text.trim();
          if (text.length < 4 || text.length > 42) continue;
          if (/^(\/|\{|\[)/.test(text)) continue;
          if (/^(更新状态|好|ok|嗯|可以|继续|收到|行|对|是|嗯哼|来|试|👌|👍|😊|哈哈|好的|嗯嗯)$/i.test(text)) continue;
          // 排除无意义输入：纯重复字母、纯符号、无汉字或英文单词的乱码
          if (!/[\u4e00-\u9fa5A-Za-z]/.test(text)) continue;
          if (/^([a-zA-Z])\1{3,}$/.test(text)) continue; // ababab → 重复单字符
          text = text.replace(/\s+/g, " ");
          (techRe.test(text) ? tech : life).push(text);
        } catch (e) {}
      }
      // 去重 + 随机洗牌
      function uniqShuffle(arr) {
        var seen = {}, out = [];
        for (var i = arr.length - 1; i >= 0; i--) { if (!seen[arr[i]]) { seen[arr[i]] = 1; out.push(arr[i]); } }
        // Fisher–Yates 随机
        for (var j = out.length - 1; j > 0; j--) {
          var k = Math.floor(Math.random() * (j + 1));
          var tmp = out[j]; out[j] = out[k]; out[k] = tmp;
        }
        return out;
      }
      return uniqShuffle(life).concat(uniqShuffle(tech)).slice(0, limit);
    } catch (e) { return []; }
  }
  app.get("/api/fragments", (c) => {
    var cfg = readConfig();
    var sessionPath = resolveSessionPath(cfg);
    var today = todayLocal();
    var cached = null;
    try { if (fs.existsSync(fragmentsPath)) cached = JSON.parse(fs.readFileSync(fragmentsPath, "utf-8")); } catch (e) {}
    // 缓存有效（同一天）直接返回
    if (cached && cached.date === today && Array.isArray(cached.fragments) && cached.fragments.length > 0) {
      return c.json({ ok: true, date: today, fragments: cached.fragments, source: "cache", sessionPath: sessionPath });
    }
    // 否则重新提取（3~7 天前随机）
    var frags = pickFragments(sessionPath, 3);
    var result = { date: today, fragments: frags };
    try { fs.writeFileSync(fragmentsPath, JSON.stringify(result, null, 2), "utf-8"); } catch (e) {}
    return c.json({ ok: true, date: today, fragments: frags, source: frags.length ? "session" : "empty", sessionPath: sessionPath });
  });

  // ---- 静态资源 (用户上传的图片) ----
  app.get("/api/assets/:file", (c) => {
    var file = c.req.param("file");
    var fp = path.join(assetsDir, path.basename(file));
    if (fs.existsSync(fp)) {
      var ext = path.extname(file).toLowerCase();
      var mime = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".webp": "image/webp"
      }[ext] || "application/octet-stream";
      var buf = fs.readFileSync(fp);
      return new Response(buf, {
        headers: { "Content-Type": mime, "Cache-Control": "max-age=86400" }
      });
    }
    return c.json({ error: "not found" }, 404);
  });

  app.post("/api/assets", async (c) => {
    try {
      var body = await c.req.json();
      var type = body.type;
      var data = body.data;
      if (!data) return c.json({ ok: false }, 400);
      var m = data.match(/^data:image\/(png|jpeg|jpg|gif|webp);base64,(.+)$/);
      if (!m) return c.json({ ok: false }, 400);
      var extMap = { png: ".png", jpeg: ".jpg", jpg: ".jpg", gif: ".gif", webp: ".webp" };
      var ext = extMap[m[1]] || ".png";
      var buf = Buffer.from(m[2], "base64");
      var fn = type + "_" + Date.now() + ext;
      fs.writeFileSync(path.join(assetsDir, fn), buf);
      var cfg = readConfig();
      // 立绘：独立 key（notePhoto），与 bg/avatar 互不覆盖
      var oldKey = type === "bg" ? cfg.bg : type === "avatar" ? cfg.avatar : type === "note-photo" ? cfg.notePhoto : null;
      if (oldKey) {
        try { fs.unlinkSync(path.join(assetsDir, oldKey)); } catch (e) {}
      }
      if (type === "bg") cfg.bg = fn;
      else if (type === "avatar") cfg.avatar = fn;
      else if (type === "note-photo") cfg.notePhoto = fn;
      saveConfig(cfg);
      return c.json({ ok: true, url: "/api/plugins/san-status-panel/api/assets/" + fn });
    } catch (e) {
      return c.json({ ok: false }, 500);
    }
  });

  // ---- Agent 会话列表 ----
  app.get("/api/agent-sessions", (c) => {
    var cfg = readConfig();
    var groups = [];
    try {
      var ad = path.join(HANA_HOME, "agents");
      if (!fs.existsSync(ad)) {
        ctx.log?.warn?.("[状态面板] agents 目录不存在:", ad);
        return c.json({ groups: groups });
      }
      var entries = fs.readdirSync(ad, { withFileTypes: true });
      for (var i = 0; i < entries.length; i++) {
        if (!entries[i].isDirectory()) continue;
        var aid = entries[i].name;
        var label = aid;
        try {
          var cp = path.join(ad, aid, "config.yaml");
          if (fs.existsSync(cp)) {
            var raw = fs.readFileSync(cp, "utf-8");
            var ab = raw.match(/agent:\n([\s\S]*?)(?=\n\S|\n$)/);
            if (ab) {
              var nm = ab[1].match(/name:\s*(.+)/);
              if (nm) label = nm[1].trim();
            }
          }
        } catch (e) {}
        var sessions = [];
        try {
          var sd = path.join(ad, aid, "sessions");
          if (fs.existsSync(sd)) {
            // 递归扫描 sessions 目录下所有 .jsonl 文件（跳过 archived 和 session-meta）
            function walkSessions(dir, maxResults) {
              var result = [];
              function walk(d) {
                try {
                  var items = fs.readdirSync(d, { withFileTypes: true });
                  for (var wi = 0; wi < items.length && result.length < maxResults; wi++) {
                    var item = items[wi];
                    var full = path.join(d, item.name);
                    if (item.isDirectory()) {
                      if (item.name === "archived") continue;  // 跳过归档
                      walk(full);
                    } else if (item.name.endsWith(".jsonl") && !item.name.startsWith("session-titles")) {
                      result.push(full);
                    }
                  }
                } catch (e) {}
              }
              walk(dir);
              result.sort(function (a, b) {
                try { return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs; } catch (e) { return 0; }
              });
              return result.slice(0, maxResults);
            }
            var sfs = walkSessions(sd, 20);
            var titles = {};
            try {
              var tp = path.join(sd, "session-titles.json");
              if (fs.existsSync(tp)) titles = JSON.parse(fs.readFileSync(tp, "utf-8"));
            } catch (e) {}
            for (var j = 0; j < sfs.length; j++) {
              var fp = sfs[j];
              var slabel = "";
              var sid = "";
              try {
                var firstLine = fs.readFileSync(fp, "utf-8").split("\n").filter(Boolean)[0];
                if (firstLine) {
                  var fd = JSON.parse(firstLine);
                  sid = fd.id || "";
                }
              } catch (e) {}
              slabel = titles[fp] || titles[path.basename(fp)] || titles[sid] || "";
              if (!slabel) {
                try {
                  var allLines = fs.readFileSync(fp, "utf-8").split("\n").filter(Boolean);
                  for (var k = 0; k < allLines.length && k < 30; k++) {
                    try {
                      var d = JSON.parse(allLines[k]);
                      if (d.type === "message" && d.message && d.message.role === "user") {
                        var cnt = d.message.content;
                        if (typeof cnt === "string") { slabel = cnt.slice(0, 30); break; }
                        else if (Array.isArray(cnt)) {
                          for (var ci = 0; ci < cnt.length; ci++) {
                            if (cnt[ci].type === "text" && cnt[ci].text) {
                              slabel = cnt[ci].text.slice(0, 30);
                              break;
                            }
                          }
                          if (slabel) break;
                        }
                      }
                    } catch (e) {}
                  }
                } catch (e) {}
              }
              if (!slabel) {
                var bn = path.basename(fp);
                var tm = bn.match(/^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})/);
                slabel = tm ? tm[1].replace(/T/, " ") : bn.slice(0, 16);
              }
              var isActive = fp === cfg.targetSession || sid === cfg.targetSession || fp === cfg.targetSession;
              // 过滤 bridge/phone 会话（微信/QQ 等外部连接）：不在设置里显示
              // （2026-08-09 用户要求：外部连接的会话列表不需要展示）
              if (/bridge|phone/.test(fp)) continue;
              var isBridge = false;
              sessions.push({ id: fp, sid: sid, label: slabel, active: isActive, bridge: isBridge });
            }
          }
        } catch (e) {}
        if (sessions.length > 0) groups.push({ agentId: aid, label: label, sessions: sessions });
      }
    } catch (e) {
      ctx.log?.error?.("[状态面板] agent-sessions 异常:", e.message);
    }
    ctx.log?.info?.("[状态面板] agent-sessions:", groups.length, "个 agent 组, 当前:", cfg.targetAgent || "(未选)");
    return c.json({ groups: groups, current: cfg.targetAgent || "" });
  });

  // ---- 互动: 戳一下 ----
  app.post("/api/poke", async (c) => {
    try {
      var actions = [];
      try { actions = JSON.parse(fs.readFileSync(actionsPath, "utf-8")); } catch (e) {}
      actions.push({ action: "poke", timestamp: nowStamp(), tsLocal: nowLocal() });
      if (actions.length > 50) actions = actions.slice(-50);
      fs.writeFileSync(actionsPath, JSON.stringify(actions, null, 2), "utf-8");
      tryTriggerReply(c, "你戳了桑多涅一下。", "poke");
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ ok: false }, 500);
    }
  });

  // ---- 互动: 送礼物 ----
  app.post("/api/send", async (c) => {
    try {
      var body = await c.req.json();
      var item = body.item;
      if (!item) return c.json({ ok: false }, 400);
      var actions = [];
      try { actions = JSON.parse(fs.readFileSync(actionsPath, "utf-8")); } catch (e) {}
      actions.push({ action: "send", item: item, timestamp: nowStamp(), tsLocal: nowLocal() });
      if (actions.length > 50) actions = actions.slice(-50);
      fs.writeFileSync(actionsPath, JSON.stringify(actions, null, 2), "utf-8");
      tryTriggerReply(c, "你给了桑多涅 " + (item || "东西"), "send");
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ ok: false }, 500);
    }
  });
}
