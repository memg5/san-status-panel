// routes/trigger-reply.js — 触发 Agent 回复的共享逻辑
// 供 ui.js（poke/投喂）与 shop.js（娱乐任务申请）复用：
// 把一段文本注入目标会话，唤醒 Agent 处理。
// 用法：
//   import { createTriggerReply } from "./trigger-reply.js";
//   const triggerReply = createTriggerReply({ dataDir, configPath, log });
//   triggerReply(c, "主人戳了你一下。");
import fs from "node:fs";
import path from "node:path";

export function createTriggerReply(opts) {
  const { dataDir, configPath, log } = opts;
  const HANA_HOME = path.dirname(path.dirname(dataDir));
  let lastInteraction = 0;
  const MIN_INTERVAL = 3000;

  function readConfig() {
    try {
      return JSON.parse(fs.readFileSync(configPath, "utf-8"));
    } catch (e) {
      return {};
    }
  }

  return function tryTriggerReply(c, text, eventType) {
    var now = Date.now();
    if (now - lastInteraction < MIN_INTERVAL) return;
    lastInteraction = now;
    // 互动处理指引：告诉 Agent 这是什么事件、建议怎么回应
    // （别的会话没有上下文，需要插件把“怎么处理”也传过去）
    try {
      var GUIDE = {
        poke: "【互动事件：主人在状态面板戳了你一下。请以角色身份自然回应，并把互动写进状态：调用 san_update_status 更新 activity/bubble 等。】",
        send: "【互动事件：主人在状态面板给了你东西。请以角色身份收下并回应，必要时调用 san_update_status 更新状态。】",
        task: "【互动事件：主人想让你去打工赚摩拉。请调用 san_approve_entertainment_task 审批：先判断是否同意（可参考钱包余额），同意传 approved=true，拒绝传 false，并说明理由。】",
      };
      var guide = GUIDE[eventType];
      if (guide) text = guide + " " + text;
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

    // 互动规则：注入当前时间（按会话记账，1 小时内同一会话只注一次）
    // 时间戳是“锚点”不是“报时”——注入后让 Agent 靠对话节奏自然延续
    try {
      var tagCache = path.join(dataDir, "time-tags.json");
      var tagMap = {};
      try {
        if (fs.existsSync(tagCache)) tagMap = JSON.parse(fs.readFileSync(tagCache, "utf-8"));
      } catch (e) {}
      var lastTag = tagMap[fp] || 0;
      if (now - lastTag >= 60 * 60 * 1000) {
        // 显式 Asia/Shanghai 时区，不依赖服务器默认时区
        var d = new Date(now + 8 * 60 * 60 * 1000); // UTC+8 手动偏移
        var week = ["日", "一", "二", "三", "四", "五", "六"];
        var hh = (d.getUTCHours() < 10 ? "0" : "") + d.getUTCHours();
        var mm = (d.getUTCMinutes() < 10 ? "0" : "") + d.getUTCMinutes();
        var timeTag = "【现在是 " + (d.getUTCMonth() + 1) + "月" + d.getUTCDate() + "日 星期" + week[d.getUTCDay()] + " " + hh + ":" + mm + "】（时间仅作参考）";
        text = timeTag + " " + text;
        tagMap[fp] = now;
        try {
          fs.writeFileSync(tagCache, JSON.stringify(tagMap), "utf-8");
        } catch (e) {}
      }
    } catch (e) {}

    // bridge/phone 会话：直接写文件（不在 Hana manifest 中，无法用 session:send）
    // 兼容 Windows 反斜杠路径：将反斜杠统一转为正斜杠再检测
    var fpNormalized = fp.replace(/\\/g, '/');
    if (/\/bridge\/|\/phone\//.test(fpNormalized)) {
      try {
        var now2 = new Date().toISOString();
        // 找到最后一条 message 的 id 作为 parentId
        var parentId = null;
        try {
          var allLines = fs.readFileSync(fp, "utf-8").split("\n").filter(Boolean);
          for (var li = allLines.length - 1; li >= 0; li--) {
            try {
              var ld = JSON.parse(allLines[li]);
              if (ld.type === "message") { parentId = ld.id; break; }
            } catch (e) {}
          }
        } catch (e) {}
        var msgId = Math.random().toString(36).substring(2, 10);
        var msgLine = JSON.stringify({
          type: "message",
          id: msgId,
          parentId: parentId,
          timestamp: now2,
          message: { role: "user", content: [{ type: "text", text: text }] }
        });
        fs.appendFileSync(fp, msgLine + "\n", "utf-8");
        log?.info?.("[状态面板] bridge 消息已写入:", fp);
        // 触发推送事件通知桥接插件
        pluginCtx.bus.emit("session:updated", { sessionPath: fp }).catch(function () {});
      } catch (e) {
        log?.error?.("[状态面板] bridge 写入失败:", e.message);
      }
      return;
    }

    // 普通会话：通过 Hana session:send
    var lineCount = 0;
    try { lineCount = fs.readFileSync(fp, "utf-8").split("\n").filter(function(l){return l.trim();}).length; } catch(e){}
    pluginCtx.bus.request("session:send", { text: text, sessionPath: fp })
      .then(function () {
        // 轮询 session 文件，等 output 完成
        var pollTimer = setInterval(function () {
          try {
            var lines = fs.readFileSync(fp, "utf-8").split("\n").filter(function(l){return l.trim();});
            if (lines.length > lineCount) {
              var lastRaw = lines[lines.length - 1];
              var last = null;
              try { last = JSON.parse(lastRaw); } catch (ex) { last = { raw: lastRaw }; }
              var msg = last.message || last.d || last;
              // 有些实现将 stopReason 写在顶层（last）而非 message 内，兼容多种字段命名
              var stopReason = last.stopReason || last.stop_reason || (msg && (msg.stopReason || msg.stop_reason));
              var role = (msg && (msg.role || msg.message && msg.message.role)) || last.role || null;

              // 写入调试文件，便于后续分析（非阻塞）
              try {
                var debugPath = path.join(dataDir, "debug-session-sample.txt");
                var dbg = {
                  ts: new Date().toISOString(),
                  sessionPath: fp,
                  totalLines: lines.length,
                  lastRaw: lastRaw,
                  parsedLast: last,
                  detectedRole: role,
                  detectedStopReason: stopReason,
                  lineCountBefore: lineCount
                };
                fs.appendFileSync(debugPath, JSON.stringify(dbg) + "\n", "utf-8");
              } catch (exDbg) { /* ignore debug write errors */ }

              // 只有 role 为 assistant 且 stopReason 为 "stop" 时才视为最终回复
              if (role === "assistant" && stopReason === "stop") {
                clearInterval(pollTimer);
                pluginCtx.bus.request("session:abort", { sessionPath: fp }).catch(function(){});
              }
            }
          } catch(e){
            try {
              var debugErrPath = path.join(dataDir, "debug-session-errors.txt");
              fs.appendFileSync(debugErrPath, new Date().toISOString() + " ERROR: " + (e && e.stack ? e.stack : String(e)) + "\n", "utf-8");
            } catch(_) {}
          }
        }, 500);
        // 安全兜底：30 秒后强制停止
        setTimeout(function () { if (typeof pollTimer !== 'undefined') clearInterval(pollTimer); }, 30000);
      })
      .catch(function (err) {
        log?.error?.("[状态面板] session:send 失败", err?.message || err);
      });
  };
}
