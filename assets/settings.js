/* ============================================================
   san-status-panel — 设置面板 & 图片调整 交互脚本
   v0.3.0 — 模块化版本
   功能模块:
     A. 节流 & 互动按钮
     B. 设置面板 开/关
     C. 配置加载 (loadPanelConfig)
     D. 头像/名称开关
     E. 会话列表加载
     F. 图片上传 / 拖拽调整 / 缩放
     G. 颜色选择器
     H. 透明度滑块
     I. 面板名称编辑
     J. 状态标签轮换
     K. 记忆碎片轮换
     L. 面板尺寸监听 (ResizeObserver)
   ============================================================ */

/* ============================================================
   A. 节流 & 互动按钮
   ============================================================ */
var _throttled = false;
function _tap(fn) {
  if (_throttled) return;
  _throttled = true;
  try { fn(); } catch (e) {}
  setTimeout(function () { _throttled = false; }, 3000);
}

document.getElementById("btnPoke").onclick = function () {
  _tap(window.sp);
};
document.getElementById("btnCoffee").onclick = function () {
  window.si("\u2615");
};
document.getElementById("btnFeed").onclick = function () {
  window.si("\ud83e\udd50");
};

/* ============================================================
   B. 设置面板 开/关
   ============================================================ */
document.getElementById("settingsBtn").onclick = function () {
  var p = document.getElementById("settingsPanel");
  p.classList.add("show");
  document.getElementById("panelOverlay").classList.add("show");
  loadSessions();
};

document.getElementById("spClose").onclick = function () {
  document.getElementById("settingsPanel").classList.remove("show");
  document.getElementById("panelOverlay").classList.remove("show");
};

document.getElementById("panelOverlay").onclick = function () {
  document.getElementById("settingsPanel").classList.remove("show");
  document.getElementById("panelOverlay").classList.remove("show");
};

/* ============================================================
   C. 配置加载
   ============================================================ */
function loadPanelConfig() {
  var tk = (function () {
    var m = (window.location.search || "").match(/[?&]token=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : "";
  })();

  // 对话流卡片场景：不加载背景图，保持干净底色，与 widget 区分
  var isCardSurface = document.body && document.body.getAttribute("data-surface") === "card";
  if (isCardSurface) {
    var bgElC = document.getElementById("panelBg");
    if (bgElC) bgElC.style.display = "none";
  }

  fetch("/api/plugins/san-status-panel/api/config")
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (d.bg && !isCardSurface) {
        var bgEl = document.getElementById("panelBg");
        if (d.bgConfig) {
          bgEl.style.background = "url(" + d.bg + "?token=" + tk + ") " + d.bgConfig.posX + "% " + d.bgConfig.posY + "% / " + d.bgConfig.scale + "% no-repeat";
        } else {
          bgEl.style.background = "url(" + d.bg + "?token=" + tk + ") center/cover no-repeat";
        }
        bgEl.classList.add("has-image");
        savedBgConfig.image = d.bg;
      }
      if (d.avatar) {
        var ac = document.getElementById("avatarCircle");
        if (d.avatarConfig) {
          ac.style.background = "url(" + d.avatar + "?token=" + tk + ") " + d.avatarConfig.posX + "% " + d.avatarConfig.posY + "% / " + d.avatarConfig.scale + "% no-repeat";
        } else {
          ac.style.background = "url(" + d.avatar + "?token=" + tk + ") center/cover no-repeat";
        }
        ac.textContent = "";
        savedAvatarConfig.image = d.avatar;
      }
      document.getElementById("showAvatarToggle").checked = d.showAvatar !== false;
      toggleAvatar();
      document.getElementById("showNameToggle").checked = d.showName !== false;
      toggleName();
      if (d.name) document.getElementById("panelTitle").textContent = d.name;
      if (d.textColor) {
        var root = document.documentElement.style;
        root.setProperty("--text-primary", d.textColor.primary);
        root.setProperty("--text-secondary", d.textColor.secondary);
        root.setProperty("--text-accent", d.textColor.accent);
        document.querySelectorAll(".color-dot").forEach(function (dot) {
          dot.classList.toggle("active", dot.dataset.accent === d.textColor.accent);
        });
      }
      if (d.cardOpacity) {
        document.getElementById("opacitySlider").value = d.cardOpacity;
        document.getElementById("opacityValue").textContent = d.cardOpacity + "%";
        document.documentElement.style.setProperty("--card-opacity", d.cardOpacity / 100);
      }
      if (d.bgConfig) { savedBgConfig = Object.assign(savedBgConfig, d.bgConfig); }
      if (d.avatarConfig) { savedAvatarConfig = Object.assign(savedAvatarConfig, d.avatarConfig); }
    }).catch(function () {});
}
loadPanelConfig();

