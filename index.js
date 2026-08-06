// index.js — 插件入口
import { definePlugin } from "@hana/plugin-runtime";
import fs from "node:fs";
import path from "node:path";

export default definePlugin({
  async onload(ctx) {
    const dataDir = ctx.dataDir;
    const actionsPath = path.join(dataDir, "pending_actions.json");
    const statusPath = path.join(dataDir, "status.json");

    // 初始化 status.json
    if (!fs.existsSync(statusPath)) {
      const initial = {
        activity: "⚙️ 等待桑多涅更新",
        bubble: "",
        energy: "?",
        hunger: "?",
        mood: "?",
        updatedAt: null,
      };
      fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(statusPath, JSON.stringify(initial, null, 2), "utf-8");
    }

    // 初始化交互文件
    if (!fs.existsSync(actionsPath)) {
      fs.writeFileSync(actionsPath, "[]", "utf-8");
    }

    // 文件监控：用户交互自动推送
    let lastSize = fs.statSync(actionsPath).size;
    fs.watch(actionsPath, (eventType) => {
      if (eventType === "change") {
        try {
          const stat = fs.statSync(actionsPath);
          if (stat.size > lastSize) {
            lastSize = stat.size;
            const actions = JSON.parse(fs.readFileSync(actionsPath, "utf-8"));
            if (actions.length > 0) {
              const latest = actions[actions.length - 1];
              ctx.bus.emit("san-status-panel:user-interaction", latest, ctx.sessionPath || void 0);
              ctx.log.info("[状态面板] 用户交互", latest);
            }
          }
        } catch (_) {}
      }
    });

    ctx.log.info("[状态面板] 插件已加载");
  },

  async onunload(ctx) {
    ctx.log.info("[状态面板] 插件已卸载");
  },
});
