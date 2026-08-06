// tools/daily-note.js — 桑多涅每日亲笔便签
// 便签正文由桑多涅结合记忆/心情/当天互动亲自编写，存入 note.json。
// 前端每日加载时读取；桑多涅在每天第一次互动（更新状态）时收到"未写"提示后调用本工具。
import { defineTool } from "@hana/plugin-runtime";
import fs from "node:fs";
import path from "node:path";

function todayYMD() {
  // Asia/Shanghai 显式偏移，避免 UTC 跨日
  const d = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return (
    d.getUTCFullYear() + "-" +
    String(d.getUTCMonth() + 1).padStart(2, "0") + "-" +
    String(d.getUTCDate()).padStart(2, "0")
  );
}

function todayText() {
  const d = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const week = ["日", "一", "二", "三", "四", "五", "六"];
  return (d.getUTCMonth() + 1) + "月" + d.getUTCDate() + "日 星期" + week[d.getUTCDay()];
}

const tool = defineTool({
  name: "san_daily_note",
  description:
    "写/查桑多涅的每日便签。每天第一次互动时，如果还没有今天的便签，桑多涅应结合记忆、当天心情和互动内容亲自编写一条生活化的便签（像早上起来随口说的话，20字以内），调用本工具写入。action=set 写入今天的便签，action=get 查询当前便签。",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        description: "set=写入今天的便签；get=查询当前便签状态",
        enum: ["set", "get"],
      },
      text: {
        type: "string",
        description: "便签正文（action=set 时必填）——一句生活化的话，像早上起来随口说的，结合记忆与心情，20字以内，简短有力",
      },
      mood: {
        type: "string",
        description: "今日心情标签（可选），如'愉快''平静'，会写进便签文件",
      },
    },
    required: ["action"],
  },
  async execute(input, toolCtx) {
    try {
      const dataDir = toolCtx.dataDir;
      const notePath = path.join(dataDir, "note.json");
      const action = input.action === "set" ? "set" : "get";
      const today = todayYMD();

      if (action === "get") {
        let note = null;
        try {
          if (fs.existsSync(notePath)) note = JSON.parse(fs.readFileSync(notePath, "utf-8"));
        } catch (e) {}
        if (note && note.date === today) {
          return {
            content: [{
              type: "text",
              text: "今日便签已写：" + note.text + "（" + note.mood || "无心情标签" + "）",
            }],
            details: { note },
          };
        }
        return {
          content: [{
            type: "text",
            text: "今日（" + todayText() + "）还没有便签。请结合记忆与心情，亲自写一条生活化的今日便签，调用 san_daily_note(action=set) 写入。",
          }],
          details: { note: null, today },
        };
      }

      // set
      const text = String(input.text || "").trim();
      if (!text) {
        return { content: [{ type: "text", text: "便签内容不能为空。" }] };
      }
      const note = {
        date: today,
        dateText: todayText(),
        text: text,
        mood: input.mood || "",
        by: "sandrone",
        updatedAt: new Date().toISOString(),
      };
      const tmpPath = notePath + ".tmp";
      fs.writeFileSync(tmpPath, JSON.stringify(note, null, 2), "utf-8");
      fs.renameSync(tmpPath, notePath);

      toolCtx.bus?.emit("san-status-panel:daily-note", note);

      return {
        content: [{
          type: "text",
          text: "今天的便签写好了：" + text,
        }],
        details: { note },
      };
    } catch (error) {
      toolCtx.log.error("[san_daily_note] 失败:", error);
      return {
        content: [{ type: "text", text: "写便签的时候出了点岔子。" }],
        isError: false,
      };
    }
  },
});

export const { name, description, parameters, execute } = tool;
