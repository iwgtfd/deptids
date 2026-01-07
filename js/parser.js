// js/parser.js  (Strict mode only)
// 支援格式：
// 1) CODE/NAME
// 2) CODE/NAME/CREDITS
//
// 分類與學分策略（嚴謹）
// - 通識：課碼 7 開頭 => category="ge"，credits=2（你已確認通識都是 2）
// - 共同必修：以 rule.requiredCourses（物件：課名->學分）抓學分 + category="required"
// - 其他課：
//   - 若使用者有輸入學分 => 用輸入
//   - 若沒輸入 => 視為錯行（要求補 /學分），避免亂算

import { normalizeCourseName } from "./normalize.js";

function normalizeLine(s){
  return (s || "").replace(/\s+/g, " ").trim();
}

function isLikelyCourseCode(code){
  if (!code) return false;
  const c = code.trim();
  return /^[0-9]{6,10}$/.test(c) || /^[A-Za-z0-9]{4,12}$/.test(c);
}

function parseCredits(x){
  if (x == null || x === "") return null;
  const n = Number(String(x).trim());
  if (Number.isFinite(n) && n >= 0.5 && n <= 6) return n;
  return null;
}

export function parseTranscriptToCourses(rawText, rule){
  const text = (rawText || "").replace(/\r/g, "\n");
  const lines = text.split("\n").map(normalizeLine).filter(Boolean);

  const courses = [];
  const errors = [];
  const seen = new Set();

  // 通識：你已確認「課碼 7 開頭」
  const gePrefixes = rule?.geCodePrefixes || ["7"];

  // 共同必修：新格式為物件（課名->學分）；兼容舊格式（陣列）
  const requiredMap =
    (rule && typeof rule.requiredCourses === "object" && !Array.isArray(rule.requiredCourses))
      ? rule.requiredCourses
      : null;

  const requiredList = Array.isArray(rule?.requiredCourses) ? rule.requiredCourses : [];

  // 建立「必修查表（normalized）」：讓 parser 與 engine 一致
  const requiredNormToCredit = new Map(); // normName -> credits
  if (requiredMap){
    for (const [name, cr] of Object.entries(requiredMap)){
      const n = normalizeCourseName(name);
      const v = Number(cr);
      if (n && Number.isFinite(v)) requiredNormToCredit.set(n, v);
    }
  } else {
    // 舊格式沒有學分，只能用 2 當保底（但你現在 rules.json 已是 map，這段只是兼容）
    for (const name of requiredList){
      const n = normalizeCourseName(name);
      if (n) requiredNormToCredit.set(n, 2);
    }
  }

  for (let i = 0; i < lines.length; i++){
    const line = lines[i];

    // 跳過常見非課程行
    if (/^(步驟|建議：|目前|提醒：)/.test(line)) continue;

    // 嚴謹：必須含 /
    if (!line.includes("/")){
      errors.push({
        lineNo: i + 1,
        line,
        reason: "缺少分隔符 /（格式需為 課程代碼/課程名稱，可加 /學分）"
      });
      continue;
    }

    const parts = line.split("/").map(p => p.trim()).filter(Boolean);
    if (parts.length < 2){
      errors.push({ lineNo: i + 1, line, reason: "欄位不足（至少需 CODE/NAME）" });
      continue;
    }

    const code = parts[0];
    const name = parts[1];
    const nameNorm = normalizeCourseName(name);

    if (!isLikelyCourseCode(code)){
      errors.push({ lineNo: i + 1, line, reason: "課程代碼格式不合理" });
      continue;
    }

    if (!nameNorm || name.length < 2){
      errors.push({ lineNo: i + 1, line, reason: "課程名稱太短或無法辨識" });
      continue;
    }

    // 去重：同 code+name 視為同一門
    const key = `${code}__${nameNorm}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // ===== 分類（嚴謹優先權：必修 > 通識 > 其他）=====
    const isRequired = requiredNormToCredit.has(nameNorm);
    const isGE = gePrefixes.some(p => code.startsWith(p));

    let category = "free";
    if (isGE) category = "ge";
    if (isRequired) category = "required";

    // ===== 學分決定（嚴謹）=====
    // 1) 使用者輸入
    let credits = parseCredits(parts[2] ?? null);

    // 2) 共同必修：直接用資料庫學分（最可靠）
    if (credits == null && isRequired){
      credits = requiredNormToCredit.get(nameNorm);
    }

    // 3) 通識固定 2
    if (credits == null && isGE){
      credits = 2;
    }

    // 4) 其他課：如果沒輸入學分 => 報錯（避免亂算）
    if (credits == null){
      errors.push({
        lineNo: i + 1,
        line,
        reason: "缺少學分：此課不在共同必修且非通識，請補第三欄 /學分（例：123456/資料結構/3）"
      });
      continue;
    }

    courses.push({
      code,
      name,     // 保留原始顯示用
      credits,  // parser 已盡量給出可信 credits（非必修/非通識則要求使用者填）
      status: "passed",
      category
    });
  }

  return { courses, errors };
}
