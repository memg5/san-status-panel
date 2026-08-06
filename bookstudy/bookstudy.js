// 学习手账 — bookstudy.js
// 三段翻页: 目标书写 → 方法选择 → 计时/问答
// 经济体系不动: 学习完成后走现有 study/claim (7摩拉+连续奖励)
// AI 评判暂未接入
(function () {
  "use strict";

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

  // ── DOM ──
  var moraEl    = document.getElementById("bsMora");
  var toastEl   = document.getElementById("bsToast");
  var bookEl    = document.getElementById("bsBook");
  var pages     = Array.prototype.slice.call(document.querySelectorAll(".bs-page"));
  var tabDots   = Array.prototype.slice.call(document.querySelectorAll(".bs-tab-dot"));
  var goalInput = document.getElementById("bsGoalInput");
  var goalCards = document.getElementById("bsGoalCards");
  var pinBtn    = document.getElementById("bsPinGoal");
  var next1     = document.getElementById("bsNext1");
  var prev1     = document.getElementById("bsPrev1");
  var next2     = document.getElementById("bsNext2");
  var backBtn   = document.getElementById("bsBack");
  var timeMinus = document.getElementById("bsTimeMinus");
  var timePlus  = document.getElementById("bsTimePlus");
  var timeVal   = document.getElementById("bsTimeVal");
  var remindChk = document.getElementById("bsRemind");
  var methodBtns = Array.prototype.slice.call(document.querySelectorAll(".bs-method"));
  var clockEl   = document.getElementById("bsClock");
  var progBar   = document.getElementById("bsProgressBar");
  var stopTimer = document.getElementById("bsStopTimer");
  var timerStage = document.getElementById("bsTimerStage");
  var qStage    = document.getElementById("bsQStage");
  var qList     = document.getElementById("bsQList");
  var qDone     = document.getElementById("bsQDone");
  var qMora     = document.getElementById("bsQMora");
  var qFinish   = document.getElementById("bsQFinish");

  // ── 状态 ──
  var state = {
    mora: 0,
    page: 0,
    goals: [],
    method: null,
    minutes: 25,
    remind: true,
    timerRunning: false,
    timerLeft: 0,
    timerTotal: 0,
    timerInterval: null,
    answers: {},
    earned: 0
  };

  var QUESTIONS = [
    { id: "q1", text: "这次专注做得顺利吗？" },
    { id: "q2", text: "有遇到卡住的地方吗？" },
    { id: "q3", text: "明天想怎么改进？" }
  ];
  var ANSWER_OPTS = ["很顺利", "一般般", "卡住了"];

  var toastTimer = null;
  function toast(msg, warn) {
    toastEl.textContent = msg;
    toastEl.className = "bs-toast show" + (warn ? " warn" : "");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.className = "bs-toast"; }, 2400);
  }

  // ── 摩拉 ──
  function loadMora() {
    api("/api/shop/data").then(function (d) {
      if (d && d.ok) {
        state.mora = d.mora || 0;
        moraEl.textContent = state.mora;
      }
    }).catch(function () {});
  }

  // ── 翻页 ──
  function goPage(n) {
    state.page = n;
    pages.forEach(function (p, i) { p.classList.toggle("active", i === n); });
    tabDots.forEach(function (d, i) { d.classList.toggle("active", i === n); });
    // 进入第 2 页时聚焦
    if (n === 1 && !state.method) {
      // nothing
    }
  }

  // ── 第 1 页: 目标 ──
  goalInput.addEventListener("input", function () {
    next1.disabled = !goalInput.value.trim();
  });
  goalInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && goalInput.value.trim()) pinGoal();
  });

  function pinGoal() {
    var text = goalInput.value.trim();
    if (!text) return;
    state.goals.push(text);
    renderGoalCards();
    goalInput.value = "";
    next1.disabled = true;
    toast("📌 目标已钉在纸上");
  }
  pinBtn.addEventListener("click", pinGoal);

  function renderGoalCards() {
    goalCards.innerHTML = "";
    state.goals.forEach(function (g, i) {
      var card = document.createElement("div");
      card.className = "bs-goal-card";
      card.textContent = g;
      var rm = document.createElement("button");
      rm.className = "bs-goal-remove";
      rm.textContent = "✕";
      rm.addEventListener("click", function (e) {
        e.stopPropagation();
        state.goals.splice(i, 1);
        renderGoalCards();
      });
      card.appendChild(rm);
      goalCards.appendChild(card);
    });
  }

  next1.addEventListener("click", function () {
    if (!goalInput.value.trim() && state.goals.length === 0) {
      toast("先写下目标哦", true);
      return;
    }
    if (goalInput.value.trim()) pinGoal();
    goPage(1);
  });

  // ── 第 2 页: 方法 + 计时设置 ──
  methodBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      methodBtns.forEach(function (b) { b.classList.remove("active"); });
      btn.classList.add("active");
      state.method = btn.dataset.method;
    });
  });

  timeMinus.addEventListener("click", function () {
    state.minutes = Math.max(5, state.minutes - 5);
    timeVal.textContent = state.minutes;
  });
  timePlus.addEventListener("click", function () {
    state.minutes = Math.min(120, state.minutes + 5);
    timeVal.textContent = state.minutes;
  });
  remindChk.addEventListener("change", function () {
    state.remind = remindChk.checked;
  });

  prev1.addEventListener("click", function () { goPage(0); });

  next2.addEventListener("click", function () {
    if (!state.method) { toast("先选一个学习方法", true); return; }
    startTimer();
  });

  // ── 第 3 页: 计时 ──
  function startTimer() {
    goPage(2);
    state.timerTotal = state.minutes * 60;
    state.timerLeft = state.timerTotal;
    timerStage.style.display = "block";
    qStage.style.display = "none";
    qDone.style.display = "none";
    clockEl.textContent = fmtTime(state.timerLeft);
    progBar.style.width = "0%";
    state.timerRunning = true;

    if (state.timerInterval) clearInterval(state.timerInterval);
    state.timerInterval = setInterval(function () {
      state.timerLeft--;
      if (state.timerLeft <= 0) {
        clearInterval(state.timerInterval);
        state.timerRunning = false;
        onTimerComplete();
        return;
      }
      clockEl.textContent = fmtTime(state.timerLeft);
      progBar.style.width = (100 * (1 - state.timerLeft / state.timerTotal)) + "%";
      if (state.remind && state.timerLeft <= 5 && state.timerLeft > 0) {
        if (state.timerLeft === 5) toast("⏰ 还剩 5 分钟");
      }
    }, 1000);
  }

  function fmtTime(s) {
    var mm = Math.floor(s / 60);
    var ss = s % 60;
    return (mm < 10 ? "0" : "") + mm + ":" + (ss < 10 ? "0" : "") + ss;
  }

  stopTimer.addEventListener("click", function () {
    if (state.timerInterval) clearInterval(state.timerInterval);
    state.timerRunning = false;
    onTimerComplete();
  });

  // 计时完成 → 领取收益 + 进入问答
  function onTimerComplete() {
    timerStage.style.display = "none";
    qStage.style.display = "block";
    buildQuestions();
    // 领取学习收益 (现有 API: 7 摩拉 + 连续奖励, 经济体系不动)
    api("/api/shop/income/study/claim", { method: "POST" }).then(function (res) {
      if (res.ok) {
        state.earned = (res.study && res.study.amount) || 7;
        state.mora = res.mora || state.mora;
        moraEl.textContent = state.mora;
        qMora.textContent = "+" + state.earned + " 摩拉" +
          ((res.study && res.study.bonus > 0) ? "（含连续奖励）" : "");
      } else if (res.message && res.message.indexOf("没有进行中的") >= 0) {
        // 无进行中的学习会话: 记录模式, 不发摩拉
        qMora.textContent = "已记录（无进行中会话）";
      } else {
        // 今天已领取等: 直接显示结果
        qMora.textContent = res.message || "+0 摩拉";
      }
    }).catch(function () {
      qMora.textContent = "已记录";
    });
  }

  // ── 问答 (暂存本地, AI 评判待接入) ──
  function buildQuestions() {
    state.answers = {};
    qList.innerHTML = "";
    qDone.style.display = "none";
    QUESTIONS.forEach(function (q) {
      var item = document.createElement("div");
      item.className = "bs-q-item";
      item.innerHTML = '<span class="bs-q-check">✓</span>' + q.text;
      item.addEventListener("click", function () {
        var sel = item.classList.contains("selected");
        document.querySelectorAll(".bs-q-item").forEach(function (x) { x.classList.remove("selected"); });
        if (!sel) {
          item.classList.add("selected");
          state.answers[q.id] = ANSWER_OPTS[0];
        } else {
          state.answers[q.id] = null;
        }
        // 简化: 选过即算完成
        qDone.style.display = "block";
      });
      qList.appendChild(item);
    });
  }

  qFinish.addEventListener("click", function () {
    state.goals = [];
    state.method = null;
    state.minutes = 25;
    timeVal.textContent = "25";
    methodBtns.forEach(function (b) { b.classList.remove("active"); });
    renderGoalCards();
    goPage(0);
    toast("收工！明天继续");
  });

  // ── 返回 ──
  if (backBtn) backBtn.addEventListener("click", function () {
    if (state.timerInterval) clearInterval(state.timerInterval);
    if (window.history.length > 1) { window.history.back(); }
    else { window.close(); }
  });

  // ── 初始化 ──
  loadMora();
  goPage(0);
})();
