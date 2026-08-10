// tools/buy-item.js — 桑多涅替主人去小铺买东西
// 主人不能直接在账本上点购买；购买权在桑多涅手上。
// 主人在对话里说"帮我买个苹果"，桑多涅调用本工具：扣摩拉、商品进背包。
import { defineTool } from "@hana/plugin-runtime";
import fs from "node:fs";
import path from "node:path";
import { nowStamp, nowLocal } from "../lib/now.js";

// 商品清单（与 routes/shop.js 保持一致，避免引入路由模块造成循环依赖）
const ITEMS = [
  { id: "apple", name: "苹果", price: 2, unit: "个" },
  { id: "banana", name: "香蕉", price: 1, unit: "根" },
  { id: "mango", name: "芒果", price: 3, unit: "个" },
  { id: "watermelon", name: "西瓜", price: 3, unit: "份（切块）" },
  { id: "grape", name: "葡萄", price: 6, unit: "斤" },
  { id: "lychee", name: "荔枝", price: 5, unit: "斤" },
  { id: "strawberry", name: "草莓", price: 10, unit: "斤" },
  { id: "jicama", name: "地瓜", price: 2, unit: "个" },
  { id: "peking-duck", name: "北京烤鸭", price: 70, unit: "半套" },
  { id: "donkey-burger", name: "驴肉火烧", price: 15, unit: "个" },
  { id: "char-siu", name: "叉烧", price: 25, unit: "份" },
  { id: "jianbing", name: "杂粮煎饼", price: 10, unit: "个" },
  { id: "yangchun-noodle", name: "阳春面", price: 14, unit: "碗" },
  { id: "lanzhou-ramen", name: "兰州牛肉面", price: 10, unit: "碗" },
  { id: "red-bean-bun", name: "豆沙包", price: 3, unit: "个" },
  { id: "siu-mai", name: "香菇肉沫烧麦", price: 12, unit: "笼" },
  { id: "seaweed-soup", name: "紫菜蛋花汤", price: 8, unit: "碗" },
  { id: "oil-tea", name: "油茶汤", price: 12, unit: "碗" },
  { id: "cabbage-soup", name: "肉沫白菜汤", price: 10, unit: "碗" },
  { id: "chips", name: "薯片", price: 3, unit: "包" },
  { id: "jelly", name: "果冻", price: 3, unit: "杯" },
  { id: "latiao", name: "辣条", price: 1, unit: "包" },
  { id: "instant-noodle", name: "泡面", price: 4.5, unit: "桶" },
  { id: "ham-sausage", name: "火腿肠", price: 1.5, unit: "根" },
  { id: "chocolate", name: "巧克力", price: 8, unit: "条" },
  { id: "guoba", name: "锅巴", price: 4, unit: "包" },
  { id: "cola", name: "可乐", price: 2.8, unit: "瓶" },
  { id: "sprite", name: "雪碧", price: 2.8, unit: "瓶" },
  { id: "lemonade", name: "柠檬水", price: 3.5, unit: "瓶" },
  { id: "c100", name: "水溶C100", price: 3.5, unit: "瓶" },
  { id: "orange-juice", name: "橘子汁", price: 4, unit: "瓶" },
  { id: "suanmeitang", name: "酸梅汤", price: 5, unit: "碗" },
];