/* ============================================================
   D. 头像/名称 开关
   ============================================================ */
function toggleAvatar() {
  var v = document.getElementById("showAvatarToggle").checked;
  document.getElementById("avatarSection").classList.toggle("hide-avatar", !v);
  fetch("/api/plugins/san-status-panel/api/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ showAvatar: v })
  }).catch(function () {});
}
document.getElementById("showAvatarToggle").onchange = toggleAvatar;

function toggleName() {
  var v = document.getElementById("showNameToggle").checked;
  document.getElementById("avatarSection").classList.toggle("hide-name", !v);
  fetch("/api/plugins/san-status-panel/api/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ showName: v })
  }).catch(function () {});
}
document.getElementById("showNameToggle").onchange = toggleName;

/* ============================================================
   E. 会话列表加载  (自备 token，不依赖 inline 拦截器)
   ============================================================ */
function loadSessions() {
  var token = (function () {
    var m = (window.location.search || "").match(/[?&]token=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : "";
  })();
  var url = "/api/plugins/san-status-panel/api/agent-sessions";
  if (token) url += "?token=" + encodeURIComponent(token);
  fetch(url)
    .then(function (r) { 
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json(); 
    })
    .then(function (d) {
      var ct = document.getElementById("sessionGroupsContainer");
      ct.innerHTML = "";
      if (!d.groups || d.groups.length === 0) {
        ct.innerHTML = '<div style="padding:16px;text-align:center;color:#999;font-size:13px">没有找到会话<br><span style="font-size:11px">请确认已配置至少一个 Agent</span></div>';
        return;
      }
      for (var a = 0; a < d.groups.length; a++) {
        var g = d.groups[a];
        var grp = document.createElement("div");
        grp.className = "ag-grp";
        var hasActive = g.sessions.some(function (s) { return s.active; });
        if (!hasActive) grp.classList.add("collapsed");
        var hd = document.createElement("div");
        hd.className = "ag-hd";
        var ic = document.createElement("span");
        ic.className = "fold";
        ic.textContent = "\u25BC";
        hd.appendChild(ic);
        hd.appendChild(document.createTextNode(g.label + (hasActive ? " \u2713" : "")));
        hd.onclick = function () { this.parentElement.classList.toggle("collapsed"); };
        grp.appendChild(hd);
        var sl = document.createElement("div");
        sl.className = "session-list";
        for (var s = 0; s < g.sessions.length; s++) {
          var si = document.createElement("div");
          si.className = "session-item";
          if (g.sessions[s].active) si.classList.add("active");
          si.textContent = g.sessions[s].label;
          si.dataset.aid = g.agentId;
          si.dataset.sid = g.sessions[s].id;
          si.dataset.sessionid = g.sessions[s].sid || "";
          si.onclick = function () {
            document.querySelectorAll(".session-item").forEach(function (x) { x.classList.remove("active"); });
            this.classList.add("active");
            var hd = this.parentElement.parentElement.querySelector(".ag-hd");
            document.querySelectorAll(".ag-hd").forEach(function (h) { h.textContent = h.textContent.replace(/\s*\u2713/, ""); });
            hd.textContent = hd.textContent.replace(/\s*\u2713/, "") + " \u2713";
            fetch("/api/plugins/san-status-panel/api/config", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(function () {
                var data = { targetAgent: this.dataset.aid, targetSession: this.dataset.sid };
                if (this.dataset.sessionid) data.targetSessionId = this.dataset.sessionid;
                return data;
              }.call(this))
            }).catch(function () {});
          };
          sl.appendChild(si);
        }
        grp.appendChild(sl);
        ct.appendChild(grp);
      }
    }).catch(function (e) {
      console.error("[设置] 加载会话列表失败", e);
      document.getElementById("sessionGroupsContainer").innerHTML =
        '<div style="padding:16px;text-align:center;color:#e88;font-size:13px">会话加载失败<br><span style="font-size:11px;color:#999">请检查网络或刷新重试</span></div>';
    });
}

/* ============================================================
   F. 图片上传 / 拖拽调整 / 滚轮缩放
   ============================================================ */
