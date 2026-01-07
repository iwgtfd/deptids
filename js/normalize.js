// js/normalize.js
export function normalizeCourseName(name){
  if (!name) return "";
  return String(name)
    .trim()
    .replace(/\u3000/g, " ")          // 全形空白 -> 半形空白
    .replace(/\s+/g, " ")            // 多空白 -> 單空白
    .replace(/[－–—]/g, "-")         // 各種破折號 -> "-"
    .replace(/[／]/g, "/")           // 全形斜線 -> 半形斜線
    .replace(/[：]/g, ":")           // 全形冒號 -> 半形冒號
    .replace(/[（]/g, "(")
    .replace(/[）]/g, ")")
    .trim();
}
