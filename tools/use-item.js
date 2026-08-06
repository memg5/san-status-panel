// tools/use-item.js — 桑多涅真正"使用"背包里的东西
// 对话里说"吃苹果/喝雪碧"时，不能只嘴上说说——要真的检查背包、扣减库存、更新状态。
// 触发规则：对话中有明确使用意图（"我要吃…""你吃个…吧"）才调用；背包没有就老实说没有。
import { defineTool } from "@hana/plugin-runtime";
import fs from "node:fs";
import path from "node:path";
import { nowStamp, nowLocal } from "../lib/now.js";

// 物品使用效果：吃/喝后对状态的影响
const EFFECTS = {
  apple:        { hunger: 12, energy: 3,  mood: "愉快",   line: "咔嚓——这苹果真脆。" },
  banana:       { hunger: 15, energy: 6,  mood: "满足",   line: "软糯糯的，力气回来了点。" },
  mango:        { hunger: 10, energy: 4,  mood: "开心",   line: "芒果的甜在嘴里化开了。" },
  watermelon:   { hunger: 8,  energy: 2,  mood: "清爽",   line: "一口下去，夏天都变凉快了。" },
  grape:        { hunger: 6,  energy: 3,  mood: "愉快",   line: "一颗一颗停不下来。" },
  lychee:       { hunger: 6,  energy: 3,  mood: "开心",   line: "一骑红尘，甜到心里。" },
  strawberry:   { hunger: 5,  energy: 2,  mood: "幸福",   line: "草莓的香气把心情都染红了。" },
  jicama:       { hunger: 18, energy: 4,  mood: "踏实",   line: "地瓜管饱，吃了心里踏实。" },
  "peking-duck": { hunger: 30, energy: 8, mood: "满足",   line: "烤鸭！这一顿值了。" },
  "donkey-burger": { hunger: 28, energy: 7, mood: "满足", line: "驴肉火烧，香得很。" },
  "char-siu":   { hunger: 26, energy: 7,  mood: "满足",   line: "叉烧的蜜汁还在舌尖上。" },
  jianbing:     { hunger: 24, energy: 6,  mood: "愉快",   line: "煎饼果子，脆得刚刚好。" },
  "yangchun-noodle": { hunger: 26, energy: 5, mood: "温暖", line: "一碗阳春面，汤都喝干净了。" },
  "lanzhou-ramen": { hunger: 26, energy: 5, mood: "满足", line: "牛肉面，辣子香得很。" },
  "red-bean-bun": { hunger: 16, energy: 4, mood: "愉快",  line: "豆沙包，甜而不腻。" },
  "siu-mai":    { hunger: 22, energy: 5,  mood: "满足",   line: "烧麦一笼，热气腾腾。" },
  "seaweed-soup": { hunger: 14, energy: 3, mood: "温暖",  line: "紫菜蛋花汤，暖暖的。" },
  "oil-tea":    { hunger: 18, energy: 5,  mood: "温暖",   line: "油茶汤，土家的味道。" },
  "cabbage-soup": { hunger: 15, energy: 3, mood: "温暖",  line: "白菜汤，家常的舒服。" },
  chips:        { hunger: 8,  energy: 2,  mood: "快乐",   line: "咔嚓咔嚓，薯片见了底。" },
  jelly:        { hunger: 5,  energy: 1,  mood: "开心",   line: "果冻滑溜溜的，好玩。" },
  latiao:       { hunger: 6,  energy: 2,  mood: "上头",   line: "辣条！辣得嘶哈嘶哈。" },
  "instant-noodle": { hunger: 20, energy: 4, mood: "满足", line: "泡面泡好了，香气冲天。" },
  "ham-sausage": { hunger: 10, energy: 3, mood: "愉快",   line: "火腿肠，掰开就是香。" },
  chocolate:    { hunger: 8,  energy: 8,  mood: "幸福",   line: "巧克力化开，力气回来了。" },
  guoba:        { hunger: 10, energy: 3,  mood: "开心",   line: "锅巴，越嚼越香。" },
  cola:         { hunger: 0,  energy: 6,  mood: "爽快",   line: "可乐的气泡在喉咙里炸开。" },
  sprite:       { hunger: 0,  energy: 6,  mood: "爽快",   line: "雪碧，冰凉的清爽。" },
  lemonade:     { hunger: 0,  energy: 5,  mood: "清爽",   line: "柠檬水，酸得精神一振。" },
  c100:         { hunger: 0,  energy: 8,  mood: "清爽",   line: "水溶C100，维C补上。" },
  "orange-juice": { hunger: 2, energy: 6, mood: "愉快",   line: "橘子汁，酸甜刚好。" },
  suanmeitang:  { hunger: 2,  energy: 5,  mood: "开心",   line: "酸梅汤——梦的最爱，我也尝尝。" },
};