var savedBgConfig = { image: null, posX: 50, posY: 50, scale: 120 };
var savedAvatarConfig = { image: null, posX: 50, posY: 50, scale: 120 };
var tempBgConfig = { image: null, posX: 50, posY: 50, scale: 120, aspect: null };

var tempAvatarConfig = { image: null, posX: 50, posY: 50, scale: 120, aspect: null };
// --- 应用背景 / 头像到面板 ---
function applyBgToPanel(config) {
  var bg = document.getElementById("panelBg");
  if (config.image) {
    var tk = (function () { var m = (window.location.search || "").match(/[?&]token=([^&]+)/); return m ? decodeURIComponent(m[1]) : ""; })();
    bg.style.background = "url(" + config.image + "?token=" + encodeURIComponent(tk) + ") " + config.posX + "% " + config.posY + "% / " + config.scale + "% no-repeat";
    bg.classList.add("has-image");
  } else {
    bg.style.background = "";
    bg.classList.remove("has-image");
  }
}

function applyAvatarToPanel(config) {
  var ac = document.getElementById("avatarCircle");
  if (config.image) {
    var tk = (function () { var m = (window.location.search || "").match(/[?&]token=([^&]+)/); return m ? decodeURIComponent(m[1]) : ""; })();
    ac.style.background = "url(" + config.image + "?token=" + encodeURIComponent(tk) + ") " + config.posX + "% " + config.posY + "% / " + config.scale + "% no-repeat";
    ac.textContent = "";
  } else {
    ac.style.background = "";
    ac.textContent = "\u6851";
  }
}

// --- 预览背景 / 头像 ---
function applyBgPreview(config) {
  var p = document.getElementById("bgPreviewBg");
  if (config.image) p.style.backgroundImage = "url(" + config.image + ")";
  p.style.backgroundPosition = config.posX + "% " + config.posY + "%";
  p.style.backgroundSize = config.scale + "%";
}

function applyAvatarPreview(config) {
  var p = document.getElementById("avatarPreviewBg");
  if (config.image) p.style.backgroundImage = "url(" + config.image + ")";
  p.style.backgroundPosition = config.posX + "% " + config.posY + "%";
  p.style.backgroundSize = config.scale + "%";
}

// --- 拖拽 & 滚轮缩放 ---
// 拖拽采用 Pointer Events + setPointerCapture：
// 1. 监听器只在首次 initDrag 时注册一次（防重复监听导致抖动画错）
// 2. setPointerCapture 让拖拽期间指针事件始终指向预览框（移出边界不丢事件）
// 3. 百分比定位语义：offset = (pw - iw) * posX/100，可动范围 total = |pw - iw|
//    拖拽 1:1 跟随鼠标：拖右（dx>0）→ 图片内容视觉右移（offset 增大，方向由分母符号自动处理）
// 4. 纵向尺寸按图片真实宽高比计算：background-size 只按框宽缩放，图片高度 = 宽度 / 宽高比
//    （不按框高百分比算，否则非等比图片的纵向可动范围与实际渲染不符）
var dragState = null; // { previewEl, configRef, updateCallback, startX, startY, baseOffX, baseOffY }

function imageSizeAt(config, pw, ph) {
  var iw = pw * (config.scale / 100);
  var ih;
  if (config.aspect && config.aspect > 0) {
    ih = iw / config.aspect; // 图片真实高度
  } else {
    ih = ph * (config.scale / 100); // 未知比例时退化为按框等比
  }
  return { iw: iw, ih: ih };
}

function onDragMove(e) {
  if (!dragState) return;
  var s = dragState;
  var r = s.previewEl.getBoundingClientRect();
  var pw = r.width, ph = r.height;
  if (pw <= 0 || ph <= 0) return;
  var size = imageSizeAt(s.configRef, pw, ph);
  var iw = size.iw, ih = size.ih;
  var rawDx = e.clientX - s.startX, rawDy = e.clientY - s.startY;
  // 2px 死区：避免点击时轻微抖动误移图片
  if (Math.abs(rawDx) < 2 && Math.abs(rawDy) < 2) return;
  // === 关键：CSS background-position 的真实数学 ===
  // background-position: X% → 图片偏移 offset = (pw - iw) * X/100
  // 拖拽目标：拖右(dx>0) → 图片内容视觉右移
  // 图大(分母<0)：内容右移 = 露左 = posX 减小 → offset = (负)×(小) → offset 增大 → base + dx
  // 图小(分母>0)：内容右移 = 图片右移 = posX 增大 → offset = (正)×(大) → offset 增大 → base + dx
  // 两种情况的 offset 都是增大 → 统一 off_new = base + dx！
  // 反解：posX = offX / (pw - iw) * 100（不能用 (off-min)/total——图大时 min<0 会方向反）
  var minX = Math.min(0, pw - iw), maxX = Math.max(0, pw - iw);
  var minY = Math.min(0, ph - ih), maxY = Math.max(0, ph - ih);
  if (iw !== pw) {
    var offX = s.baseOffX + rawDx;
    offX = Math.max(minX, Math.min(maxX, offX));
    s.configRef.posX = (offX / (pw - iw)) * 100;
  }
  if (ih !== ph) {
    var offY = s.baseOffY + rawDy;
    offY = Math.max(minY, Math.min(maxY, offY));
    s.configRef.posY = (offY / (ph - ih)) * 100;
  }
  s.updateCallback();
}

