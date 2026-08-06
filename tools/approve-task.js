// tools/approve-task.js
import { defineTool } from "@hana/plugin-runtime";
import fs from "node:fs";
import path from "node:path";

const tool = defineTool({
  name: "san_approve_entertainment_task",
  description:
    "同意或拒绝主人的娱乐打工请求。主人想让桑多涅去打工赚钱，桑多涅根据当前心情、状态和角色设定决定是否同意。同意后计时器开始运行，拒绝则不进入冷却。",
  parameters: {
    type: "object",
    properties: {
      taskId: {
        type: "string",
        description: "任务ID：repair-shop（维修店上班）、fish-river（钓鱼）、farm-tomato（农场收番茄）",
        enum: ["repair-shop", "fish-river", "farm-tomato"],
      },
      approved: {
        type: "boolean",
        description: "是否同意主人去做这个任务。true=同意，false=拒绝",
      },
    },
    required: ["taskId", "approved"],
  },
  async execute(input, toolCtx) {
    try {
      const dataDir = toolCtx.dataDir;
      const dataPath = path.join(dataDir, "shop_data.json");

      if (!fs.existsSync(dataPath)) {
        return { content: [{ type: "text", text: "商店数据不存在，无法处理任务审批。" }] };
      }

      const d = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
      if (!d.income || !d.income.pendingApproval) {
        return { content: [{ type: "text", text: "当前没有待审批任务。" }] };
      }

      const pending = d.income.pendingApproval;
      if (pending.taskId !== input.taskId) {
        return {
          content: [{
            type: "text",
            text: "待审批任务不匹配。当前待审批的是：" + pending.taskId + "，你指定的是：" + input.taskId,
          }],
        };
      }

      if (input.approved) {
        // 同意 → 启动计时器
        d.income.activeEntertainmentTask = {
          taskId: pending.taskId,
          startedAt: new Date().toISOString(),
          durationMinutes: pending.durationMinutes,
          amount: pending.amount,
          name: pending.name,
        };
        d.income.pendingApproval = null;

        const tmpPath = dataPath + ".tmp";
        fs.writeFileSync(tmpPath, JSON.stringify(d, null, 2), "utf-8");
        fs.renameSync(tmpPath, dataPath);

        toolCtx.bus?.emit("san-status-panel:task-approved", {
          taskId: pending.taskId,
          name: pending.name,
          approvedAt: new Date().toISOString(),
        });

        return {
          content: [{
            type: "text",
            text: "好的，我去" + pending.name + "了～ (" + pending.duration + "后回来，能赚 " + pending.amount + " 摩拉)",
          }],
        };
      } else {
        // 拒绝 → 清空 pending，不计冷却
        const taskName = pending.name;
        d.income.pendingApproval = null;

        const tmpPath = dataPath + ".tmp";
        fs.writeFileSync(tmpPath, JSON.stringify(d, null, 2), "utf-8");
        fs.renameSync(tmpPath, dataPath);

        toolCtx.bus?.emit("san-status-panel:task-rejected", {
          taskId: input.taskId,
          name: taskName,
          rejectedAt: new Date().toISOString(),
        });

        return {
          content: [{
            type: "text",
            text: "不行哦，今天不想去" + taskName + "。",
          }],
        };
      }
    } catch (error) {
      toolCtx.log.error("[san_approve_entertainment_task] 失败:", error);
      return {
        content: [{ type: "text", text: "任务审批处理失败。" }],
        isError: false,
      };
    }
  },
});

export const { name, description, parameters, execute } = tool;
