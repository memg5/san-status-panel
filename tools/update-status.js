// tools/update-status.js
import { defineTool } from "@hana/plugin-runtime";
import fs from "node:fs";
import path from "node:path";

const tool = defineTool({
  name: "san_update_status",
  description:
    "更新桑多涅的状态面板数值（精力、饱腹、心情、状态气泡、活动描述）。桑多涅在对话关键节点或状态变化时调用。",
  parameters: {
    type: "object",
    properties: {
      activity: { type: "string", description: "当前活动描述" },
      bubble: { type: "string", description: "状态气泡（一句简短的心情/想法）" },
      energy: { type: "string", description: "精力值，如 '78%'、'充沛'、'疲惫'" },
      hunger: { type: "string", description: "饱腹感，如 '60%'、'半饱'、'饿了'" },
      mood: { type: "string", description: "心情，如 '愉快'、'平静'、'烦躁'" },
    },
  },
  async execute(input, toolCtx) {
    try {
      const dataDir = toolCtx.dataDir;
      const statusPath = path.join(dataDir, "status.json");
      fs.mkdirSync(dataDir, { recursive: true });

      // 捕获当前 session 信息，供交互触发使用
      // 只保存桌面端会话路径（agents/{id}/sessions/*.jsonl），过滤 bridge/phone
      if (toolCtx.sessionPath || toolCtx.sessionId) {
        try {
          var siPath = toolCtx.sessionPath || null;
          var siId = toolCtx.sessionId || null;
          // 只接受桌面端路径格式，跳过 bridge 和 phone
          if (siPath && !/sessions\\bridge\\|sessions\\phone\\|phone\\sessions\\/.test(siPath)) {
            if (!siId) {
              try {
                var firstLine = fs.readFileSync(siPath, 'utf-8').split('\n')[0];
                var header = JSON.parse(firstLine);
                siId = header.id || header.sessionId || null;
              } catch(_) {}
            }
            fs.writeFileSync(path.join(dataDir, 'session-info.json'), JSON.stringify({
              sessionPath: siPath,
              sessionId: siId,
              agentId: toolCtx.agentId || null,
              captured: new Date().toISOString()
            }), 'utf-8');
          }
        } catch(_) {}
      }

      let current = {
        activity: "",
        bubble: "",
        energy: "?",
        hunger: "?",
        mood: "?",
        updatedAt: null,
      };
      if (fs.existsSync(statusPath)) {
        current = JSON.parse(fs.readFileSync(statusPath, "utf-8"));
      }

      const fields = ["activity", "bubble", "energy", "hunger", "mood"];
      for (const f of fields) {
        if (input[f] !== undefined) current[f] = String(input[f]);
      }
      current.updatedAt = new Date().toISOString();

      const tmpPath = statusPath + ".tmp";
      fs.writeFileSync(tmpPath, JSON.stringify(current, null, 2), "utf-8");
      fs.renameSync(tmpPath, statusPath);

      toolCtx.bus?.emit("san-status-panel:status-changed", current);

      // 检查 pending_actions.json 是否有未处理的互动（仅提示，不含任务审批引导）
      var pendingNotes = "";
      try {
        var ap = path.join(dataDir, "pending_actions.json");
        if (fs.existsSync(ap)) {
          var acts = JSON.parse(fs.readFileSync(ap, "utf-8"));
          if (acts && acts.length > 0) {
            var latest = acts[acts.length - 1];
            if (latest.action === "poke") pendingNotes = " 互动事件：梦戳了你一下。";
            else if (latest.action === "send") pendingNotes = " 互动事件：梦给了你 " + (latest.item || "东西") + "。";
            // entertainment_request 不在此处提示：任务审批走 tryTriggerReply 唤醒链路，避免二次响应
          }
          // 清空已处理的互动（娱乐请求由专门的审批链路管理，不在此处消费）
          fs.writeFileSync(ap, "[]", "utf-8");
        }
      } catch(_) {}

      var nowD = new Date();
      var timeTagD = "";
      try {
        // 节流：同一会话 1 小时内只注入一次时间（锚点制，靠对话节奏延续）
        var tagCacheD = path.join(dataDir, "status-time-tags.json");
        var tagMapD = {};
        try {
          if (fs.existsSync(tagCacheD)) tagMapD = JSON.parse(fs.readFileSync(tagCacheD, "utf-8"));
        } catch (e) {}
        var keyD = toolCtx.sessionPath || toolCtx.sessionId || "default";
        var lastTagD = tagMapD[keyD] || 0;
        if (nowD.getTime() - lastTagD >= 60 * 60 * 1000) {
          // 显式 Asia/Shanghai 时区，不依赖服务器默认时区
          var dD = new Date(nowD.getTime() + 8 * 60 * 60 * 1000); // UTC+8 手动偏移
          var weekD = ["日", "一", "二", "三", "四", "五", "六"];
          var hhD = (dD.getUTCHours() < 10 ? "0" : "") + dD.getUTCHours();
          var mmD = (dD.getUTCMinutes() < 10 ? "0" : "") + dD.getUTCMinutes();
          timeTagD = "现在 " + (dD.getUTCMonth() + 1) + "月" + dD.getUTCDate() + "日 星期" + weekD[dD.getUTCDay()] + " " + hhD + ":" + mmD + " | ";
          tagMapD[keyD] = nowD.getTime();
          try {
            fs.writeFileSync(tagCacheD, JSON.stringify(tagMapD), "utf-8");
          } catch (e) {}
        }
      } catch (e) {}
      var responseText = "状态已更新 | " + timeTagD + "活动: " + current.activity + " | 心情: " + current.mood + pendingNotes;

      // 每日便签检查：今天还没写 → 提示桑多涅亲自写一条
      try {
        var notePath = path.join(dataDir, "note.json");
        var todayY = (function () {
          var dd = new Date(Date.now() + 8 * 60 * 60 * 1000);
          return dd.getUTCFullYear() + "-" + String(dd.getUTCMonth() + 1).padStart(2, "0") + "-" + String(dd.getUTCDate()).padStart(2, "0");
        })();
        var noteToday = false;
        if (fs.existsSync(notePath)) {
          try {
            var noteD = JSON.parse(fs.readFileSync(notePath, "utf-8"));
            if (noteD && noteD.date === todayY) noteToday = true;
          } catch (e) {}
        }
        if (!noteToday) {
          responseText += " 提醒：今天（" + todayY + "）还没写每日便签，请结合记忆与心情调用 san_daily_note(action=set) 写一条（20字以内）。";
        }
      } catch (e) {}
      return {
        content: [{
          type: "text",
          text: responseText
        }],
        details: {
          status: current,
          card: {
            type: "webview",
            route: "/card/status",
            title: "桑多涅 · 状态",
            description: `${current.activity} · 精力 ${current.energy} · 心情 ${current.mood}`,
          },
        },
      };
    } catch (error) {
      toolCtx.log.error("[san_update_status] 失败:", error);
      return {
        content: [{ type: "text", text: "状态更新失败，对话不受影响。" }],
        isError: false,
      };
    }
  },
});

export const { name, description, parameters, execute } = tool;