function onDragUp(e) {
  if (!dragState) return;
  var s = dragState;
  try { s.previewEl.releasePointerCapture(e.pointerId); } catch (_) {}
  s.previewEl.classList.remove("dragging");
  dragState = null;
}

function initDrag(previewEl, configRef, updateCallback) {
  if (!previewEl) return;
  previewEl.addEventListener("pointerdown", function (e) {
    if (e.button !== undefined && e.button !== 0) return;
    dragState = null; // 清除可能残留的拖拽状态（指针在窗口外释放等情况）
    e.preventDefault();
    var r = previewEl.getBoundingClientRect();
    var pw = r.width, ph = r.height;
    var size = imageSizeAt(configRef, pw, ph);
    var iw = size.iw, ih = size.ih;
    // 锁定按下时的基准 offset（图片左上角相对框左上角）
    dragState = {
      previewEl: previewEl,
      configRef: configRef,
      updateCallback: updateCallback,
      startX: e.clientX,
      startY: e.clientY,
      baseOffX: (pw - iw) * (configRef.posX / 100),
      baseOffY: (ph - ih) * (configRef.posY / 100)
    };
    previewEl.classList.add("dragging");
    try { previewEl.setPointerCapture(e.pointerId); } catch (_) {}
  });
  if (!window.__sanDragBound) {
    window.__sanDragBound = true;
    window.addEventListener("pointermove", onDragMove);
    window.addEventListener("pointerup", onDragUp);
    window.addEventListener("pointercancel", onDragUp);
  }
}

// 读取图片真实宽高比（background-size 按宽度缩放后，高度由图片比例决定）
function loadImageAspect(src, config) {
  var img = new Image();
  img.onload = function () {
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      config.aspect = img.naturalWidth / img.naturalHeight;
    }
  };
  img.src = src;
}

function initWheelZoom(previewEl, configRef, sliderEl, valueEl, updateCallback, min, max) {
  if (!previewEl) return;
  if (!previewEl.__wheelBound) {
    previewEl.__wheelBound = true;
    previewEl.addEventListener("wheel", function (e) {
      e.preventDefault();
      var delta = e.deltaY > 0 ? -5 : 5;
      var newScale = parseInt(configRef.scale) + delta;
      newScale = Math.max(min, Math.min(max, newScale));
      configRef.scale = newScale;
      sliderEl.value = newScale;
      valueEl.textContent = newScale + "%";
      updateCallback();
    }, { passive: false });
  }
  if (!sliderEl.__sliderBound) {
    sliderEl.__sliderBound = true;
    sliderEl.addEventListener("input", function () {
      var val = parseInt(sliderEl.value);
      configRef.scale = val;
      valueEl.textContent = val + "%";
      updateCallback();
    });
  }
}

// --- 初始化拖拽缩放 ---
initDrag(document.getElementById("bgPreview"), tempBgConfig, function () { applyBgPreview(tempBgConfig); });
initWheelZoom(document.getElementById("bgPreview"), tempBgConfig, document.getElementById("bgScaleSlider"), document.getElementById("bgScaleValue"), function () { applyBgPreview(tempBgConfig); }, 50, 300);

initDrag(document.getElementById("avatarPreview"), tempAvatarConfig, function () { applyAvatarPreview(tempAvatarConfig); });
initWheelZoom(document.getElementById("avatarPreview"), tempAvatarConfig, document.getElementById("avatarScaleSlider"), document.getElementById("avatarScaleValue"), function () { applyAvatarPreview(tempAvatarConfig); }, 100, 300);

