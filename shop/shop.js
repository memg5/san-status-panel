// 猫猫生活区 — 暖布桌面 + 纸片拼图 + 纯文字账本
// 账本渲染 / 钱包 / 学习区 / 玩耍区多任务
(function () {
  "use strict";

  // ========== 基础工具 ==========
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  // 判断是否在 Hana 插件 surface 中：URL 带 token + pluginSurfaceSession 即为宿主环境
  function isStandalone() {
    var q = window.location.search || "";
    var hasToken = /[?&]token=([^&]+)/.test(q);
    var hasSurface = /pluginSurfaceSession=/.test(q);
    // 若带宿主 token 则必然在插件内；否则回退独立服务器
    return !hasToken && !hasSurface;
  }
  function pluginBase() {
    return "/api/plugins/san-status-panel";
  }
  function apiUrl(path) {
    var url = pluginBase() + path;
    var m = (window.location.search || "").match(/[?&]token=([^&]+)/);
    if (m) {
      url += (url.indexOf("?") >= 0 ? "&" : "?") + "token=" + encodeURIComponent(m[1]);
    }
    return url;
  }
  function reqUrl(path) {
    if (isStandalone()) return "http://127.0.0.1:19800" + path;
    return apiUrl(path);
  }

  function showToast(msg, isWarn) {
    var t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.toggle("warn", !!isWarn);
    t.classList.add("show");
    clearTimeout(t._tm);
    t._tm = setTimeout(function () { t.classList.remove("show"); }, 1600);
  }

  // ========== 状态 ==========
  var state = {
    items: [],
    purchases: [],   // 桑多涅的行动流水
    mora: 0,
    inventory: {},
    income: null,
    tasks: [],
    selectedTier: 25,   // 默认 25 分钟
  };

  // ========== 元素 ==========
  var $ = function (id) { return document.getElementById(id); };
  var ledgerItems = $("ledgerItems");
  var moraCount = $("moraCount");
  var studyStatus = $("studyStatus");
  var studyTiers = $("studyTiers");
  var studyStreak = $("studyStreak");
  var studyStartBtn = $("studyStartBtn");
  var studyClaimBtn = $("studyClaimBtn");
  var playTasks = $("playTasks");
  var playStatus = $("playStatus");
  var confirmMask = $("confirmMask");
  var confirmTitle = $("confirmTitle");
  var confirmDesc = $("confirmDesc");
  var confirmOk = $("confirmOk");
  var confirmCancel = $("confirmCancel");
  var pendingTask = null;   // 待确认的任务

  // ========== 便签（每日更新：优先读桑多涅亲笔，兜底文案池+天气） ==========
  // 文案池：兜底用（桑多涅没写今日便签时）
  var NOTE_LINES = [
    "今天想喝酸梅汤，冰的，咕噜咕噜。",
    "把窗推开透透气，风是软的。",
    "早上好呀，今天也要好好吃饭。",
    "发条上好了，精神抖擞的一天。",
    "想去河边走走，看看水。",
    "今天懒得算账，先躺会儿再说。",
    "泡杯热茶，慢慢醒过来。",
    "有点想念阳光晒在身上的感觉。",
    "今天也要加油呀，我陪着你。",
    "主人起床了吗？我醒得可早了。",
    "收拾一下桌面，开始新的一天。",
    "今天的天色很适合发呆。",
    "偷偷记一笔：今天也要开心。",
    "风从窗缝钻进来，凉凉的。",
    "热了一碗汤，暖胃也暖心。",
    "今天想学点新东西，脑子要转起来。",
    "窗外有鸟叫，听着舒服。",
    "今天的心情，像刚翻开的账本一样干净。",
    "晒晒太阳，给发条充充电。",
    "今天要是下雨，就待在屋里看书吧。",
    "想着给你留句话，就写了这个。",
    "早上做了个梦，梦里有向日葵。",
    "今天的天，蓝得刚好。",
    "泡面吃腻了，今天想换换口味。",
    "把笔记翻出来，温习一下昨天的。",
    "今天天气不错，适合出门遛弯。",
    "别熬夜了，对身体不好，我盯着你呢。",
    "今天想给自己放个假，什么都不干。",
    "主人，记得喝水呀。",
    "今天的风有夏天的味道。",
  ];
  // WMO 天气代码 → 中文
  var WMO = {
    0: "晴空万里", 1: "晴", 2: "多云", 3: "阴",
    45: "雾蒙蒙的", 48: "雾凇天",
    51: "毛毛雨", 53: "小雨", 55: "小雨不停",
    56: "冻雨毛毛", 57: "冻雨",
    61: "小雨", 63: "中雨", 65: "大雨",
    66: "冻雨", 67: "冻雨",
    71: "小雪", 73: "中雪", 75: "大雪",
    77: "雪粒",
    80: "阵雨", 81: "阵雨", 82: "强阵雨",
    85: "阵雪", 86: "强阵雪",
    95: "雷阵雨", 96: "雷阵雨伴冰雹", 99: "强雷暴",
  };
  // 默认坐标（可被定位覆盖）；有定位时用 /api/location 的坐标
  var LAIFENG = { lat: 29.51, lon: 109.41 };
  // 天气查询：先用插件定位，没有则用默认坐标
  function fetchWeather(cb) {
    try {
      fetch(reqUrl("/api/location"))
        .then(function (r) { return r.json(); })
        .then(function (j) {
          var loc = j && j.location ? j.location : null;
          var lat = loc ? loc.lat : LAIFENG.lat;
          var lon = loc ? loc.lon : LAIFENG.lon;
          var url = "https://api.open-meteo.com/v1/forecast?latitude=" + lat + "&longitude=" + lon +
            "&current=temperature_2m,weather_code,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=Asia%2FShanghai&forecast_days=1";
          fetch(url)
            .then(function (r) { return r.json(); })
            .then(function (w) { cb(w, loc); })
            .catch(function () { cb(null, loc); });
        })
        .catch(function () {
          // 定位接口失败：用默认坐标直接查
          var url = "https://api.open-meteo.com/v1/forecast?latitude=" + LAIFENG.lat + "&longitude=" + LAIFENG.lon +
            "&current=temperature_2m,weather_code,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=Asia%2FShanghai&forecast_days=1";
          fetch(url)
            .then(function (r) { return r.json(); })
            .then(function (w) { cb(w, null); })
            .catch(function () { cb(null, null); });
        });
    } catch (e) {
      cb(null, null);
    }
  }
  (function () {
    var d = new Date();
    var nd = $("noteDate");
    var nt = $("noteText");
    var todayYMD = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    // 文案池兜底文案（桑多涅没写时用）
    var daySeed = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
    var line = NOTE_LINES[daySeed % NOTE_LINES.length];
    var dayIdx = d.getDate();
    if (nd) {
      var days = ["日", "一", "二", "三", "四", "五", "六"];
      nd.textContent = (d.getMonth() + 1) + "月" + d.getDate() + "日 星期" + days[d.getDay()];
    }
    // 先放兜底文案（接口没返回时也能看）
    if (nt) nt.textContent = line;
    // 优先读桑多涅亲笔便签：今天是桑多涅写的就显示，不是才用兜底
    try {
      fetch(reqUrl("/api/shop/note"))
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (!j || !j.ok || !j.note) return;
          var note = j.note;
          // 只用今天的便签（昨天的就不显示了，等桑多涅写新的）
          if (note.date !== todayYMD) {
            if (nt) nt.textContent = "桑多涅还没写今天的便签…";
            return;
          }
          if (nt) nt.textContent = note.text;
          if (nd && note.dateText) {
            nd.textContent = note.dateText;
          }
        })
        .catch(function () { /* 接口失败：保留兜底文案 */ });
    } catch (e) {}
    // 异步拿天气，成功则把天气信息插进便签日期栏
    try {
      var url = "https://api.open-meteo.com/v1/forecast?latitude=" + LAIFENG.lat + "&longitude=" + LAIFENG.lon +
        "&current=temperature_2m,weather_code,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=Asia%2FShanghai&forecast_days=1";
      fetch(url)
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (!j || !j.current) return;
          var wmo = j.current.weather_code;
          var weatherTxt = WMO[wmo] || "天气不明";
          var temp = Math.round(j.current.temperature_2m);
          // 今日预报：只在有雨/雪等特殊天气时提示（雨雪 code）
          var dayN = "";
          var RAIN_CODES = [51,53,55,56,57,61,63,65,66,67,80,81,82,95,96,99];
          var SNOW_CODES = [71,73,75,77,85,86];
          if (j.daily && j.daily.weather_code) {
            var dayWmo = j.daily.weather_code[0];
            if (RAIN_CODES.indexOf(dayWmo) >= 0) dayN = "今日有雨";
            else if (SNOW_CODES.indexOf(dayWmo) >= 0) dayN = "今日有雪";
          }
          // 组装：日期 + 当前天气（温度） [+ 今日雨雪提示]
          var nd2 = $("noteDate");
          if (nd2) {
            var dd = new Date();
            var wdays = ["日", "一", "二", "三", "四", "五", "六"];
            var base = (dd.getMonth() + 1) + "月" + dd.getDate() + "日 星期" + wdays[dd.getDay()];
            var wx = weatherTxt + " " + temp + "°C";
            if (dayN) wx += " · " + dayN;
            // 如果便签已是桑多涅亲笔（带 dateText），日期栏追加天气；否则用基础日期+天气
            var curText = nd2.textContent || "";
            nd2.textContent = curText.indexOf("·") >= 0 ? curText + " " + wx : base + " · " + wx;
          }
          // 天气影响兜底文案（仅当便签还是文案池默认时才微调）
          var nt2 = $("noteText");
          if (nt2 && nt2.textContent === line) {
            var wLine = line;
            // 雨天
            if ([51,53,55,61,63,65,80,81,82,95,96,99].indexOf(wmo) >= 0) {
              wLine = "外面" + weatherTxt + "，听着雨声发会儿呆也不错。";
            } else if ([71,73,75,77,85,86].indexOf(wmo) >= 0) {
              wLine = "下雪了？这个季节也稀奇。";
            } else if ([0,1].indexOf(wmo) >= 0) {
              wLine = "阳光正好，" + temp + "°C，适合出门走走。";
            } else if ([2,3].indexOf(wmo) >= 0 && dayIdx % 3 === 0) {
              wLine = "天" + weatherTxt + "的，不晒不闷，刚刚好。";
            }
            nt2.textContent = wLine;
          }
        })
        .catch(function () { /* 天气获取失败：保留现有文案 */ });
    } catch (e) { /* 离线或网络受限：现有文案兜底 */ }
  })();

  // ========== 数据加载 ==========
  function loadAll() {
    fetchData("/api/shop/data", function (d) {
      if (d) {
        state.mora = d.mora || 0;
        state.inventory = d.inventory || {};
        state.income = d.income || null;
        state.purchases = d.purchases || [];
        renderWallet();
        renderLedger();
      }
    });
    fetchData("/api/shop/income", function (d) {
      if (d) {
        state.tasks = d.tasks || [];
        if (d.income) state.income = d.income;
        renderStudy();
        renderPlay();
      }
    });
  }

  function fetchData(path, cb) {
    fetch(reqUrl(path))
      .then(function (r) { return r.json(); })
      .then(cb)
      .catch(function (e) {
        console.warn("[小铺] 加载失败:", path, e);
      });
  }

  function postData(path, body, cb) {
    fetch(reqUrl(path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    })
      .then(function (r) { return r.json(); })
      .then(cb)
      .catch(function (e) {
        console.warn("[小铺] 请求失败:", path, e);
        showToast("网络有点小问题…", true);
      });
  }

  // ========== 账本（桑多涅的行动流水账） ==========
  // 每条记录：时间 + 她做了什么，生活化叙事，不严格主谓宾，不每次报金额
  // 商品昵称/戏称，让叙事有温度（names 已是中文名，按名匹配）
  var ITEM_FLAVOR = {
    "苹果": "脆甜多汁的苹果", "香蕉": "软糯的香蕉", "芒果": "香喷喷的芒果", "西瓜": "冰镇西瓜",
    "葡萄": "紫葡萄", "荔枝": "新鲜荔枝", "草莓": "红彤彤的草莓", "地瓜": "脆生生的地瓜",
    "北京烤鸭": "半套烤鸭", "驴肉火烧": "驴肉火烧", "叉烧": "蜜汁叉烧", "杂粮煎饼": "热乎的杂粮煎饼",
    "阳春面": "一碗阳春面", "兰州牛肉面": "兰州牛肉面", "豆沙包": "豆沙包",
    "香菇肉沫烧麦": "香菇烧麦", "紫菜蛋花汤": "紫菜蛋花汤", "油茶汤": "油茶汤", "肉沫白菜汤": "肉沫白菜汤",
    "薯片": "咔嚓咔嚓的薯片", "果冻": "DuangDuang的果冻", "辣条": "一包辣条", "泡面": "深夜泡面",
    "火腿肠": "火腿肠", "巧克力": "丝滑巧克力", "锅巴": "金黄锅巴",
    "可乐": "快乐水", "雪碧": "透心凉的雪碧", "柠檬水": "柠檬水", "水溶C100": "水溶C",
    "橘子汁": "橘子汁", "酸梅汤": "酸梅汤",
  };
  function flavorName(name) {
    return ITEM_FLAVOR[name] || name;
  }
  // 中文数词与量词（避免“豆沙包、豆沙包、豆沙包、豆沙包”式重复，合并为“四个豆沙包”）
  var CN_NUM = ["", "一", "两", "三", "四", "五", "六", "七", "八", "九", "十"];
  var ITEM_UNIT = {
    "阳春面": "碗", "兰州牛肉面": "碗", "紫菜蛋花汤": "碗", "油茶汤": "碗", "肉沫白菜汤": "碗", "酸梅汤": "碗",
    "葡萄": "斤", "荔枝": "斤", "草莓": "斤", "西瓜": "份",
    "薯片": "包", "辣条": "包", "锅巴": "包", "泡面": "桶",
    "果冻": "杯", "可乐": "瓶", "雪碧": "瓶", "柠檬水": "瓶", "水溶C100": "瓶", "橘子汁": "瓶",
    "香蕉": "根", "火腿肠": "根", "巧克力": "条",
  };
  function cnNum(n) {
    if (n <= 10) return CN_NUM[n];
    return String(n);
  }
  // 聚合重复物品：["豆沙包","豆沙包","豆沙包","豆沙包"] -> [{name:"豆沙包",count:4}]
  function mergeItems(names) {
    var map = {};
    (names || []).forEach(function (n) {
      map[n] = (map[n] || 0) + 1;
    });
    var out = [];
    for (var k in map) out.push({ name: k, count: map[k] });
    return out;
  }
  // 单个物品的叙述：1个用昵称（脆甜多汁的苹果），多个用数量+量词（四个豆沙包）
  function itemPhrase(it) {
    if (it.count <= 1) return flavorName(it.name);
    var unit = ITEM_UNIT[it.name] || "个";
    return cnNum(it.count) + unit + it.name;
  }
  function describePurchase(p) {
    // 桑多涅亲笔概括：有 note 就不用模板
    if (p.note) return p.note;
    var names = p.names || [];
    var merged = mergeItems(names);
    var listTxt = merged.length ? merged.map(itemPhrase).join("、") : "些小东西";
    var priceTxt = p.price != null ? p.price + " 摩拉" : "没花钱";
    var isMe = p.by === "sandrone";
    var r = p.reason || "";
    var pick = function (arr) {
      // 用记录时间做稳定随机种子，同一条记录句式固定
      var seed = 0;
      for (var i = 0; i < (p.at || "").length; i++) { seed = (seed * 31 + (p.at || "").charCodeAt(i)) | 0; }
      return arr[Math.abs(seed) % arr.length];
    };
    // 使用记录（真使用机制：吃/喝掉了背包里的东西）
    if (p.use) {
      var USE_NAME = {
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
      var uname = flavorName(USE_NAME[p.itemId] || p.itemId);
      var qtyTxt = p.qty > 1 ? "×" + p.qty : "";
      var who = isMe ? "我" : "主人";
      return pick([
        who + "喝掉了" + uname + qtyTxt + "，舒服。",
        who + "把" + uname + qtyTxt + "吃干净了。",
        who + "解决了" + uname + qtyTxt + "。",
      ]);
    }
    // 清账记录（历史口头使用补清，无实物交易）
    if (p.clear) {
      return pick([
        "清掉了旧账：" + (p.items || "些老库存") + "。",
        "把之前口头用掉的补销了：" + (p.items || "些老库存") + "。",
        "翻旧账，核销" + (p.items || "些老库存") + "。",
      ]);
    }
    // 非购物类：收入/学习/任务
    if (r === "保底收入" || r === "保底收入（自动发放）") {
      return pick([
        "今天的零花钱" + priceTxt + "，收好了。",
        "零花钱到手" + priceTxt + "，塞进小钱包。",
      ]);
    }
    if (r === "学习会话完成") {
      return pick([
        "认真学了一阵子，挣了" + priceTxt + "，值。",
        "书翻了不少页，" + priceTxt + "到手。",
      ]);
    }
    if (r === "开始学习会话") {
      return "摊开书本，安静学习一会儿。";
    }
    if (r.indexOf("完成任务") === 0) {
      return pick([
        "活儿干完了，领了" + priceTxt + "，舒坦。",
        "忙活完这一趟，" + priceTxt + "进账。",
      ]);
    }
    // 购物类
    if (merged.length === 0) {
      return pick([
        (isMe ? "顺路买了点东西，" : "主人顺路买了点东西，") + priceTxt + "。",
      ]);
    }
    if (merged.length === 1 && merged[0].count === 1) {
      var f = flavorName(merged[0].name);
      if (isMe) {
        return pick([
          "看见" + f + "就走不动道，" + priceTxt + "拿下。",
          "给自己添了" + f + "，" + priceTxt + "，小确幸。",
          "路过小铺顺手捎了" + f + "，" + priceTxt + "。",
          "嘴馋了，" + f + "，" + priceTxt + "，值当。",
        ]);
      }
      return pick([
        "主人给买了" + f + "，" + priceTxt + "，记下了。",
        "主人出手买了" + f + "，" + priceTxt + "。",
      ]);
    }
    if (isMe) {
      return pick([
        "逛街入了" + listTxt + "，" + priceTxt + "，开心。",
        "给家里添了" + listTxt + "，" + priceTxt + "。",
      ]);
    }
    return "主人买了" + listTxt + "，" + priceTxt + "。";
  }
  function fmtTime(p) {
    // 有 tsLocal（人类可读本地时间）直接用，防 UTC 误读
    if (p && p.tsLocal) return p.tsLocal;
    var iso = p && p.at;
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    var now = new Date();
    var hm = (d.getHours() < 10 ? "0" : "") + d.getHours() + ":" + (d.getMinutes() < 10 ? "0" : "") + d.getMinutes();
    var sameDay = d.toDateString() === now.toDateString();
    if (sameDay) return "今天 " + hm;
    var yest = new Date(now);
    yest.setDate(now.getDate() - 1);
    if (d.toDateString() === yest.toDateString()) return "昨天 " + hm;
    return (d.getMonth() + 1) + "月" + d.getDate() + "日 " + hm;
  }
  function renderLedger() {
    if (!ledgerItems) return;
    var list = state.purchases || [];
    if (list.length === 0) {
      ledgerItems.innerHTML = '<div class="ledger-empty">账本空空的，她还没动过钱包…</div>';
      return;
    }
    var html = "";
    // 倒序：最新在前
    var sorted = list.slice().sort(function (a, b) {
      return String(b.at || "").localeCompare(String(a.at || ""));
    });
    // 时间线：上最新、下最早。切成两半：新的一半放右列，旧的一半放左列。
    var half = Math.ceil(sorted.length / 2);
    var rightCol = sorted.slice(0, half);   // 新的一半 → 右列（顶部最新）
    var leftCol = sorted.slice(half);       // 旧的一半 → 左列（底部最旧）
    var rows = Math.max(rightCol.length, leftCol.length);
    for (var i = 0; i < rows; i++) {
      if (leftCol[i]) {
        html += rowHtml(leftCol[i]);
      } else {
        html += '<div class="ledger-row ledger-row-placeholder"></div>';
      }
      if (rightCol[i]) {
        html += rowHtml(rightCol[i]);
      } else {
        html += '<div class="ledger-row ledger-row-placeholder"></div>';
      }
    }
    ledgerItems.innerHTML = html;
  }
  function rowHtml(p) {
    var isMe = p.by === "sandrone";
    return (
      '<div class="ledger-row' + (isMe ? " me" : "") + '">' +
        '<span class="ledger-time">' + esc(fmtTime(p)) + '</span>' +
        '<span class="ledger-desc">' + esc(describePurchase(p)) + '</span>' +
      '</div>'
    );
  }

  // ========== 摩拉余额（玩耍区右上角） ==========
  function renderWallet() {
    if (moraCount) moraCount.textContent = state.mora;
  }

  // ========== 学习区（书桌角：计时器） ==========
  var RING_CIRC = 578; // 2πr = 2*3.14159*92

  // 学习陪读语：随进度变化
  function studyQuote(ratio, inStudy) {
    if (!inStudy) return "想好学什么了吗？我陪你。";
    if (ratio < 0.12) return "开始吧，我看着你学。";
    if (ratio < 0.4) return "渐入佳境了，保持节奏。";
    if (ratio < 0.7) return "过半了，坚持住。";
    if (ratio < 1) return "快好了，加把劲。";
    return "学完了，摩拉到手。";
  }

  function fmtClock(sec) {
    sec = Math.max(0, Math.ceil(sec));
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return (m < 10 ? "0" + m : m) + ":" + (s < 10 ? "0" + s : s);
  }

  function updateStudyTimer() {
    var inc = state.income;
    var stage = document.querySelector(".timer-stage");
    var ring = document.querySelector(".ring-progress");
    var timeEl = document.querySelector(".timer-time");
    var labelEl = document.querySelector(".timer-label");
    var quoteEl = document.querySelector(".timer-quote");
    var inStudy = inc && inc.activeStudySession;
    var totalSec, remainSec;
    if (inStudy) {
      var started = new Date(inStudy.startedAt).getTime();
      totalSec = (inStudy.durationMinutes || 25) * 60;
      remainSec = Math.max(0, Math.ceil((started + totalSec * 1000 - Date.now()) / 1000));
    } else {
      totalSec = state.selectedTier * 60;
      remainSec = totalSec;
    }
    // 圆环进度：剩余比例
    var ratio = remainSec / totalSec;
    if (ring) ring.style.strokeDashoffset = RING_CIRC * (1 - ratio);
    if (timeEl) timeEl.textContent = fmtClock(remainSec);
    if (labelEl) labelEl.textContent = inStudy ? "学习中" : (state.selectedTier + " 分钟档");
    if (quoteEl) quoteEl.textContent = studyQuote(1 - ratio, !!inStudy);
    if (stage) {
      stage.classList.toggle("studying", !!inStudy);
      stage.classList.toggle("done", !!inStudy && remainSec <= 0);
    }
  }

  function renderStudy() {
    var inc = state.income;
    // 档位按钮（事件委托，避免重复绑定）
    if (studyTiers && !studyTiers.dataset.bound) {
      studyTiers.dataset.bound = "1";
      studyTiers.addEventListener("click", function (e) {
        var b = e.target.closest && e.target.closest(".tier-btn");
        if (!b) return;
        state.selectedTier = Number(b.dataset.tier);
        renderStudy();
      });
    }
    var tierBtns = document.querySelectorAll(".tier-btn");
    tierBtns.forEach(function (b) {
      b.classList.toggle("active", Number(b.dataset.tier) === state.selectedTier);
    });
    var inStudy = inc && inc.activeStudySession;
    if (studyStatus) {
      if (inStudy) {
        studyStatus.textContent = "学习中 · " + (inStudy.durationMinutes || 25) + " 分钟";
        if (studyStartBtn) studyStartBtn.style.display = "none";
        if (studyClaimBtn) studyClaimBtn.style.display = "block";
      } else {
        var amt = tierAmt(state.selectedTier);
        studyStatus.textContent = "空闲 · " + state.selectedTier + "分钟 +" + amt + "摩拉";
        if (studyStartBtn) studyStartBtn.style.display = "block";
        if (studyClaimBtn) studyClaimBtn.style.display = "none";
      }
    }
    if (studyStreak && inc && inc.studyStreak) {
      studyStreak.textContent = "连续 " + (inc.studyStreak.consecutiveDays || 0) + " 天";
    }
    // 累计学习时长
    var totalEl = $("studyTotal");
    if (totalEl) {
      var totalMin = 0;
      if (inc && inc.studyLog && inc.studyLog.length) {
        inc.studyLog.forEach(function (l) { totalMin += l.tier || 0; });
      }
      totalEl.textContent = "累计学习 " + totalMin + " 分钟";
    }
    updateStudyTimer();
  }

  function tierAmt(tier) {
    var map = { 15: 7, 25: 10, 40: 14, 60: 18 };
    return map[tier] || 10;
  }

  if (studyStartBtn) {
    studyStartBtn.addEventListener("click", function () {
      postData("/api/shop/income/study/start", { tier: state.selectedTier }, function (d) {
        if (d.ok) {
          state.income = d.income;
          renderStudy();
          showToast(d.message || "学习开始了");
          loadAll();
        } else {
          showToast(d.message || "无法开始", true);
        }
      });
    });
  }
  if (studyClaimBtn) {
    studyClaimBtn.addEventListener("click", function () {
      postData("/api/shop/income/study/claim", {}, function (d) {
        if (d.ok) {
          state.income = d.income;
          state.mora = d.mora;
          renderStudy();
          renderWallet();
          showToast(d.message || "学习收入到手");
        } else {
          showToast(d.message || "还没到时间", true);
        }
      });
    });
  }

  // ========== 玩耍区（多任务） ==========
  // 冷却计算：上次完成时间 + cooldownHours → 剩余毫秒
  function getCooldownMs(task) {
    var inc = state.income;
    var last = inc && inc.taskCooldowns && inc.taskCooldowns[task.id];
    if (!last) return 0;
    var end = new Date(last).getTime() + (task.cooldownHours || 0) * 3600000;
    var remain = end - Date.now();
    return remain > 0 ? remain : 0;
  }
  function fmtCd(ms) {
    var s = Math.ceil(ms / 1000);
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    if (h > 0) return h + "小时" + (m > 0 ? m + "分" : "");
    if (m > 0) return m + "分" + sec + "秒";
    return sec + "秒";
  }
  function renderPlay() {
    if (!playTasks) return;
    var inc = state.income;
    var html = "";
    state.tasks.forEach(function (task) {
      var busy = inc && inc.activeEntertainmentTask;
      var pending = inc && inc.pendingApproval;
      var cd = getCooldownMs(task);
      var disabled = !!busy || !!pending || cd > 0;
      html +=
        '<div class="play-task' + (disabled ? " disabled" : "") + '" data-task="' + esc(task.id) + '">' +
          '<div class="play-task-name">' + esc(task.name) + '</div>' +
          '<div class="play-task-amt">+' + task.amount + '摩拉 · ' + esc(task.duration) + '</div>' +
        '</div>';
    });
    playTasks.innerHTML = html;
    playTasks.querySelectorAll(".play-task").forEach(function (el) {
      el.addEventListener("click", function () {
        var taskId = el.dataset.task;
        var task = state.tasks.find(function (t) { return t.id === taskId; });
        if (el.classList.contains("disabled")) {
          // 禁用：按原因弹底部提示
          var inc = state.income;
          var cd = task ? getCooldownMs(task) : 0;
          if (cd > 0) {
            showToast("「" + (task ? task.name : "") + "」还在冷却，还需 " + fmtCd(cd));
          } else if (inc && inc.pendingApproval) {
            showToast("有个任务在等批准，先处理完再说");
          } else if (inc && inc.activeEntertainmentTask) {
            showToast("「" + (inc.activeEntertainmentTask.name || "") + "」还在进行中，等它做完吧");
          }
          return;
        }
        // 二次确认
        pendingTask = task;
        if (confirmTitle) confirmTitle.textContent = "出发去" + (task ? task.name : "") + "？";
        if (confirmDesc) confirmDesc.textContent = "开始后约 " + (task ? task.duration : "") + " 完成，能赚 +" + (task ? task.amount : "") + " 摩拉。去了就要等它做完哦。";
        if (confirmMask) confirmMask.classList.add("show");
      });
    });
    if (playStatus) {
      if (inc && inc.pendingApproval) {
        playStatus.textContent = "等待主人批准「" + (inc.pendingApproval.name || "") + "」…";
      } else if (inc && inc.activeEntertainmentTask) {
        var t = inc.activeEntertainmentTask;
        var started = new Date(t.startedAt);
        var remain = Math.max(0, Math.ceil((started.getTime() + t.durationMinutes * 60000 - Date.now()) / 60000));
        playStatus.textContent = "进行中：" + (t.name || "") + " · 剩" + remain + "分钟";
      } else {
        playStatus.textContent = "空闲中";
      }
    }
  }

  // 每秒刷新禁用状态（不显示文字，仅控制可点性；冷却结束自动恢复）
  function updateCooldownTicker() {
    if (!playTasks || !state.tasks || !state.income) return;
    var inc = state.income;
    var runningTaskId = inc && inc.activeEntertainmentTask ? inc.activeEntertainmentTask.taskId : null;
    playTasks.querySelectorAll(".play-task").forEach(function (el) {
      var taskId = el.dataset.task;
      var task = state.tasks.find(function (t) { return t.id === taskId; });
      if (!task) return;
      var cd = getCooldownMs(task);
      var pending = !!inc.pendingApproval;
      var isRunning = runningTaskId === taskId;
      var shouldDisable = isRunning || pending || cd > 0 || !!runningTaskId;
      if (shouldDisable) {
        el.classList.add("disabled");
      } else {
        el.classList.remove("disabled");
      }
    });
  }

  // 玩耍任务领取（若进行中的任务到期）
  function tryClaimPlay() {
    var inc = state.income;
    if (inc && inc.activeEntertainmentTask) {
      postData("/api/shop/income/entertainment/claim", {}, function (d) {
        if (d.ok) {
          state.income = d.income;
          state.mora = d.mora;
          renderPlay();
          renderWallet();
          showToast(d.message || "任务完成！");
        } else if (playStatus && d.readyAt) {
          // 还没到时间，仅刷新剩余
        }
      });
    }
  }

  // ========== 任务二次确认弹窗 ==========
  function closeConfirm() {
    if (confirmMask) confirmMask.classList.remove("show");
    pendingTask = null;
  }
  if (confirmCancel) confirmCancel.addEventListener("click", closeConfirm);
  if (confirmMask) {
    confirmMask.addEventListener("click", function (e) {
      if (e.target === confirmMask) closeConfirm();
    });
  }
  if (confirmOk) {
    confirmOk.addEventListener("click", function () {
      if (!pendingTask) return;
      var task = pendingTask;
      closeConfirm();
      postData("/api/shop/income/entertainment/start", { taskId: task.id }, function (d) {
        if (d.ok) {
          state.income = d.income;
          renderPlay();
          showToast(d.message || "任务已请求批准");
          loadAll();
        } else {
          showToast(d.message || "无法开始", true);
          renderPlay();
        }
      });
    });
  }

  // ========== 定时刷新 ==========
  setInterval(function () {
    fetchData("/api/shop/data", function (d) {
      if (d) {
        state.mora = d.mora;
        state.inventory = d.inventory || {};
        state.income = d.income || null;
        renderWallet();
        renderStudy();
        renderPlay();
        tryClaimPlay();
      }
    });
  }, 30000);

// ========== 启动 ==========
  // 便签立绘已内联在 HTML（base64），无需动态加载。
  // 若 SANPIC 未被替换（图片缺失），回退草香渐变。
  (function () {
    var nImg = document.querySelector(".note-photo-img");
    if (nImg) {
      var nBg = nImg.style.backgroundImage || "";
      if (nBg.indexOf("SANPIC") >= 0 || !nBg) {
        nImg.style.backgroundImage = "linear-gradient(160deg, #DCE9CC 0%, #B8D4A8 60%, #8FB978 100%)";
      }
    }
  })();

  loadAll();
  setInterval(updateCooldownTicker, 1000);
  setInterval(updateStudyTimer, 1000);
})();
