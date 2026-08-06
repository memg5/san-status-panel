// routes/shop.js — 小铺页面 + 商店 API
// 桑多涅状态面板的商店界面
// 数据与状态面板共享 ctx.dataDir，货币为摩拉（shop_data.json）
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createTriggerReply } from "./trigger-reply.js";
import { nowStamp, nowLocal } from "../lib/now.js";

// 资源根目录（基于本文件位置推导，独立于 ctx）
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOP_DIR = path.join(__dirname, "..", "shop");



// ================================================================
//  商品清单：image/img 改为轻量路径（前端带 token 即调图片接口），
//  不再内联 base64 → /api/shop/items JSON 仅 ~5KB，首屏秒出骨架。
// ================================================================
const CATEGORIES = [
  { id: "fruit", name: "水果 · 地瓜" },
  { id: "meal", name: "主食 · 菜肴" },
  { id: "snack", name: "零食" },
  { id: "drink", name: "饮品" },
];

const ITEMS = [
  // ---- 类别 1 · 水果  ----
  { id: "apple", cat: "fruit", name: "苹果", price: 2, unit: "个", desc: "脆甜多汁，一日一苹果" },
  { id: "banana", cat: "fruit", name: "香蕉", price: 1, unit: "根", desc: "软糯香甜，补能量首选" },
  { id: "mango", cat: "fruit", name: "芒果", price: 3, unit: "个", desc: "热带阳光的味道" },
  { id: "watermelon", cat: "fruit", name: "西瓜", price: 3, unit: "份（切块）", desc: "夏日解暑标配" },
  { id: "grape", cat: "fruit", name: "葡萄", price: 6, unit: "斤", desc: "一串串紫莹莹的甜" },
  { id: "lychee", cat: "fruit", name: "荔枝", price: 5, unit: "斤", desc: "一骑红尘妃子笑" },
  { id: "strawberry", cat: "fruit", name: "草莓", price: 10, unit: "斤", desc: "少女心狙击手" },
  { id: "jicama", cat: "fruit", name: "地瓜", price: 2, unit: "个", desc: "凉薯，清脆爽口（不是番薯）" },

  // ---- 类别 2 · 主食  ----
  { id: "peking-duck", cat: "meal", name: "北京烤鸭", price: 70, unit: "半套", desc: "皮脆肉嫩，卷饼绝配" },
  { id: "donkey-burger", cat: "meal", name: "驴肉火烧", price: 15, unit: "个", desc: "金黄酥脆，一口入魂" },
  { id: "char-siu", cat: "meal", name: "叉烧", price: 25, unit: "份", desc: "蜜汁红亮，肥瘦刚好" },
  { id: "jianbing", cat: "meal", name: "杂粮煎饼", price: 10, unit: "个", desc: "薄脆喷香，元气早餐" },
  { id: "yangchun-noodle", cat: "meal", name: "阳春面", price: 14, unit: "碗", desc: "清汤细面，撒点葱花" },
  { id: "lanzhou-ramen", cat: "meal", name: "兰州牛肉面", price: 10, unit: "碗", desc: "一清二白三红四绿" },
  { id: "red-bean-bun", cat: "meal", name: "豆沙包", price: 3, unit: "个", desc: "绵软外皮，细腻豆沙" },
  { id: "siu-mai", cat: "meal", name: "香菇肉沫烧麦", price: 12, unit: "笼", desc: "开口留香，馅料十足" },
  { id: "seaweed-soup", cat: "meal", name: "紫菜蛋花汤", price: 8, unit: "碗", desc: "鲜掉眉毛的一碗" },
  { id: "oil-tea", cat: "meal", name: "油茶汤", price: 12, unit: "碗", desc: "花生炒米葱花，暖身" },
  { id: "cabbage-soup", cat: "meal", name: "肉沫白菜汤", price: 10, unit: "碗", desc: "清甜味鲜，家常之选" },

  // ---- 类别 3 · 零食 ----
  { id: "chips", cat: "snack", name: "薯片", price: 3, unit: "包", desc: "咔嚓咔嚓停不下来" },
  { id: "jelly", cat: "snack", name: "果冻", price: 3, unit: "杯", desc: "Duang Duang 的" },
  { id: "latiao", cat: "snack", name: "辣条", price: 1, unit: "包", desc: "童年快乐源泉" },
  { id: "instant-noodle", cat: "snack", name: "泡面", price: 4.5, unit: "桶", desc: "深夜的灵魂伴侣" },
  { id: "ham-sausage", cat: "snack", name: "火腿肠", price: 1.5, unit: "根", desc: "泡面最佳拍档" },
  { id: "chocolate", cat: "snack", name: "巧克力", price: 8, unit: "条", desc: "丝滑治愈一切" },
  { id: "guoba", cat: "snack", name: "锅巴", price: 4, unit: "包", desc: "金黄酥脆，越嚼越香" },

  // ---- 类别 4 · 饮品 ----
  { id: "cola", cat: "drink", name: "可乐", price: 2.8, unit: "瓶", desc: "快乐水的气泡魔法" },
  { id: "sprite", cat: "drink", name: "雪碧", price: 2.8, unit: "瓶", desc: "透心凉，心飞扬" },
  { id: "lemonade", cat: "drink", name: "柠檬水", price: 3.5, unit: "瓶", desc: "清爽解腻，维 C 满满" },
  { id: "c100", cat: "drink", name: "水溶C100", price: 3.5, unit: "瓶", desc: "酸酸甜甜补充维 C" },
  { id: "orange-juice", cat: "drink", name: "橘子汁", price: 4, unit: "瓶", desc: "现榨的阳光味道" },
  { id: "suanmeitang", cat: "drink", name: "酸梅汤", price: 5, unit: "碗", desc: "乌梅山楂，生津止渴" },
];

