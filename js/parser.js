// js/parser.js
// 目標：把 textarea 貼上的成績單文字，解析成 courses[]

function normalizeLine(s){
  return (s || "")
    .replace(/\s+/g, " ")
    .replace(/[（(].*?[)）]/g, (m)=>m) // 保留括號內容，不破壞課名
    .trim();
}

function pickCredits(line){
  // 找出 line 中所有數字（避免抓到學年/學號等，採「合理學分範圍」）
  const nums = [...line.matchAll(/(\d+(?:\.\d+)?)/g)].map(m => Number(m[1]));
  // 合理學分通常 0.5~6；取最後一個符合者（成績單格式常把學分放後面）
  const candidates = nums.filter(n => n >= 0.5 && n <= 6);
  if (candidates.length === 0) return null;
  return candidates[candidates.length - 1];
}

function pickCourseName(line){
  // 嘗試抓「課名」：優先抓一段較長的中文/英文混合片段
  // 會排除太短的 token，並避開常見欄位字
  const banned = ["學年", "學期", "成績", "學分", "必選修", "通識", "系所", "課程", "平均"];
  const tokens = line.split(" ").filter(t => t.length >= 2);

  // 先找含中文的 token
  const zh = tokens.filter(t => /[\u4e00-\u9fff]/.test(t));
  const pickFrom = zh.length ? zh : tokens;

  // 選最長且不是欄位字的
  let best = "";
  for (const t of pickFrom){
    if (banned.some(b => t.includes(b))) continue;
    if (t.length > best.length) best = t;
  }

  // 再做一次清理：把明顯不是課名的符號去掉
  best = best.replace(/[|｜]/g, "").trim();
  return best.length >= 2 ? best : null;
}

function categorize(line, name, rule){
  const requiredList = rule?.requiredCourses || [];
  if (name && requiredList.includes(name)) return "required";

  // 最保守通識判斷（成績單常會出現「通識」「核心通識」「General Education」等字）
  const geHints = ["通識", "核心通識", "General Education", "GE"];
  if (geHints.some(h => line.includes(h))) return "ge";

  // 其他先當自由選修（之後加 catalog.json 再細分）
  return "free";
}

export function parseTranscriptToCourses(rawText, rule){
  const text = (rawText || "").replace(/\r/g, "\n");
  const lines = text.split("\n").map(normalizeLine).filter(Boolean);

  const courses = [];
  const seen = new Set();

  for (const line of lines){
    // 跳過很像表頭/雜訊的行
    if (line.length < 6) continue;
    if (/(國立中正大學|歷年成績單|學生|姓名|學號)/.test(line)) continue;

    const credits = pickCredits(line);
    const name = pickCourseName(line);

    if (!credits || !name) continue;

    // 去重：同名課只留第一次（之後可以改成保留最新/最高分）
    const key = `${name}__${credits}`;
    if (seen.has(key)) continue;
    seen.add(key);

    courses.push({
      name,
      credits,
      status: "passed",      // 第 4 步先全部視為通過，下一步再加成績判斷
      category: categorize(line, name, rule),
      raw: line              // 保留原始行，方便 debug
    });
  }

  return courses;
}