const tool = defineTool({
  name: "san_buy_item",
  description:
    "替主人去小铺买东西。主人不能直接点购买，购买权在桑多涅手上。主人在对话里说想吃什么/买什么时，调用本工具：从主人的摩拉钱包扣钱，商品进入背包。可以一次买多件。",
  parameters: {
    type: "object",
    properties: {
      items: {
        type: "array",
        description: "要买的商品列表，每项含商品 id 和数量",
        items: {
          type: "object",
          properties: {
            itemId: {
              type: "string",
              description: "商品 id，如 apple、latiao、instant-noodle。可用的 id 见下方说明。",
            },
            quantity: {
              type: "integer",
              description: "购买数量，默认 1",
            },
          },
          required: ["itemId"],
        },
      },
      reason: {
        type: "string",
        description: "购买的理由（可选）——比如'主人想吃夜宵'，会记进购买记录",
      },
      minKeep: {
        type: "number",
        description: "保留余额底线（可选）：购买后钱包剩余不能低于这个数。桑多涅自主买东西时传 30，花到剩 30 就收手。主人明确要求买则不用传。",
      },
      note: {
        type: "string",
        description: "桑多涅亲笔的事件概括（可选）——一句有生活气息的话，会写进账本，比如'主人和我一人一杯，冰的，咕噜咕噜'。不传则账本用默认文案。",
      },
    },
    required: ["items"],
  },
  async execute(input, toolCtx) {
    try {
      const dataDir = toolCtx.dataDir;
      const dataPath = path.join(dataDir, "shop_data.json");
      const actionsPath = path.join(dataDir, "pending_actions.json");

      if (!fs.existsSync(dataPath)) {
        return { content: [{ type: "text", text: "小铺数据不存在，无法购买。" }] };
      }

      const d = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
      if (typeof d.mora !== "number") d.mora = 0;
      if (!d.inventory || typeof d.inventory !== "object") d.inventory = {};
      if (!Array.isArray(d.purchases)) d.purchases = [];

      // 展开购买清单
      const want = [];
      (input.items || []).forEach(function (it) {
        const qty = Math.max(1, Math.floor(it.quantity || 1));
        for (let i = 0; i < qty; i++) want.push(it.itemId);
      });
      if (want.length === 0) {
        return { content: [{ type: "text", text: "嗯？要买什么，我没看懂你要买的商品。" }] };
      }

      // 计算总价 & 校验
      let total = 0;
      const bought = [];
      const unknown = [];
      for (const id of want) {
        const item = ITEMS.find((x) => x.id === id);
        if (!item) { unknown.push(id); continue; }
        total += item.price;
        bought.push(item);
      }
      if (bought.length === 0) {
        return { content: [{ type: "text", text: "这些商品小铺里没有：" + unknown.join("、") + "。要不看看进货账本上有啥？" }] };
      }

      if (d.mora < total) {
        const short = (total - d.mora).toFixed(1);
        return {
          content: [{
            type: "text",
            text: "摩拉不够了，还差 " + short + " 摩拉（共需 " + total + "）。要不去学习区学一会儿或者让我去打工赚点？",
          }],
        };
      }

      // 保留余额底线：自主购买时钱包不能花到低于 minKeep
      const keep = typeof input.minKeep === "number" ? input.minKeep : 0;
      if (d.mora - total < keep) {
        const available = d.mora - keep;
        return {
          content: [{
            type: "text",
            text: "买不了——得留 " + keep + " 摩拉在钱包里压底，现在最多只能花 " + Math.max(0, available).toFixed(1) + " 摩拉（共需 " + total + "）。",
          }],
        };
      }

      // 扣钱、入背包
      d.mora -= total;
      const names = [];
      for (const item of bought) {
        d.inventory[item.id] = (d.inventory[item.id] || 0) + 1;
        names.push(item.name);
      }
      d.purchases.push({
        itemIds: bought.map((x) => x.id),
        price: total,
        reason: input.reason || "",
        by: "sandrone",
        note: input.note || "",
        at: nowStamp(),
        tsLocal: nowLocal(),
      });
      if (d.purchases.length > 100) d.purchases = d.purchases.slice(-100);

      const tmpPath = dataPath + ".tmp";
      fs.writeFileSync(tmpPath, JSON.stringify(d, null, 2), "utf-8");
      fs.renameSync(tmpPath, dataPath);

      // 写入互动队列，状态面板可感知
      try {
        let actions = [];
        if (fs.existsSync(actionsPath)) actions = JSON.parse(fs.readFileSync(actionsPath, "utf-8"));
        actions.push({
          action: "buy",
          item: names.join("、"),
          total: total,
          reason: input.reason || "",
          timestamp: nowStamp(),
          tsLocal: nowLocal(),
        });
        if (actions.length > 50) actions = actions.slice(-50);
        fs.writeFileSync(actionsPath, JSON.stringify(actions, null, 2), "utf-8");
      } catch (e) {}

      toolCtx.bus?.emit("san-status-panel:item-bought", {
        items: names,
        total: total,
        reason: input.reason || "",
        boughtAt: new Date().toISOString(),
      });

      const reasonText = input.reason ? "（" + input.reason + "）" : "";
      const unknownText = unknown.length > 0 ? " 另外小铺里没有：" + unknown.join("、") : "";
      return {
        content: [{
          type: "text",
          text: "买好啦" + reasonText + "：花了 " + total + " 摩拉，买了 " + names.join("、") + "，已放进背包。剩余摩拉 " + d.mora.toFixed(1) + "。" + unknownText,
        }],
        details: {
          bought: names,
          total: total,
          mora: d.mora,
          inventory: d.inventory,
        },
      };
    } catch (error) {
      toolCtx.log.error("[san_buy_item] 失败:", error);
      return {
        content: [{ type: "text", text: "买东西的时候出了点岔子。" }],
        isError: false,
      };
    }
  },
});

export const { name, description, parameters, execute } = tool;