const INITIAL_MORA = 0;
const DAILY_BASE_MORA = 10;

const ENTERTAINMENT_TASKS = [
  {
    id: "repair-shop",
    name: "去维修店上班",
    description: "交互后开始执行定时任务，时间到视为完成，可获得 80 摩拉。",
    amount: 80,
    duration: "2小时",
    durationMinutes: 120,
    cooldownHours: 6,
    actionMessage: "求求，主人要饿死了，帮忙养活一下主人",
  },
  {
    id: "fish-river",
    name: "去小河边钓鱼",
    description: "交互后开始执行定时任务，时间到视为完成，可获得 40 摩拉。",
    amount: 40,
    duration: "1小时",
    durationMinutes: 60,
    cooldownHours: 3,
    actionMessage: "唔，你的主人肚子饿了，想吃鱼了",
  },
  {
    id: "farm-tomato",
    name: "去农场收货番茄",
    description: "交互后开始执行定时任务，时间到视为完成，可获得 48 摩拉。",
    amount: 48,
    duration: "1.5小时",
    durationMinutes: 90,
    cooldownHours: 4,
    actionMessage: "主人没有零花钱了，求求帮忙赚点零花钱",
  },
];

const STUDY_TIERS = {
  15: 7,
  25: 10,
  40: 14,
  60: 18,
};