// --- 上传背景 ---
function uploadBg() {
  var input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.onchange = function () {
    var file = input.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (e) {
      Object.assign(tempBgConfig, { image: e.target.result, posX: 50, posY: 50, scale: 120 });
      loadImageAspect(e.target.result, tempBgConfig);
      applyBgPreview(tempBgConfig);
      document.getElementById("bgScaleSlider").value = 120;
      document.getElementById("bgScaleValue").textContent = "120%";
      var pnl = document.querySelector(".panel");
      var pw = pnl.offsetWidth || 460, ph = pnl.offsetHeight || 720;
      var bp = document.getElementById("bgPreview");
      var maxW = Math.min(280, pw - 80);
      bp.style.width = maxW + "px";
      bp.style.height = Math.round(maxW * ph / pw) + "px";
      bp.style.aspectRatio = "auto";
      document.getElementById("bgAdjustModal").classList.add("show");
    };
    reader.readAsDataURL(file);
  };
  input.click();
}
document.getElementById("uploadBgBtn").onclick = uploadBg;

// --- 立绘上传（完整版：选图 → 弹窗预览 → 拖拽/缩放 → 确认上传） ---
var tempNotePhotoConfig = { image: null, posX: 50, posY: 50, scale: 120, aspect: null };
var savedNotePhotoConfig = { image: null, posX: 50, posY: 50, scale: 120 };

function applyNotePhotoPreview(config) {
  var p = document.getElementById("notePhotoPreviewBg");
  if (!p) return;
  if (config.image) p.style.backgroundImage = "url(" + config.image + ")";
  p.style.backgroundPosition = config.posX + "% " + config.posY + "%";
  p.style.backgroundSize = config.scale + "%";
}

function openNotePhotoAdjustModal(imgSrc) {
  Object.assign(tempNotePhotoConfig, { image: imgSrc, posX: 50, posY: 50, scale: 120 });
  loadImageAspect(imgSrc, tempNotePhotoConfig);
  applyNotePhotoPreview(tempNotePhotoConfig);
  var sl = document.getElementById("notePhotoScaleSlider");
  if (sl) { sl.value = 120; }
  var sv = document.getElementById("notePhotoScaleValue");
  if (sv) { sv.textContent = "120%"; }
  var pv = document.getElementById("notePhotoPreview");
  if (pv) {
    var pvSize = Math.min(240, document.querySelector(".panel").offsetWidth - 100);
    pv.style.width = pvSize + "px";
    pv.style.height = Math.round(pvSize * 1.18) + "px";
  }
  document.getElementById("notePhotoAdjustModal").classList.add("show");
}

var uploadNotePhoto = function () {
  var input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.onchange = function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (ev) {
      openNotePhotoAdjustModal(ev.target.result);
    };
    reader.readAsDataURL(file);
  };
  input.click();
};
document.getElementById("uploadNotePhotoBtn").onclick = uploadNotePhoto;

// 重新选择
if (document.getElementById("notePhotoReselect")) {
  document.getElementById("notePhotoReselect").onchange = function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (ev) {
      openNotePhotoAdjustModal(ev.target.result);
    };
    reader.readAsDataURL(file);
  };
}
// 取消
if (document.getElementById("notePhotoAdjustCancel")) {
  document.getElementById("notePhotoAdjustCancel").onclick = function () {
    document.getElementById("notePhotoAdjustModal").classList.remove("show");
  };
}
// 确认上传
if (document.getElementById("notePhotoAdjustConfirm")) {
  document.getElementById("notePhotoAdjustConfirm").onclick = function () {
    fetch("/api/plugins/san-status-panel/api/assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "note-photo", data: tempNotePhotoConfig.image })
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.ok) {
          savedNotePhotoConfig = { image: d.url, posX: tempNotePhotoConfig.posX, posY: tempNotePhotoConfig.posY, scale: tempNotePhotoConfig.scale };
          fetch("/api/plugins/san-status-panel/api/config", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ notePhoto: d.url, notePhotoConfig: savedNotePhotoConfig })
          });
          var btn = document.getElementById("uploadNotePhotoBtn");
          if (btn) {
            btn.textContent = "\u2713 \u5df2\u4e0a\u4f20";
            btn.style.borderColor = "#2E7D32";
            btn.style.color = "#2E7D32";
            setTimeout(function () {
              btn.textContent = "\u4e0a\u4f20";
              btn.style.borderColor = "";
              btn.style.color = "";
            }, 3000);
          }
        }
        document.getElementById("notePhotoAdjustModal").classList.remove("show");
      });
  };
}
// 初始化拖拽 + 滚轮缩放
initDrag(document.getElementById("notePhotoPreview"), tempNotePhotoConfig, function () { applyNotePhotoPreview(tempNotePhotoConfig); });
initWheelZoom(document.getElementById("notePhotoPreview"), tempNotePhotoConfig, document.getElementById("notePhotoScaleSlider"), document.getElementById("notePhotoScaleValue"), function () { applyNotePhotoPreview(tempNotePhotoConfig); }, 100, 300);