const tool = defineTool({
  name: "san_use_item",
  description:
    "真正使用背包里的东西（吃/喝）。对话中说要吃/喝某个东西时调用：检查背包库存、扣减、更新状态（饱腹/精力/心情）并记录。背包里没有的东西不能假装吃掉——会如实告知。",
  parameters: {
    type: "object",
    properties: {
      itemId: {
        type: "string",
        description: "要使用的商品 id，如 apple、sprite、red-bean-bun。必须是背包里有的。",
      },
      quantity: {
        type: "integer",
        description: "使用数量，默认 1",
      },
      by: {
        type: "string",
        description: "谁使用：sandrone（桑多涅自己）或 owner（主人）。默认 sandrone。",
      },
      note: {
        type: "string",
        description: "桑多涅亲笔的事件概括（可选）——一句有生活气息的话，会写进账本，比如'咕噜咕噜，冰得眼睛眯了一下'。不传则账本用默认文案。",
      },
    },
    required: ["itemId"],
  },
  async execute(input, toolCtx) {
    try {
      const dataDir = toolCtx.dataDir;
      const dataPath = path.join(dataDir, "shop_data.json");
      if (!fs.existsSync(dataPath)) {
        return { content: [{ type: "text", text: "小铺数据不存在。" }] };
      }

      const d = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
      if (!d.inventory || typeof d.inventory !== "object") d.inventory = {};
      if (!Array.isArray(d.purchases)) d.purchases = [];

      const itemId = input.itemId;
      const qty = Math.max(1, Math.floor(input.quantity || 1));
      const by = input.by === "owner" ? "owner" : "sandrone";

      const effect = EFFECTS[itemId];
      if (!effect) {
        return { content: [{ type: "text", text: "这个（" + itemId + "）小铺里没进过货，吃不了。" }] };
      }

      const have = d.inventory[itemId] || 0;
      if (have < qty) {
        // 库存不足：如实告知，不能假装用了
        const left = have;
        const names = [];
        for (const k in d.inventory) {
          if (d.inventory[k] > 0) names.push(k);
        }
        const hint = names.length > 0
          ? " 现在背包里有：" + names.map((id) => {
              const item = [{ id: "apple", name: "苹果" }, { id: "banana", name: "香蕉" }, { id: "mango", name: "芒果" }, { id: "watermelon", name: "西瓜" }, { id: "grape", name: "葡萄" }, { id: "lychee", name: "荔枝" }, { id: "strawberry", name: "草莓" }, { id: "jicama", name: "地瓜" }, { id: "peking-duck", name: "北京烤鸭" }, { id: "donkey-burger", name: "驴肉火烧" }, { id: "char-siu", name: "叉烧" }, { id: "jianbing", name: "杂粮煎饼" }, { id: "yangchun-noodle", name: "阳春面" }, { id: "lanzhou-ramen", name: "兰州牛肉面" }, { id: "red-bean-bun", name: "豆沙包" }, { id: "siu-mai", name: "香菇肉沫烧麦" }, { id: "seaweed-soup", name: "紫菜蛋花汤" }, { id: "oil-tea", name: "油茶汤" }, { id: "cabbage-soup", name: "肉沫白菜汤" }, { id: "chips", name: "薯片" }, { id: "jelly", name: "果冻" }, { id: "latiao", name: "辣条" }, { id: "instant-noodle", name: "泡面" }, { id: "ham-sausage", name: "火腿肠" }, { id: "chocolate", name: "巧克力" }, { id: "guoba", name: "锅巴" }, { id: "cola", name: "可乐" }, { id: "sprite", name: "雪碧" }, { id: "lemonade", name: "柠檬水" }, { id: "c100", name: "水溶C100" }, { id: "orange-juice", name: "橘子汁" }, { id: "suanmeitang", name: "酸梅汤" }].find((x) => x.id === id)?.name || id
              return id + "×" + d.inventory[id];
            }).join("、") : "（背包空空如也）";
        return {
          content: [{
            type: "text",
            text: "吃不了——背包里" + (left > 0 ? "只有 " + left + " 个" : "没有") + "这个了。" + hint,
          }],
        };
      }

      // 扣减库存
      d.inventory[itemId] -= qty;
      if (d.inventory[itemId] <= 0) delete d.inventory[itemId];

      // 记流水（账本）
      const name = EFFECTS[itemId].line ? itemId : itemId;
      const itemNameMap = {
        apple: "苹果", banana: "香蕉", mango: "芒果", watermelon: "西瓜", grape: "葡萄",
        lychee: "荔枝", strawberry: "草莓", jicama: "地瓜", "peking-duck": "北京烤鸭",
        "donkey-burger": "驴肉火烧", "char-siu": "叉烧", jianbing: "杂粮煎饼",
        "yangchun-noodle": "阳春面", "lanzhou-ramen": "兰州牛肉面", "red-bean-bun": "豆沙包",
        "siu-mai": "香菇肉沫烧麦", "seaweed-soup": "紫菜蛋花汤", "oil-tea": "油茶汤",
        "cabbage-soup": "肉沫白菜汤", chips: "薯片", jelly: "果冻", latiao: "辣条",
        "instant-noodle": "泡面", "ham-sausage": "火腿肠", chocolate: "巧克力", guoba: "锅巴",
        cola: "可乐", sprite: "雪碧", lemonade: "柠檬水", c100: "水溶C100",
        "orange-juice": "橘子汁", suanmeitang: "酸梅汤",
      };
      d.purchases.push({
        use: true,
        itemId: itemId,
        qty: qty,
        by: by,
        note: input.note || "",
        at: nowStamp(),
        tsLocal: nowLocal(),
      });
      if (d.purchases.length > 100) d.purchases = d.purchases.slice(-100);

      const tmpPath = dataPath + ".tmp";
      fs.writeFileSync(tmpPath, JSON.stringify(d, null, 2), "utf-8");
      fs.renameSync(tmpPath, dataPath);

      toolCtx.bus?.emit("san-status-panel:item-used", {
        itemId: itemId,
        name: itemNameMap[itemId] || itemId,
        qty: qty,
        by: by,
        usedAt: new Date().toISOString(),
      });

      const byText = by === "owner" ? "梦" : "桑多涅";
      const usedText = qty > 1 ? (itemNameMap[itemId] || itemId) + "×" + qty : (itemNameMap[itemId] || itemId);
      return {
        content: [{
          type: "text",
          text: byText + "用了 " + usedText + "。" + effect.line + " 背包里还剩 " + (d.inventory[itemId] || 0) + " 个。",
        }],
        details: {
          item: itemNameMap[itemId] || itemId,
          qty: qty,
          by: by,
          effect: effect,
          inventory: d.inventory,
        },
      };
    } catch (error) {
      toolCtx.log.error("[san_use_item] 失败:", error);
      return {
        content: [{ type: "text", text: "用的时候出了点岔子。" }],
        isError: false,
      };
    }
  },
});

export const { name, description, parameters, execute } = tool;
