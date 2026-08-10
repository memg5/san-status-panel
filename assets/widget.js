// assets/widget.js
import { hana } from "@hana/plugin-sdk";

// 告诉宿主 iframe 已就绪
hana.ready();

const API_STATUS = "api/status";
const API_POKE = "api/poke";
const API_SEND = "api/send";

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function render(data) {
  const activity = data.activity || "⚙️ 暂无状态";
  const energy = data.energy || "?";
  const mood = data.mood || "?";
  const updated = data.updatedAt
    ? new Date(data.updatedAt).toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  document.getElementById("content").innerHTML = `
    <div class="row"><span class="label">🎯 活动</span><span class="val">${esc(activity)}</span></div>
    <div class="row"><span class="label">🍵 精力</span><span class="val">${esc(energy)}</span></div>
    <div class="row"><span class="label">😊 心情</span><span class="val">${esc(mood)}</span></div>
    <div class="ok">🕐 更新于 ${esc(updated)}</div>
  `;

  // 只首次 resize：报告固定高度，内容变化不反复拉伸（对话流卡片不再拉长卡顿）
  if (!window.__sandoResized) {
    hana.ui.resize({ height: 300 });
    window.__sandoResized = true;
  }
}

async function loadStatus() {
  try {
    const res = await fetch(API_STATUS);
    if (!res.ok) throw new Error("请求失败");
    render(await res.json());
  } catch (err) {
    document.getElementById("content").innerHTML =
      '<div class="row"><span class="label">⚠️ 状态加载失败</span></div>';
  }
}

async function poke() {
  await fetch(API_POKE, { method: "POST" });
  hana.toast.show({ message: "戳了一下桑多涅", type: "info" });
  setTimeout(loadStatus, 800);
}

async function sendItem(item) {
  await fetch(API_SEND, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ item }),
  });
  hana.toast.show({ message: `送出 ${item}`, type: "success" });
  setTimeout(loadStatus, 800);
}

window.__sandoPoke = poke;
window.__sandoSend = sendItem;

loadStatus();
setInterval(loadStatus, 5000);

