// 学习玩耍室 — 全部通过后端API持久化
//  学习+赚钱可并行; 赚钱任务不可多个同时执行
(function () {
  "use strict";

  var moraEl   = document.getElementById("moraDisplay");
  var studyEl  = document.getElementById("studyDisplay");
  var taskEl   = document.getElementById("taskDisplay");
  var toastEl  = document.getElementById("toast");
  var btnStudy = document.getElementById("btnStudy");
  var btnEarn  = document.getElementById("btnEarn");
  var taskMenu = document.getElementById("taskMenu");
  var backBtn  = document.getElementById("playBackBtn");

  var API_BASE = "/api/plugins/san-status-panel";

  function apiUrl(path) {
    var url = API_BASE + path;
    var sep = url.indexOf("?") >= 0 ? "&" : "?";
    var m = (location.search || "").match(/[?&]token=([^&]+)/);
    var tk = m ? decodeURIComponent(m[1]) : "";
    if (tk) url += sep + "token=" + encodeURIComponent(tk);
    var ms = (location.search || "").match(/[?&]pluginSurfaceSession=([^&]+)/);
    var ss = ms ? decodeURIComponent(ms[1]) : "";
    if (ss) url += "&pluginSurfaceSession=" + encodeURIComponent(ss);
    return url;
  }

  function api(path, opts) {
    return fetch(apiUrl(path), opts || {}).then(function (r) { return r.json(); });
  }

  // ── 任务定义（与后端 shop.js ENTERTAINMENT_TASKS 对齐） ──
  var TASKS = {
    "repair-shop":  { name: "维修店上班",   emoji: "🔧", reward: 80 },
    "fish-river":   { name: "小河边钓鱼",   emoji: "🎣", reward: 40 },
    "farm-tomato":  { name: "农场收货番茄", emoji: "🍅", reward: 48 }
  };

  // ── 状态机 ──
  // studyRunning     前端学习计时中（25min后自动claim）
  // studyServerActive 服务端有未领取的学习会话
  // earnRunning       前端赚钱计时中（时间到自动claim）
  // earnServerActive  服务端有活跃赚钱任务
  // 学习+赚钱可并行 ｜ 赚钱任务互斥
  var state = {
    mora: 0,
    studyDays: 0,
    studyRunning: false,
    studyServerActive: false,
    earnRunning: false,
    earnTaskName: null,
    earnServerActive: false,
    menuOpen: false,
    pollTimer: null
  };

  // ════════════════ UI ─═══════════════

  var toastTimer = null;
  function toast(msg, warn) {
    toastEl.textContent = msg;
    toastEl.className = "play-toast show" + (warn ? " warn" : "");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.className = "play-toast"; }, 2400);
  }

  function getStatusText() {
    // 两者同时进行
    if ((state.studyRunning || state.studyServerActive) && (state.earnRunning || state.earnServerActive))
      return "学习中...(偷偷" + (state.earnTaskName || "赚钱") + "勿扰）";
    if (state.studyRunning || state.studyServerActive) return "学习中...";
    if (state.earnRunning || state.earnServerActive) return state.earnTaskName || "工作中";
    return "空闲";
  }

  function updateDisplay() {
    moraEl.innerHTML = '<span class="play-mora-icon"></span>' + state.mora;
    studyEl.textContent = state.studyDays;
    taskEl.textContent = getStatusText();
    // 学习按钮: 只被学习状态禁用
    btnStudy.disabled = state.studyRunning || state.studyServerActive;
    btnStudy.style.opacity = (state.studyRunning || state.studyServerActive) ? "0.6" : "1";
    // 赚钱按钮: 只被赚钱状态禁用
    btnEarn.disabled = state.earnRunning || state.earnServerActive;
    btnEarn.style.opacity = (state.earnRunning || state.earnServerActive) ? "0.6" : "1";
  }

  // ════════════════ 数据同步 ─═══════════════

  // 从 /api/shop/data 加载摩拉（唯一摩拉来源，不被轮询覆盖）
  function syncMora() {
    api("/api/shop/data").then(function (data) {
      if (data && data.ok) {
        state.mora = data.mora || 0;
        updateDisplay();
      }
    }).catch(function () {});
  }

  // 从 /api/shop/income 同步学习/赚钱状态（只读，不碰摩拉）
  function syncIncome(callback) {
    api("/api/shop/income").then(function (data) {
      if (!data || !data.ok) return;
      var inc = data.income;
      // 连续学习天数
      state.studyDays = (inc.studyStreak && inc.studyStreak.consecutiveDays) || 0;

      // 学习会话
      var session = inc.activeStudySession;
      if (session) {
        // 如果前端没在计时，说明是页面刷新后恢复的旧会话
        if (!state.studyRunning) {
          var started = new Date(session.startedAt);
          var deadline = new Date(started.getTime() + session.durationMinutes * 60 * 1000);
          if (new Date() >= deadline) {
            // 已完成 → 自动领取
            state.studyServerActive = false;
            claimStudyResult();
          } else {
            // 未完成 → 恢复前端计时
            state.studyServerActive = false;
            state.studyRunning = true;
            var remaining = deadline.getTime() - Date.now();
            scheduleStudyClaim(remaining);
          }
        }
      } else if (!state.studyRunning) {
        state.studyServerActive = false;
      }

      // 娱乐任务
      var task = inc.activeEntertainmentTask;
      if (task) {
        // 有活跃任务
        if (!state.earnRunning) {
          var tStarted = new Date(task.startedAt);
          var tDeadline = new Date(tStarted.getTime() + task.durationMinutes * 60 * 1000);
          state.earnTaskName = task.name;
          if (new Date() >= tDeadline) {
            // 已完成 → 自动领取
            state.earnServerActive = false;
            claimEarnResult();
          } else {
            // 未完成 → 恢复前端计时
            state.earnServerActive = false;
            state.earnRunning = true;
            var tRemaining = tDeadline.getTime() - Date.now();
            scheduleEarnClaim(tRemaining);
          }
        }
      } else if (inc.pendingApproval) {
        // 等待审批 → 保持赚钱状态，不覆盖earnTaskName
        if (!state.earnRunning) {
          state.earnServerActive = true;
          state.earnTaskName = TASKS[inc.pendingApproval.taskId] ? TASKS[inc.pendingApproval.taskId].name : "等待审批";
        }
      } else if (!state.earnRunning) {
        state.earnServerActive = false;
        state.earnTaskName = null;
      }

      updateDisplay();
      if (callback) callback();
    }).catch(function () {});
  }

  // ── 学习自动claim ──
  var studyClaimTimer = null;
  function scheduleStudyClaim(ms) {
    if (studyClaimTimer) clearTimeout(studyClaimTimer);
    studyClaimTimer = setTimeout(function () {
      claimStudyResult();
    }, ms);
  }

  function claimStudyResult() {
    api("/api/shop/income/study/claim", {
      method: "POST"
    }).then(function (res) {
      if (res.ok) {
        state.mora = res.mora || state.mora;
        state.studyRunning = false;
        state.studyServerActive = false;
        state.studyDays = (res.study && res.study.consecutiveDays) || state.studyDays;
        var amount = res.study ? res.study.amount : 7;
        var bonus = res.study ? (res.study.bonus || 0) : 0;
        toast("📖 学习完成！获得 " + amount + " 摩拉" + (bonus > 0 ? "（含连续奖励）" : ""));
        updateDisplay();
      } else if (res.readyAt) {
        // 还没到时间，重新调度
        var remaining = new Date(res.readyAt).getTime() - Date.now();
        if (remaining > 0) {
          state.studyRunning = true;
          scheduleStudyClaim(remaining);
        }
      } else {
        // 没有会话可领取
        state.studyRunning = false;
        state.studyServerActive = false;
        updateDisplay();
      }
    }).catch(function () {
      state.studyRunning = false;
      state.studyServerActive = true; // 标记可手动领取
      updateDisplay();
    });
  }

  // ── 赚钱自动claim ──
  var earnClaimTimer = null;
  function scheduleEarnClaim(ms) {
    if (earnClaimTimer) clearTimeout(earnClaimTimer);
    earnClaimTimer = setTimeout(function () {
      claimEarnResult();
    }, ms);
  }

  function claimEarnResult() {
    api("/api/shop/income/entertainment/claim", {
      method: "POST"
    }).then(function (res) {
      if (res.ok) {
        state.mora = res.mora || state.mora;
        state.earnRunning = false;
        state.earnServerActive = false;
        var tname = state.earnTaskName;
        state.earnTaskName = null;
        toast("💰 " + (tname || "任务") + "完成！获得 " + (res.task ? res.task.amount : 0) + " 摩拉");
        updateDisplay();
      } else if (res.readyAt) {
        var remaining = new Date(res.readyAt).getTime() - Date.now();
        if (remaining > 0) {
          state.earnRunning = true;
          scheduleEarnClaim(remaining);
        }
      } else {
        state.earnRunning = false;
        state.earnServerActive = false;
        state.earnTaskName = null;
        updateDisplay();
      }
    }).catch(function () {
      state.earnRunning = false;
      state.earnServerActive = true;
      updateDisplay();
    });
  }

  // ════════════════ 用户操作 ─═══════════════

  // ── 开始学习（不阻止赚钱） ──
  function startStudy() {
    if (state.studyRunning || state.studyServerActive) {
      toast("已有学习任务", true);
      return;
    }
    api("/api/shop/income/study/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier: 70 })
    }).then(function (data) {
      if (data.ok) {
        state.studyRunning = true;
        state.studyServerActive = false;
        toast("📖 学习会话开始！25分钟后可领取收益");
        updateDisplay();
        scheduleStudyClaim(25 * 60 * 1000); // 25分钟
      } else {
        toast(data.message || "学习启动失败", true);
      }
    }).catch(function () {
      toast("网络异常，请重试", true);
    });
  }

  // ── 任务菜单 ──
  function toggleTaskMenu() {
    if (state.earnRunning || state.earnServerActive) {
      toast("已有进行中的任务", true);
      return;
    }
    state.menuOpen = !state.menuOpen;
    taskMenu.classList.toggle("show", state.menuOpen);
  }
  function closeTaskMenu() { state.menuOpen = false; taskMenu.classList.remove("show"); }

  // ── 开始赚钱（不阻止学习） ──
  function startTask(taskId) {
    var task = TASKS[taskId];
    if (!task) { closeTaskMenu(); return; }
    if (state.earnRunning || state.earnServerActive) {
      toast("已有进行中的任务", true);
      closeTaskMenu(); return;
    }
    api("/api/shop/income/entertainment/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId: taskId })
    }).then(function (data) {
      closeTaskMenu();
      if (data.ok) {
        state.earnRunning = true;
        state.earnServerActive = true;
        state.earnTaskName = task.name;
        toast(task.emoji + " " + task.name + "！任务已提交至审批队列");
        updateDisplay();
        // 轮询等待审批通过（统一用 pollTimer）
      } else {
        toast(data.message || "任务提交失败", true);
      }
    }).catch(function () {
      closeTaskMenu();
      toast("网络异常，请重试", true);
    });
  }

  // ── 手动领取（点击状态栏） ──
  function claimReady() {
    var tried = false;
    // 先试学习
    api("/api/shop/income/study/claim", { method: "POST" }).then(function (res) {
      if (res.ok) {
        tried = true;
        state.mora = res.mora || state.mora;
        state.studyRunning = false;
        state.studyServerActive = false;
        state.studyDays = (res.study && res.study.consecutiveDays) || state.studyDays;
        toast("✅ 领取成功！获得 " + (res.study ? res.study.amount : 7) + " 摩拉");
        updateDisplay();
        return;
      }
      // 再试赚钱
      api("/api/shop/income/entertainment/claim", { method: "POST" }).then(function (res2) {
        if (res2.ok) {
          state.mora = res2.mora || state.mora;
          state.earnRunning = false;
          state.earnServerActive = false;
          var tname = state.earnTaskName;
          state.earnTaskName = null;
          toast("💰 " + (tname || "任务") + "完成！获得 " + (res2.task ? res2.task.amount : 0) + " 摩拉");
          updateDisplay();
        } else if (!tried) {
          toast(res2.message || "无可领取的收益", true);
        }
      }).catch(function () {});
    }).catch(function () {});
  }

  // ════════════════ 初始化 ─═══════════════

  // 返回按钮
  if (backBtn) backBtn.addEventListener("click", function () {
    if (state.pollTimer) clearInterval(state.pollTimer);
    if (studyClaimTimer) clearTimeout(studyClaimTimer);
    if (earnClaimTimer) clearTimeout(earnClaimTimer);
    if (window.history.length > 1) { window.history.back(); }
    else { window.close(); }
  });

  // 按钮事件
  btnStudy.addEventListener("click", startStudy);
  btnEarn.addEventListener("click", toggleTaskMenu);

  // 点击状态文字手动领取
  taskEl.style.cursor = "pointer";
  taskEl.addEventListener("click", function () {
    if (state.studyServerActive || state.earnServerActive) claimReady();
  });

  // 菜单外点击关闭
  document.addEventListener("click", function (e) {
    if (state.menuOpen && !e.target.closest(".play-earn-wrap")) closeTaskMenu();
  });

  // 任务选项点击
  Array.prototype.forEach.call(taskMenu.querySelectorAll(".play-task-item"), function (item) {
    item.addEventListener("click", function (e) {
      e.stopPropagation();
      startTask(this.dataset.task);
    });
  });

  // 键盘领取
  document.addEventListener("keydown", function (e) {
    if ((e.key === " " || e.key === "Enter") && (state.studyServerActive || state.earnServerActive)) {
      e.preventDefault();
      claimReady();
    }
  });

  // ── 启动 ──
  syncMora();
  syncIncome();
  // 统一轮询：每 10 秒同步服务端状态
  state.pollTimer = setInterval(function () {
    syncMora();
    syncIncome();
  }, 10000);

})();