// --- 背景调整弹窗 ---
document.getElementById("bgReselect").onchange = function (e) {
  var file = e.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function (ev) {
    Object.assign(tempBgConfig, { image: ev.target.result, posX: 50, posY: 50, scale: 120 });
    loadImageAspect(ev.target.result, tempBgConfig);
    applyBgPreview(tempBgConfig);
    document.getElementById("bgScaleSlider").value = 120;
    document.getElementById("bgScaleValue").textContent = "120%";
  };
  reader.readAsDataURL(file);
};

document.getElementById("bgAdjustCancel").onclick = function () {
  document.getElementById("bgAdjustModal").classList.remove("show");
};

document.getElementById("bgAdjustConfirm").onclick = function () {
  fetch("/api/plugins/san-status-panel/api/assets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "bg", data: tempBgConfig.image })
  })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (d.ok) {
        savedBgConfig = { image: d.url, posX: tempBgConfig.posX, posY: tempBgConfig.posY, scale: tempBgConfig.scale };
        applyBgToPanel(savedBgConfig);
        fetch("/api/plugins/san-status-panel/api/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bg: d.url, bgConfig: savedBgConfig })
        });
        document.getElementById("bgAdjustModal").classList.remove("show");
      }
    });
};

// --- 上传头像 ---
function uploadAvatar() {
  var input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.onchange = function () {
    var file = input.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (e) {
      Object.assign(tempAvatarConfig, { image: e.target.result, posX: 50, posY: 50, scale: 120 });
      loadImageAspect(e.target.result, tempAvatarConfig);
      applyAvatarPreview(tempAvatarConfig);
      document.getElementById("avatarScaleSlider").value = 120;
      document.getElementById("avatarScaleValue").textContent = "120%";
      var avp = document.getElementById("avatarPreview");
      var avSize = Math.min(200, document.querySelector(".panel").offsetWidth - 120);
      avp.style.width = avSize + "px";
      avp.style.height = avSize + "px";
      avp.style.aspectRatio = "auto";
      document.getElementById("avatarAdjustModal").classList.add("show");
    };
    reader.readAsDataURL(file);
  };
  input.click();
}
document.getElementById("uploadAvatarBtn").onclick = uploadAvatar;

// --- 头像调整弹窗 ---
document.getElementById("avatarReselect").onchange = function (e) {
  var file = e.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function (ev) {
    Object.assign(tempAvatarConfig, { image: ev.target.result, posX: 50, posY: 50, scale: 120 });
    loadImageAspect(ev.target.result, tempAvatarConfig);
    applyAvatarPreview(tempAvatarConfig);
    document.getElementById("avatarScaleSlider").value = 120;
    document.getElementById("avatarScaleValue").textContent = "120%";
  };
  reader.readAsDataURL(file);
};

document.getElementById("avatarAdjustCancel").onclick = function () {
  document.getElementById("avatarAdjustModal").classList.remove("show");
};

document.getElementById("avatarAdjustConfirm").onclick = function () {
  fetch("/api/plugins/san-status-panel/api/assets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "avatar", data: tempAvatarConfig.image })
  })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (d.ok) {
        savedAvatarConfig = { image: d.url, posX: tempAvatarConfig.posX, posY: tempAvatarConfig.posY, scale: tempAvatarConfig.scale };
        applyAvatarToPanel(savedAvatarConfig);
        fetch("/api/plugins/san-status-panel/api/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ avatar: d.url, avatarConfig: savedAvatarConfig })
        });
        document.getElementById("avatarAdjustModal").classList.remove("show");
      }
    });
};

/* ============================================================
   G. 颜色选择器
   ============================================================ */
