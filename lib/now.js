// lib/now.js — 统一时间戳生成（双格式，防模型误读 UTC）
// 模型看到 "2026-08-06T01:13:57.000Z" 不会换算时区，会误读成 01:13。
// 所以所有写文件的时间戳都附带 tsLocal（人类可读的 Asia/Shanghai 时间）。
// 用法：
//   import { nowStamp, nowLocal } from "../lib/now.js";
//   actions.push({ action:"poke", timestamp: nowStamp(), tsLocal: nowLocal() });
import path from "node:path";
import fs from "node:fs";

// 显式 Asia/Shanghai（UTC+8），不依赖服务器默认时区
export function nowLocal() {
  const d = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const week = ["日", "一", "二", "三", "四", "五", "六"];
  const hh = (d.getUTCHours() < 10 ? "0" : "") + d.getUTCHours();
  const mm = (d.getUTCMinutes() < 10 ? "0" : "") + d.getUTCMinutes();
  return (
    (d.getUTCMonth() + 1) + "月" + d.getUTCDate() + "日 星期" + week[d.getUTCDay()] +
    " " + hh + ":" + mm
  );
}

// ISO 时间戳（程序用，与 tsLocal 成对出现）
export function nowStamp() {
  return new Date().toISOString();
}
