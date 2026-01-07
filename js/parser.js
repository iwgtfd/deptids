// js/parser.js  (Strict mode, auto-credit from JSON)
// 支援格式：
// 1) CODE/NAME
// 2) CODE/NAME/CREDITS
//
// 學分策略（嚴謹 + 自動補學分）
// - 通識：課碼 7 開頭 => category="ge"，credits=2
// - 共同必修：從 rules[year].requiredCourses（可為 物件 or 陣列）抓學分
// - 專業註記（所有系的輔系/註記課庫）：從 rules.specializations 抓學分
// - 其他課：
//   - 若使用者有輸入學分 => 用輸入
//   - 若沒輸入且資料庫也找不到 => 報錯（要求補 /學分）

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

/** 把 rule.requiredCourses（陣列 or 物件）整理成 normName -> credits */
function buildRequiredNormCreditMap(rule){
  const map = new Map();

  // 新格式：物件 {課名: 學分}
  if (rule && typeof rule.requiredCourses === "object" && !Array.isArray(rule.requiredCourses)){
    for (const [name, cr] of Object.entries(rule.requiredCourses)){
      const n = normalizeCourseName(name);
      const v = Number(cr);
      if (n && Number.isFinite(v)) map.set(n, v);
    }
    return map;
  }

  // 舊格式：陣列 ["課名"...]（沒有學分資訊只能保底 2）
  if (Array.isArray(rule?.requiredCourses)){
    for (const name of rule.requiredCourses){
      const n = normalizeCourseName(name);
      if (n) map.set(n, 2);
    }
  }

  return map;
}

/** 把 rules.specializations 所有課程整理成 normName -> credits */
function buildSpecCatalogNormCreditMap(rules){
  const map = new Map();
  const specMap = rules?.specializations || {};

  for (const spec of Object.values(specMap)){
    const buckets = ["prerequisites", "required", "electives"];
    for (const key of buckets){
      const obj = spec?.[key];
      if (!obj || typeof obj !== "object" || Array.isArray(obj)) continue;

      for (const [name, cr] of Object.entries(obj)){
        const n = normalizeCourseName(name);
        const v = Number(cr);
        if (n && Number.isFinite(v)) map.set(n, v);
      }
    }
  }

  return map;
}

/**
 * ✅ 新版：傳入 (rawText, rules, year)
 * 回傳：{ courses: [], errors: [] }
 */
export function parseTranscriptToCourses(rawText, rules, year){
  const rule = rules?.[year];
  if (!rule){
    return {
      courses: [],
      errors: [{ lineNo: 0, line: "", reason: `找不到規定版本：${year}` }]
    };
  }

  const text = (rawText || "").replace(/\r/g, "\n");
  const lines = text.split("\n").map(normalizeLine).filter(Boolean);

  const courses = [];
  const errors = [];
  const seen = new Set();

  // 通識：你已確認課碼 7 開頭
  const gePrefixes = rule?.geCodePrefixes || ["7"];

  // 共同必修查表
  const requiredNormToCredit = buildRequiredNormCreditMap(rule);

  // 全域專業註記課庫查表
  const specCatalogNormToCredit = buildSpecCatalogNormCreditMap(rules);

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

    // 去重：同 code + normName 視為同一門
    const dedupeKey = `${code}__${nameNorm}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    // 分類優先權：必修 > 通識 > 其他
    const isRequired = requiredNormToCredit.has(nameNorm);
    const isGE = gePrefixes.some(p => code.startsWith(p));

    let category = "free";
    if (isGE) category = "ge";
    if (isRequired) category = "required";

    // 學分決定：輸入 > 必修表 > 通識固定 > 註記課庫 > 不知道就報錯
    let credits = parseCredits(parts[2] ?? null);

    if (credits == null && isRequired){
      credits = requiredNormToCredit.get(nameNorm);
    }

    if (credits == null && isGE){
      credits = 2;
    }

    if (credits == null && specCatalogNormToCredit.has(nameNorm)){
      credits = specCatalogNormToCredit.get(nameNorm);
    }

    if (credits == null){
      errors.push({
        lineNo: i + 1,
        line,
        reason:
          "缺少學分：此課不在共同必修/通識/專業註記課庫。請補第三欄 /學分，或確認課名是否與資料庫完全一致。"
      });
      continue;
    }

    courses.push({
      code,
      name,
      credits,
      status: "passed",
      category
    });
  }

  return { courses, errors };
}