document.querySelectorAll(".color-dot").forEach(function (dot) {
  dot.onclick = function () {
    document.querySelectorAll(".color-dot").forEach(function (d) { d.classList.remove("active"); });
    this.classList.add("active");
    var root = document.documentElement.style;
    root.setProperty("--text-primary", this.dataset.primary);
    root.setProperty("--text-secondary", this.dataset.secondary);
    root.setProperty("--text-accent", this.dataset.accent);
    fetch("/api/plugins/san-status-panel/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ textColor: { primary: this.dataset.primary, secondary: this.dataset.secondary, accent: this.dataset.accent } })
    });
  };
});

/* ============================================================
   H. 透明度滑块
   ============================================================ */
document.getElementById("opacitySlider").oninput = function () {
  var v = this.value;
  document.getElementById("opacityValue").textContent = v + "%";
  document.documentElement.style.setProperty("--card-opacity", v / 100);
};
document.getElementById("opacitySlider").onchange = function () {
  fetch("/api/plugins/san-status-panel/api/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cardOpacity: parseInt(this.value) })
  });
};

/* ============================================================
   I. 面板名称编辑
   ============================================================ */
document.getElementById("panelTitle").onclick = function () {
  var old = this.textContent;
  var input = document.createElement("input");
  input.value = old;
  input.className = "panel-title-input";
  this.textContent = "";
  this.appendChild(input);
  input.focus();
  input.onblur = input.onkeydown = function (e) {
    if (e.type === "blur" || e.key === "Enter") {
      var name = input.value.trim() || old;
      document.getElementById("panelTitle").textContent = name;
      fetch("/api/plugins/san-status-panel/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name })
      });
    }
  };
};

/* ============================================================
   J. 状态标签云 轮换
   ============================================================ */
var statusTags = [
  ["陪伴中", "嘴硬中"],
  ["思考中", "偷偷高兴"],
  ["放空中", "期待互动"],
  ["充电中", "想吃甜食"],
  ["工作中", "等你戳"],
  ["发呆", "回忆中"]
];
var tagIdx = 0;
setInterval(function () {
  tagIdx = (tagIdx + 1) % statusTags.length;
  var tags = statusTags[tagIdx];
  document.getElementById("statusTagCloud").innerHTML = tags.map(function (t) {
    return '<span class="status-tag">' + t + '</span>';
  }).join("");
}, 5000);

/* ============================================================
   K. 记忆碎片 轮换
   ============================================================ */
// 每日碎片：优先从后端接口读（当天从会话提取的真实短句），接口无数据才用本地文案池兑底
var memories = [
  "正在回忆：那天下午你说她\"丑萌\"，她偷偷记到了现在…",
  "碎片浮现：17:23 被喂了咖啡，她觉得你是故意的。",
  "脑海里闪过：你说\"早点休息\"，她其实有点开心。",
  "突然想起：那次深夜聊到凌晨，你说她像星星。",
  "记忆闪回：你第一次戳她，她说\"反弹\"然后笑了。",
  "往事浮现：你送她牛角包，她嘴上嫌弃却全吃完了。"
];
var dailyFragments = []; // 真实碎片（当天从会话提取）
var memIdx = 0;

function renderMemory() {
  var el = document.getElementById("memoryText");
  if (!el) return;
  if (dailyFragments.length > 0) {
    var f = dailyFragments[memIdx % dailyFragments.length];
    el.textContent = "💭 她记得你说过：「" + f + "」";
  } else {
    el.textContent = "💭 " + memories[memIdx % memories.length];
  }
}

// 每天拉一次真实碎片（接口有缓存，当天后续请求直接返回）
function loadFragments() {
  fetch("/api/plugins/san-status-panel/api/fragments")
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (d && d.ok && Array.isArray(d.fragments) && d.fragments.length > 0) {
        dailyFragments = d.fragments;
        memIdx = 0;
        renderMemory();
      }
    })
    .catch(function () {});
}

setInterval(function () {
  memIdx++;
  renderMemory();
}, 7000);

// 页面就绪后加载碎片
if (document.readyState === "complete" || document.readyState === "interactive") {
  loadFragments();
} else {
  document.addEventListener("DOMContentLoaded", loadFragments);
}

/* ============================================================
   L. 面板尺寸监听 — 实时更新调整弹窗预览尺寸
   ============================================================ */