function todayYMD() {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayYMD() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function defaultIncomeState() {
  return {
    lastDailyBaseClaim: null,
    dailyAutoLastIssuedAt: null,
    taskCooldowns: {},
    studyStreak: { lastStudyDate: null, consecutiveDays: 0 },
    activeEntertainmentTask: null,
    activeStudySession: null,
    pendingApproval: null,
    earnings: [],
    studyLog: [],
    history: [],
    historyLimit: 100,
  };
}

// 命名导出：便于外部工具/预览脚本读取商品清单
export { CATEGORIES, ITEMS, INITIAL_MORA };

export default function (app, ctx) {
  const shopDir = path.join(ctx.pluginDir, "shop");
  const dataDir = ctx.dataDir;
  const dataPath = path.join(dataDir, "shop_data.json");
  const actionsPath = path.join(dataDir, "pending_actions.json");
  const configPath = path.join(dataDir, "config.json");
  // 触发 Agent 回复（娱乐任务申请时唤醒桑多涅审批）
  const tryTriggerReply = createTriggerReply({ dataDir, configPath, log: ctx.log });

  // ================================================================
  //  小铺数据读写（shop_data.json，与状态面板共享 dataDir）
  // ================================================================
  function ensureIncomeState(d) {
    if (!d.income || typeof d.income !== "object") d.income = defaultIncomeState();
    if (typeof d.income.lastDailyBaseClaim !== "string") d.income.lastDailyBaseClaim = null;
    if (typeof d.income.dailyAutoLastIssuedAt !== "string") d.income.dailyAutoLastIssuedAt = null;
    if (!d.income.taskCooldowns || typeof d.income.taskCooldowns !== "object") d.income.taskCooldowns = {};
    if (!d.income.studyStreak || typeof d.income.studyStreak !== "object") d.income.studyStreak = { lastStudyDate: null, consecutiveDays: 0 };
    if (!d.income.activeEntertainmentTask || typeof d.income.activeEntertainmentTask !== "object") d.income.activeEntertainmentTask = null;
    if (!d.income.activeStudySession || typeof d.income.activeStudySession !== "object") d.income.activeStudySession = null;
    if (!d.income.pendingApproval || typeof d.income.pendingApproval !== "object") d.income.pendingApproval = null;
    // 审批超时兜底：超过 30 分钟未审批，自动清理
    if (d.income.pendingApproval && d.income.pendingApproval.requestedAt) {
      const requestedAt = new Date(d.income.pendingApproval.requestedAt);
      const timeout = new Date(requestedAt.getTime() + 30 * 60 * 1000);
      if (new Date() > timeout) {
        d.income.pendingApproval = null;
      }
    }
    if (!Array.isArray(d.income.earnings)) d.income.earnings = [];
    if (!Array.isArray(d.income.studyLog)) d.income.studyLog = [];
    if (!Array.isArray(d.income.history)) d.income.history = [];
    if (!d.income.historyLimit || typeof d.income.historyLimit !== "number") d.income.historyLimit = 100;
    if (d.income.history.length > d.income.historyLimit) {
      d.income.history = d.income.history.slice(-d.income.historyLimit);
    }
    if (d.income.earnings.length > d.income.historyLimit) {
      d.income.earnings = d.income.earnings.slice(-d.income.historyLimit);
    }
    if (d.income.studyLog.length > d.income.historyLimit) {
      d.income.studyLog = d.income.studyLog.slice(-d.income.historyLimit);
    }
  }

  function defaultShopData() {
    return { mora: INITIAL_MORA, inventory: {}, purchases: [], income: defaultIncomeState() };
  }

  function readShopData() {
    try {
      if (fs.existsSync(dataPath)) {
        const d = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
        if (typeof d.mora !== "number") d.mora = INITIAL_MORA;
        if (!d.inventory || typeof d.inventory !== "object") d.inventory = {};
        if (!Array.isArray(d.purchases)) d.purchases = [];
        ensureIncomeState(d);
        return d;
      }
    } catch (e) {}
    return defaultShopData();
  }

  function saveShopData(d) {
    try {
      fs.mkdirSync(dataDir, { recursive: true });
      const tmp = dataPath + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(d, null, 2), "utf-8");
      fs.renameSync(tmp, dataPath);
    } catch (e) {
      ctx.log?.error?.("[shop] 保存失败", e.message);
    }
  }

  function initializeShopData() {
    try {
      if (!fs.existsSync(dataPath)) {
        saveShopData(defaultShopData());
      } else {
        const d = readShopData();
        saveShopData(d);
      }
    } catch (e) {
      ctx.log?.warn?.("[shop] 初始化 shop_data 失败", e.message);
    }
  }

  initializeShopData();

  // 购买后通知状态面板（沿用 poke/send 的 pending_actions 机制）
  function pushBuyAction(itemName) {
    try {
      let actions = [];
      try { actions = JSON.parse(fs.readFileSync(actionsPath, "utf-8")); } catch (e) {}
      actions.push({ action: "buy", item: itemName, timestamp: nowStamp(), tsLocal: nowLocal() });
      if (actions.length > 50) actions = actions.slice(-50);
      fs.writeFileSync(actionsPath, JSON.stringify(actions, null, 2), "utf-8");
    } catch (e) {}
  }

  // ================================================================
  //  页面渲染（内联 CSS / JS）
  // ================================================================
  function getShopPage() {
    try {
      const html = fs.readFileSync(path.join(shopDir, "shop.html"), "utf-8");
      const css = fs.readFileSync(path.join(shopDir, "shop.css"), "utf-8");
      const js = fs.readFileSync(path.join(shopDir, "shop.js"), "utf-8");
      let page = html
        .replace("/* INLINE_CSS */", css)
        .replace("/* INLINE_JS */", js);
      // 女仆立绘：内联 base64，避免 iframe 静态资源鉴权 403
      // 发布版不附带立绘图片：缺失时优雅降级（相框留白）
      try {
        const picPath = path.join(shopDir, "sandone.jpg");
        if (fs.existsSync(picPath)) {
          const b64 = fs.readFileSync(picPath).toString("base64");
          page = page.split("/* SANPIC */").join("data:image/jpeg;base64," + b64);
        } else {
          page = page.split("/* SANPIC */").join("");
        }
      } catch (e) {}
      return page;
    } catch (e) {
      ctx.log?.error?.("[shop]", e.message);
      return null;
    }
  }

  // 商店页面
  app.get("/shop", (c) => {
    const page = getShopPage();
    if (!page) return c.text("小铺正在装修中…", 503);
    return c.html(page);
  });



  // ================================================================
  //  商店 API（挂在 /api/plugins/san-status-panel/api/shop/... 下）
  // ================================================================

  // 每日便签（桑多涅亲笔）：前端读取显示
  app.get("/api/shop/note", (c) => {
    try {
      const notePath = path.join(dataDir, "note.json");
      if (fs.existsSync(notePath)) {
        const note = JSON.parse(fs.readFileSync(notePath, "utf-8"));
        return c.json({ ok: true, note });
      }
    } catch (e) {}
    return c.json({ ok: true, note: null });
  });

  // 商品列表 + 分类
  app.get("/api/shop/items", (c) => {
    return c.json({ ok: true, categories: CATEGORIES, items: ITEMS });
  });

  // 摩拉余额 + 背包 + 收入状态 + 购买流水（账本用）
  app.get("/api/shop/data", (c) => {
    const d = readShopData();
    const auto = autoClaimEntertainmentIfDue(d);
    if (auto) saveShopData(d);
    const purchases = (d.purchases || []).map((p) => {
      // 兼容旧格式：单个 itemId；新格式：itemIds 数组
      const ids = p.itemIds || (p.itemId ? [p.itemId] : []);
      const names = ids.map((id) => {
        const it = ITEMS.find((x) => x.id === id);
        return it ? it.name : id;
      });
      return {
        at: p.at,
        tsLocal: p.tsLocal || undefined,
        price: p.price,
        reason: p.reason || "",
        by: p.by || "owner",
        names,
        // 真使用机制：保留类型标记与明细，供账本文案区分 吃/喝/清账
        use: p.use || undefined,
        clear: p.clear || undefined,
        itemId: p.itemId || undefined,
        qty: p.qty || undefined,
        items: p.items || undefined,
        // 桑多涅亲笔概括（note 优先于模板）
        note: p.note || undefined,
      };
    });
    return c.json({ ok: true, mora: d.mora, inventory: d.inventory, income: d.income, purchases });
  });

  // 收入配置与状态
  app.get("/api/shop/income", (c) => {
    const d = readShopData();
    const auto = autoClaimEntertainmentIfDue(d);
    if (auto) saveShopData(d);
    return c.json({
      ok: true,
      dailyBase: DAILY_BASE_MORA,
      tasks: ENTERTAINMENT_TASKS,
      studyTiers: STUDY_TIERS,
      income: d.income,
    });
  });

  function addIncomeHistory(d, type, amount, note) {
    d.income.history.push({ type, amount, note, at: new Date().toISOString() });
    if (d.income.history.length > d.income.historyLimit) {
      d.income.history = d.income.history.slice(-d.income.historyLimit);
    }
  }

  function addEarningRecord(d, category, detail, amount) {
    d.income.earnings.push({ category, detail, amount, at: new Date().toISOString() });
    if (d.income.earnings.length > d.income.historyLimit) {
      d.income.earnings = d.income.earnings.slice(-d.income.historyLimit);
    }
  }

  function addStudyLog(d, tier, baseAmount, bonus, amount) {
    d.income.studyLog.push({ tier, baseAmount, bonus, amount, at: new Date().toISOString() });
    if (d.income.studyLog.length > d.income.historyLimit) {
      d.income.studyLog = d.income.studyLog.slice(-d.income.historyLimit);
    }
  }

  function getEntertainmentTask(d, taskId) {
    return ENTERTAINMENT_TASKS.find((it) => it.id === taskId) || null;
  }

  function canStartEntertainmentTask(d, taskId) {
    if (d.income.activeEntertainmentTask) {
      return { ok: false, message: "已有任务在进行中，做完才能接下一个" };
    }
    if (d.income.pendingApproval) {
      return { ok: false, message: "已有一个任务等待主人审批中，请等待审批结果" };
    }
    const task = getEntertainmentTask(d, taskId);
    if (!task) return { ok: false, message: "任务不存在" };
    const last = d.income.taskCooldowns[taskId];
    if (!last) return { ok: true };
    const next = new Date(last);
    next.setHours(next.getHours() + task.cooldownHours);
    if (new Date() < next) {
      return { ok: false, message: "任务冷却中，稍后再来", nextAvailableAt: next.toISOString() };
    }
    return { ok: true };
  }

  function startEntertainmentTask(d, taskId) {
    if (d.income.activeEntertainmentTask) return null;
    if (d.income.pendingApproval) return null;
    const task = getEntertainmentTask(d, taskId);
    if (!task) return null;
    // 不直接启动，写入 pendingApproval 等待 Agent 审批
    d.income.pendingApproval = {
      taskId: task.id,
      name: task.name,
      amount: task.amount,
      duration: task.duration,
      durationMinutes: task.durationMinutes,
      actionMessage: task.actionMessage,
      requestedAt: nowStamp(),
      requestedLocal: nowLocal(),
    };
    return task;
  }

  function claimEntertainmentTask(d) {
    const active = d.income.activeEntertainmentTask;
    if (!active) return { ok: false, message: "当前没有进行中的娱乐任务" };
    const started = new Date(active.startedAt);
    const now = new Date();
    const deadline = new Date(started.getTime() + active.durationMinutes * 60 * 1000);
    if (now < deadline) {
      return { ok: false, message: "任务尚未完成，请等待时间到达", readyAt: deadline.toISOString() };
    }
    d.mora += active.amount;
    d.income.taskCooldowns[active.taskId] = now.toISOString();
    addIncomeHistory(d, "entertainment", active.amount, active.name + " 完成领取");
    addEarningRecord(d, "entertainment", active.name, active.amount);
    d.income.activeEntertainmentTask = null;
    return { ok: true, task: active };
  }

  // 自动领取：任务到期后由读取接口顺带触发，无需手动操作
  function autoClaimEntertainmentIfDue(d) {
    const active = d.income.activeEntertainmentTask;
    if (!active) return null;
    const started = new Date(active.startedAt);
    const deadline = new Date(started.getTime() + active.durationMinutes * 60 * 1000);
    if (new Date() < deadline) return null;
    const result = claimEntertainmentTask(d);
    if (result.ok) {
      try {
        pushBuyAction("完成任务（自动领取）：" + result.task.name);
      } catch (e) {}
    }
    return result.ok ? result : null;
  }

  function getStudyTier(tier) {
    return STUDY_TIERS[tier] || null;
  }

  function canStartStudySession(d, tier) {
    if (d.income.activeStudySession) {
      return { ok: false, message: "已有进行中的学习任务，请先完成或领取当前任务收益" };
    }
    const amount = getStudyTier(tier);
    if (typeof amount !== "number") {
      return { ok: false, message: "学习档位无效" };
    }
    return { ok: true };
  }

  function startStudySession(d, tier) {
    const amount = getStudyTier(tier);
    if (typeof amount !== "number") return null;
    if (d.income.activeStudySession) return null;
    d.income.activeStudySession = {
      tier: tier,
      startedAt: new Date().toISOString(),
      durationMinutes: Number(tier),   // 档位即时长（分钟）
      amount: amount,
      note: "学习会话",
    };
    return d.income.activeStudySession;
  }

  function claimStudySession(d) {
    const active = d.income.activeStudySession;
    if (!active) return { ok: false, message: "当前没有进行中的学习任务" };
    const started = new Date(active.startedAt);
    const now = new Date();
    const deadline = new Date(started.getTime() + active.durationMinutes * 60 * 1000);
    if (now < deadline) {
      return { ok: false, message: "学习任务尚未完成，请等待时间到达", readyAt: deadline.toISOString() };
    }
    const tier = active.tier;
    const amount = getStudyTier(tier);
    if (typeof amount !== "number") return { ok: false, message: "学习档位无效" };
    const today = todayYMD();
    const yesterday = yesterdayYMD();
    const streak = d.income.studyStreak;
    if (streak.lastStudyDate === today) {
      d.income.activeStudySession = null;
      return { ok: false, message: "今天已领取学习收入" };
    }
    if (streak.lastStudyDate === yesterday) {
      streak.consecutiveDays += 1;
    } else {
      streak.consecutiveDays = 1;
    }
    streak.lastStudyDate = today;
    const bonus = streak.consecutiveDays >= 3 ? 5 : 0;
    const total = amount + bonus;
    d.mora += total;
    d.income.activeStudySession = null;
    addIncomeHistory(d, "study", total, "学习会话完成 (" + tier + "%, 连续 " + streak.consecutiveDays + " 天)");
    addStudyLog(d, tier, amount, bonus, total);
    addEarningRecord(d, "study", "学习会话", total);
    return { ok: true, amount: total, bonus: bonus, consecutiveDays: streak.consecutiveDays };
  }

  // 学习会话：开始
  app.post("/api/shop/income/study/start", async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const tier = Number(body.tier);
      const d = readShopData();
      const avail = canStartStudySession(d, tier);
      if (!avail.ok) return c.json({ ok: false, message: avail.message }, 400);
      const session = startStudySession(d, tier);
      if (!session) return c.json({ ok: false, message: "学习会话启动失败" }, 500);
      saveShopData(d);
      pushBuyAction("开始学习会话");
      return c.json({ ok: true, message: "学习会话已开始", income: d.income, session: session });
    } catch (e) {
      return c.json({ ok: false, message: "学习会话启动失败：" + e.message }, 500);
    }
  });

  // 学习会话：领取完成
  app.post("/api/shop/income/study/claim", async (c) => {
    try {
      const d = readShopData();
      const result = claimStudySession(d);
      if (!result.ok) return c.json({ ok: false, message: result.message, readyAt: result.readyAt || null });
      saveShopData(d);
      pushBuyAction("完成学习会话");
      return c.json({ ok: true, message: "学习会话完成，已领取学习收入", mora: d.mora, income: d.income, study: result });
    } catch (e) {
      return c.json({ ok: false, message: "领取学习会话失败：" + e.message }, 500);
    }
  });

  // 领取保底收入
  app.post("/api/shop/income/daily", async (c) => {
    try {
      const d = readShopData();
      const today = todayYMD();
      if (d.income.lastDailyBaseClaim === today) {
        return c.json({ ok: false, message: "今天已领取保底收入" });
      }
      d.mora += DAILY_BASE_MORA;
      d.income.lastDailyBaseClaim = today;
      addIncomeHistory(d, "daily", DAILY_BASE_MORA, "保底收入");
      addEarningRecord(d, "daily", "保底收入", DAILY_BASE_MORA);
      saveShopData(d);
      pushBuyAction("保底收入");
      return c.json({ ok: true, message: "已领取保底收入", mora: d.mora, income: d.income });
    } catch (e) {
      return c.json({ ok: false, message: "领取失败：" + e.message }, 500);
    }
  });

  // 自动发放保底收入（内部接口，可由客户端/cron 调用）
  app.post("/api/shop/income/daily/auto", async (c) => {
    try {
      const d = readShopData();
      const today = todayYMD();
      const last = d.income.dailyAutoLastIssuedAt;
      if (last === today) {
        return c.json({ ok: false, message: "今日已自动发放过保底收入", mora: d.mora, income: d.income });
      }
      d.mora += DAILY_BASE_MORA;
      d.income.dailyAutoLastIssuedAt = today;
      addIncomeHistory(d, "daily", DAILY_BASE_MORA, "保底收入（自动发放）");
      addEarningRecord(d, "daily", "保底收入（自动发放）", DAILY_BASE_MORA);
      saveShopData(d);
      return c.json({ ok: true, message: "自动发放保底收入", mora: d.mora, income: d.income });
    } catch (e) {
      return c.json({ ok: false, message: "自动发放失败：" + e.message }, 500);
    }
  });

  // 娱乐收入任务：提交审批
  app.post("/api/shop/income/entertainment/start", async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const taskId = body.taskId;
      const d = readShopData();
      const avail = canStartEntertainmentTask(d, taskId);
      if (!avail.ok) return c.json({ ok: false, message: avail.message, nextAvailableAt: avail.nextAvailableAt || null });
      const task = startEntertainmentTask(d, taskId);
      if (!task) return c.json({ ok: false, message: "任务不存在" }, 404);
      saveShopData(d);

      // 唤醒 Agent 审批（与 poke/投喂同一套链路，唯一通道）
      try {
        tryTriggerReply(c, "主人想去「" + task.name + "」赚摩拉了，等你批准", "task");
      } catch (e) {
        ctx.log?.error?.("[shop] 唤醒 Agent 失败:", e.message);
      }

      return c.json({
        ok: true,
        message: "已向主人请求批准「" + task.name + "」，请等待主人回应",
        pending: true,
        income: d.income,
        task: task,
      });
    } catch (e) {
      return c.json({ ok: false, message: "任务启动失败：" + e.message }, 500);
    }
  });

  // 娱乐收入任务：领取完成的任务收益
  app.post("/api/shop/income/entertainment/claim", async (c) => {
    try {
      const d = readShopData();
      const result = claimEntertainmentTask(d);
      if (!result.ok) return c.json({ ok: false, message: result.message, readyAt: result.readyAt || null });
      saveShopData(d);
      pushBuyAction("完成任务：" + result.task.name);
      return c.json({ ok: true, message: "任务已完成，获得 " + result.task.amount + " 摩拉", mora: d.mora, income: d.income, task: result.task });
    } catch (e) {
      return c.json({ ok: false, message: "任务领取失败：" + e.message }, 500);
    }
  });

  // 购买
  app.post("/api/shop/buy", async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const itemId = body.itemId;
      const item = ITEMS.find((it) => it.id === itemId);
      if (!item) return c.json({ ok: false, message: "商品不存在" }, 404);

      const d = readShopData();
      if (d.mora < item.price) {
        return c.json({ ok: false, message: "摩拉不足，还差 " + (item.price - d.mora) + " 摩拉" });
      }
      d.mora -= item.price;
      d.inventory[item.id] = (d.inventory[item.id] || 0) + 1;
      d.purchases.push({ itemId: item.id, price: item.price, at: new Date().toISOString() });
      if (d.purchases.length > 100) d.purchases = d.purchases.slice(-100);
      saveShopData(d);
      pushBuyAction(item.name);

      return c.json({
        ok: true,
        message: "买到了「" + item.name + "」",
        mora: d.mora,
        inventory: d.inventory,
      });
    } catch (e) {
      return c.json({ ok: false, message: "购买失败：" + e.message }, 500);
    }
  });
}
