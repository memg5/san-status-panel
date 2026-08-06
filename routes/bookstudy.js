// routes/bookstudy.js — 学习手账页面路由
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BS_DIR = path.join(__dirname, "..", "bookstudy");

function getBookStudyPage() {
  try {
    const html = fs.readFileSync(path.join(BS_DIR, "bookstudy.html"), "utf-8");
    const css = fs.readFileSync(path.join(BS_DIR, "bookstudy.css"), "utf-8");
    const js = fs.readFileSync(path.join(BS_DIR, "bookstudy.js"), "utf-8");
    return html
      .replace("/* INLINE_CSS */", css)
      .replace("/* INLINE_JS */", js);
  } catch (e) {
    return null;
  }
}

export default function (app, ctx) {
  // 已暂停 — 学习手账功能暂不启用
  // 恢复方法: 注释掉下方暂停分支, 取消上面 getBookStudyPage 的调用
  app.get("/bookstudy", (c) => {
    // const page = getBookStudyPage();
    // if (!page) return c.text("学习手账正在装订中…", 503);
    // return c.html(page);
    return c.text("学习手账已暂停使用，敬请期待回归。", 503);
  });
}
