// routes/learnplay.js — 学习玩耍室页面路由
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLAY_DIR = path.join(__dirname, "..", "learnplay");

function getPlayPage() {
  try {
    const html = fs.readFileSync(path.join(PLAY_DIR, "learnplay.html"), "utf-8");
    const css = fs.readFileSync(path.join(PLAY_DIR, "learnplay.css"), "utf-8");
    const js = fs.readFileSync(path.join(PLAY_DIR, "learnplay.js"), "utf-8");
    return html
      .replace("/* INLINE_CSS */", css)
      .replace("/* INLINE_JS */", js);
  } catch (e) {
    return null;
  }
}

export default function (app, ctx) {
  app.get("/learnplay", (c) => {
    const page = getPlayPage();
    if (!page) return c.text("学习玩耍室正在装修中…", 503);
    return c.html(page);
  });
}