function updateAdjustPreviewSizes() {
  var pnl = document.querySelector(".panel");
  if (!pnl) return;
  var pw = pnl.offsetWidth || 460, ph = pnl.offsetHeight || 720;

  if (document.getElementById("bgAdjustModal").classList.contains("show")) {
    var bp = document.getElementById("bgPreview");
    var maxW = Math.min(280, pw - 80);
    bp.style.width = maxW + "px";
    bp.style.height = Math.round(maxW * ph / pw) + "px";
  }

  if (document.getElementById("avatarAdjustModal").classList.contains("show")) {
    var avp = document.getElementById("avatarPreview");
    var avSize = Math.min(200, pw - 120);
    avp.style.width = avSize + "px";
    avp.style.height = avSize + "px";
  }
}

if (window.ResizeObserver) {
  new ResizeObserver(function () {
    updateAdjustPreviewSizes();
  }).observe(document.querySelector(".panel"));
}

/* ============================================================
   位置（天气）— 获取精确位置（Geolocation 权限请求）
   ============================================================ */
function fmtLoc(loc) {
  if (!loc) return "未获取";
  var name = loc.city || loc.label || "";
  var coord = (loc.lat != null && loc.lon != null) ? loc.lat.toFixed(2) + "," + loc.lon.toFixed(2) : "";
  var src = loc.source === "geolocation" ? "精确" : (loc.source === "ip" ? "IP" : "默认");
  return (name ? name + " " : "") + coord + (src ? "（" + src + "）" : "");
}

function initLocation() {
  var locStatus = document.getElementById("locStatus");
  var locateBtn = document.getElementById("locateBtn");
  if (!locStatus || !locateBtn) return;

  // 加载已有位置
  fetch("/api/plugins/san-status-panel/api/location")
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (d && d.ok && d.location) {
        locStatus.textContent = fmtLoc(d.location);
      }
    })
    .catch(function () {});

  // 点击获取 → Geolocation 权限请求
  locateBtn.onclick = function () {
    if (!navigator.geolocation) {
      locStatus.textContent = "浏览器不支持定位";
      return;
    }
    locStatus.textContent = "请求定位权限…";
    locateBtn.disabled = true;
    // 兜底超时：Electron 主进程未开放权限时，getCurrentPosition 可能既不回调成功也不回调失败（静默吞掉），
    // 此时 6 秒后主动判定为"暂不可用"，避免按钮永远卡在"请求中"。
    var silentTimer = setTimeout(function () {
      locStatus.textContent = "定位暂不可用（宿主应用未开放定位权限）";
      locateBtn.disabled = false;
    }, 6000);
    var finish = function () { clearTimeout(silentTimer); };
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        finish();
        var lat = pos.coords.latitude;
        var lon = pos.coords.longitude;
        var acc = pos.coords.accuracy;
        var locInfo = {
          lat: lat,
          lon: lon,
          accuracy: acc,
          source: "geolocation",
          updatedAt: new Date().toISOString()
        };
        // 尝试用反向地理编码拿城市名（Nominatim，失败则只存坐标）
        fetch("https://nominatim.openstreetmap.org/reverse?format=json&lat=" + lat + "&lon=" + lon + "&accept-language=zh")
          .then(function (r) { return r.json(); })
          .then(function (g) {
            if (g && g.address) {
              locInfo.city = g.address.city || g.address.town || g.address.county || "";
              locInfo.region = g.address.state || g.address.province || "";
              locInfo.label = (locInfo.city || "") + (locInfo.region ? ", " + locInfo.region : "");
            }
            saveLoc(locInfo, locStatus, locateBtn);
          })
          .catch(function () { saveLoc(locInfo, locStatus, locateBtn); });
      },
      function (err) {
        finish();
        var msg = "定位暂不可用";
        if (err.code === 1) msg = "定位暂不可用（权限被拒绝）";
        else if (err.code === 2) msg = "定位暂不可用（位置信息不可用）";
        else if (err.code === 3) msg = "定位暂不可用（定位超时）";
        locStatus.textContent = msg;
        locateBtn.disabled = false;
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  function saveLoc(locInfo, statusEl, btnEl) {
    fetch("/api/plugins/san-status-panel/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ location: locInfo })
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && d.ok) {
          statusEl.textContent = fmtLoc(locInfo);
        } else {
          statusEl.textContent = "保存失败";
        }
      })
      .catch(function () { statusEl.textContent = "保存失败"; })
      .finally(function () { btnEl.disabled = false; });
  }
}

// 设置面板打开时初始化位置功能
document.addEventListener("DOMContentLoaded", function () {
  initLocation();
});
// 也支持手动调用（面板可能是动态插入的）
if (document.readyState === "complete" || document.readyState === "interactive") {
  initLocation();
}