// routes/trigger-reply.js — 触发 Agent 回复的共享逻辑
// 供 ui.js（poke/投喂）与 shop.js（娱乐任务申请）复用：
// 把一段文本注入目标会话，唤醒 Agent 处理。
// 用法：
//   import { createTriggerReply } from "./trigger-reply.js";
//   const triggerReply = createTriggerReply({ dataDir, configPath, log });
//   triggerReply(c, "主人戳了你一下。");
import fs from "node:fs";
import path from "node:path";

// WS 触发路径（2026-08-09）
// 背景：session:send 缺少 isStreaming:false 收尾事件（BUG-2026-08-07-001）导致前端流点残留，
//   且不支持 displayMessage（互动消息只能全量显示）。
// 改用 WS prompt 路径：
//   - 支持 displayMessage：模型收到完整指令（text），前端只显示简短事件文本
//   - 引擎层会 emit isStreaming:false 收尾事件（经 WS 转发到前端，流点消失）
//   - 会话忙时服务端返回 error（"还在说话"），此时回退 session:send 保证送达

export function createTriggerReply(opts) {
  const { dataDir, configPath, log } = opts;
  const HANA_HOME = path.dirname(path.dirname(dataDir));
  let lastInteraction = 0;
  const MIN_INTERVAL = 3000;
  const WS_TIMEOUT = 12000;

  function readConfig() {
    try {
      return JSON.parse(fs.readFileSync(configPath, "utf-8"));
    } catch (e) {
      return {};
    }
  }

  // 读取 server-info.json 获取 WS 连接参数（port/token）
  function getServerInfo() {
    try {
      var p = path.join(HANA_HOME, "server-info.json");
      if (!fs.existsSync(p)) return null;
      return JSON.parse(fs.readFileSync(p, "utf-8"));
    } catch (e) {
      return null;
    }
  }

  // WS prompt 发送：返回 Promise，resolve(true)=成功，resolve(false)=需回退
  function wsPrompt(sessionPath, fullText, displayText) {
    return new Promise(function (resolve) {
      var info = getServerInfo();
      if (!info || !info.port || !info.token) {
        resolve(false);
        return;
      }
      var ws = null;
      var done = false;
      var timer = null;
      try {
        ws = new WebSocket("ws://127.0.0.1:" + info.port + "/ws?token=" + encodeURIComponent(info.token));
      } catch (e) {
        resolve(false);
        return;
      }
      function finish(ok) {
        if (done) return;
        done = true;
        if (timer) clearTimeout(timer);
        try { ws.close(); } catch (e) {}
        resolve(ok);
      }
      timer = setTimeout(function () { finish(false); }, WS_TIMEOUT);
      ws.onopen = function () {
        var payload = {
          type: "prompt",
          sessionPath: sessionPath,
          text: fullText
        };
        if (displayText) {
          payload.displayMessage = { text: displayText };
          payload.origin = "plugin:san-status-panel";
        }
        try { ws.send(JSON.stringify(payload)); } catch (e) { finish(false); }
      };
      ws.onmessage = function (ev) {
        var m = null;
        try { m = JSON.parse(ev.data); } catch (e) { return; }
        if (m && m.type === "error") {
          // 会话忙（"还在说话"）等错误 → 回退 session:send
          log?.warn?.("[状态面板] WS prompt 被拒:", m.message);
          finish(false);
        } else if (m && m.type === "status" && m.isStreaming === false) {
          // 收尾事件：流点会正常消失
          finish(true);
        }
      };
      ws.onerror = function () { finish(false); };
      ws.onclose = function () { finish(false); };
    });
  }

  // session:send 回退路径（WS 不可用时保底）
  function sendFallback(bus, sessionPath, text) {
    bus.request("session:send", { text: text, sessionPath: sessionPath })
      .then(function () {
        log?.info?.("[状态面板] 互动消息已发送 (session:send 回退):", sessionPath);
      })
      .catch(function (err) {
        log?.error?.("[状态面板] session:send 回退失败", err?.message || err);
      });
  }

  return function tryTriggerReply(c, text, eventType) {
    var now = Date.now();
    if (now - lastInteraction < MIN_INTERVAL) return;
    lastInteraction = now;
    // UI 显示文本：无信息量颜文字池（按事件类型轮换，不替用户/角色说话）
    // 第三方事件提示定位：只表达“互动已触发”的情绪，不带语义负担
    var KAOMOJI = {
      poke: ["ฅ(^•ﻌ•^)ฅ", "( ͡° ͜ʖ ͡°)", "(๑•̀ㅂ•́)و✧", "ヾ(￣▽￣)", "(*´∀`*)", "ヽ(・∀・)ﾉ"],
      send: ["(っ˘ڡ˘ς)", "(๑´ڡ`๑)", "〜(꒪꒳꒪)〜", "(≧ڡ≦*)", "(￣ρ￣)", "(๑•̀ㅂ•́)و✧"],
      task: ["(・ω・)ノ", "(ง •̀_•́)ง", "٩(ˊᗜˋ*)و", "ヾ(≧▽≦*)o", "(๑•̀ㅂ•́)و✧", "ヽ(・∀・)ﾉ"],
    };
    // 随机选一个颜文字（不重复连续两次）
    var pool = KAOMOJI[eventType] || KAOMOJI.poke;
    var kaomoji = pool[Math.floor(Math.random() * pool.length)];
    // 互动处理指引：告诉 Agent 这是什么事件、建议怎么回应
    // 方案 A（精简版）：同一会话只注入一次完整指引，后续互动只加简短提示
    // （完整指引每次重复会累积成上下文污染——长会话里重复 50 字×N 次）
    // 完整指引让“陌生会话”知道怎么处理；简短版让“已知会话”不重复学习
    // 名字动态读取：config.name（状态面板设置里的名字），与便签签名一致
    var myName = "桑多涅";
    try {
      var cfgNow = readConfig();
      if (cfgNow && typeof cfgNow.name === "string" && cfgNow.name.trim()) {
        myName = cfgNow.name.trim();
      }
    } catch (e) {}
    try {
      var GUIDE = {
        poke: "【互动事件：你在状态面板戳了" + myName + "一下。请以角色身份自然回应，并把互动写进状态：调用 san_update_status 更新 activity/bubble 等。】",
        send: "【互动事件：你在状态面板给了" + myName + "东西。请以角色身份收下并回应，必要时调用 san_update_status 更新状态。】",
        task: "【互动事件：你想让" + myName + "去打工赚摩拉。请调用 san_approve_entertainment_task 审批：先判断是否同意（可参考钱包余额），同意传 approved=true，拒绝传 false，并说明理由。】",
      };
      var SHORT = {
        poke: "【你戳了" + myName + "一下】",
        send: "【你给了" + myName + "东西】",
        task: "【你想让" + myName + "打工赚摩拉】",
      };
      var guide = GUIDE[eventType];
      if (guide) {
        // 记录“完整指引已注入”的会话（用目标会话路径做 key，按天重置）
        var guideCache = path.join(dataDir, "guide-tags.json");
        var guideMap = {};
        try { if (fs.existsSync(guideCache)) guideMap = JSON.parse(fs.readFileSync(guideCache, "utf-8")); } catch (e) {}
        var today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
        // 目标会话路径此时可能还没解析出来，先用占位；下方解析出 fp 后补录
        // 如果缓存里该会话今天已注入过完整指引 → 用简短版
        var useShort = false;
        try {
          var fpPreview = null;
          var cfgTmp = readConfig();
          if (cfgTmp.targetSession && fs.existsSync(cfgTmp.targetSession)) fpPreview = cfgTmp.targetSession;
          if (fpPreview && guideMap[fpPreview] === today) useShort = true;
        } catch (e) {}
        text = (useShort ? SHORT[eventType] : guide) + " " + text;
      }
    } catch (e) {}
    var pluginCtx = c.get("pluginCtx");
    if (!pluginCtx || !pluginCtx.bus) return;
    var cfg = readConfig();
    var agentId = cfg.targetAgent || c.get("agentId") || null;
    var fp = null;
    // 1. 优先用配置里选中的会话（不再过滤 bridge/phone，让 Hana 决定）
    if (cfg.targetSession) {
      fp = cfg.targetSession;
      if (!fs.existsSync(fp)) fp = null;
    }
    // 2. 回退到缓存（不再过滤 bridge/phone）
    if (!fp) {
      try {
        var cache = path.join(dataDir, "session-info.json");
        if (fs.existsSync(cache)) {
          var si = JSON.parse(fs.readFileSync(cache, "utf-8"));
          if (
            si.sessionPath &&
            fs.existsSync(si.sessionPath) &&
            (!agentId || si.agentId === agentId)
          ) fp = si.sessionPath;
        }
      } catch (e) {}
    }
    // 3. 再回退到扫描最新会话（递归找 bridge）
    if (!fp && agentId) {
      try {
        var sd = path.join(HANA_HOME, "agents", agentId, "sessions");
        if (fs.existsSync(sd)) {
          var all = [];
          function walkSessions(d) {
            try {
              var items = fs.readdirSync(d, { withFileTypes: true });
              for (var wi2 = 0; wi2 < items.length; wi2++) {
                if (items[wi2].isDirectory()) {
                  if (items[wi2].name === "archived") continue;
                  walkSessions(path.join(d, items[wi2].name));
                } else if (items[wi2].name.endsWith(".jsonl") && !items[wi2].name.startsWith("session-titles")) {
                  all.push(path.join(d, items[wi2].name));
                }
              }
            } catch (e) {}
          }
          walkSessions(sd);
          all.sort(function(a,b){ try { return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs; } catch(e){ return 0; } });
          if (all.length > 0) fp = all[0];
        }
      } catch (e) {}
    }
    if (!fp) return;

    // 补录：本次是否用了完整指引（决定下次是否走简短版）
    // 只有当本次发送的是【完整指引】时才记录——简短版不覆盖记录（保持完整版已注入状态）
    try {
      var guideCache2 = path.join(dataDir, "guide-tags.json");
      var guideMap2 = {};
      try { if (fs.existsSync(guideCache2)) guideMap2 = JSON.parse(fs.readFileSync(guideCache2, "utf-8")); } catch (e) {}
      var today2 = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
      // 前面决定 useShort 时已经读过缓存；这里在 fp 确定后，若本次用的是完整版则写入
      // （用简短版时不写——因为完整版已注入过的标记应该保持）
      if (guideMap2[fp] !== today2 && text.indexOf("互动事件：") >= 0) {
        guideMap2[fp] = today2;
        try { fs.writeFileSync(guideCache2, JSON.stringify(guideMap2), "utf-8"); } catch (e) {}
      }
    } catch (e) {}

    // 时间策略（2026-08-08 优化）：不再注入具体时间戳，改为指引模型用 current_status 实时查
    // 原因：注入时间会写入会话 → 累积污染上下文 + 过期误导（旧时间被当现在）
    // current_status 实时查询：零污染、永远最新，用完即弃
    // 只保留“事件锚点”语义：告诉模型这是互动事件，判断时间请用实时工具
    try {
      var timeGuide = "【时间提示：判断当前时间/日期请调用 current_status 实时查询，勿参考本会话历史中的旧时间】";
      text = timeGuide + " " + text;
      // 清理旧的时间标签缓存（不再使用，避免残留）
      try { var oldTag = path.join(dataDir, "time-tags.json"); if (fs.existsSync(oldTag)) fs.unlinkSync(oldTag); } catch (e) {}
    } catch (e) {}

    // 发送：优先 WS prompt（支持 displayMessage 简短显示 + 收尾事件），失败回退 session:send
    // 前端显示文本 = 事件简短描述（不含时间提示/完整指引），模型收到完整 text
        var displayText = (function () {
      // UI 显示：颜文字（无信息量事件提示）——第三方通道只表示“互动已触发”
      return kaomoji;
    })();
    var fullText = text;
    wsPrompt(fp, fullText, displayText).then(function (ok) {
      if (ok) {
        log?.info?.("[状态面板] 互动消息已发送 (WS):", fp);
      } else {
        log?.warn?.("[状态面板] WS 失败，回退 session:send");
        sendFallback(pluginCtx.bus, fp, fullText);
      }
    });
  };
}
