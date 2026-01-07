// js/engine.js
import { normalizeCourseName } from "./normalize.js";

export function runAudit(courses, rules, year, track = null) {
  const rule = rules[year];
  if (!rule) throw new Error("找不到規定版本：" + year);

  const passed = courses.filter((c) => c.status === "passed");

  const sumCredits = (arr) => arr.reduce((s, c) => s + (c.credits || 0), 0);

  const totalCredits = sumCredits(passed);
  const geCredits = sumCredits(passed.filter((c) => c.category === "ge"));

  // =========================
  // 共同必修：normalize 後 exact match
  // =========================
  const requiredList = rule.requiredCourses || [];

  // 使用者已修課名（正規化後）集合
  const takenNameSet = new Set(
    passed.map((c) => normalizeCourseName(c.name)).filter(Boolean)
  );

  // 規則表必修課名（原文 + 正規化）
  const requiredPairs = requiredList.map((raw) => ({
    raw,
    norm: normalizeCourseName(raw),
  }));

  // 缺項：用規則表原文輸出（UI 顯示更正式）
  const missingRequired = requiredPairs
    .filter((r) => !takenNameSet.has(r.norm))
    .map((r) => r.raw);

  const requiredDone = requiredList.length - missingRequired.length;

  // 額外提示：使用者輸入但「不是共同必修清單中的任何一門」（正規化後仍找不到）
  // 這可以用來提醒「你是不是打錯課名」
  const requiredNormSet = new Set(requiredPairs.map((x) => x.norm));
  const unrecognizedInputs = [];
  for (const c of passed) {
    const n = normalizeCourseName(c.name);
    if (!n) continue;

    // 如果不在 required 清單內，就列入提醒
    // （注意：這會包含通識/選修等非必修課名；若你只想針對「看起來像必修」才提示，可再加白名單/關鍵字）
    if (!requiredNormSet.has(n)) {
      unrecognizedInputs.push(c.name);
    }
  }

  // =========================
  // 專業註記（113）
  // =========================
  let specialization = null;
  if (year === "113") {
    const specCredits = sumCredits(
      passed.filter((c) => c.category === "specialization")
    );
    specialization = {
      current: specCredits,
      required: rule.specialization?.minCredits ?? 0,
      ok: specCredits >= (rule.specialization?.minCredits ?? 0),
    };
  }

  // =========================
  // 114 乙組（示意）
  // =========================
  let trackResult = null;
  if (year === "114" && track === "B") {
    const majorCredits = sumCredits(passed.filter((c) => c.category === "major"));
    const minorCredits = sumCredits(passed.filter((c) => c.category === "minor"));
    trackResult = {
      major: { current: majorCredits, required: rule.tracks?.B?.majorCredits ?? 0 },
      minor: {
        current: minorCredits,
        required: rule.tracks?.B?.minorOrProgramCredits ?? 0,
      },
    };
  }

  return {
    total: {
      current: totalCredits,
      required: rule.totalCredits,
      ok: totalCredits >= rule.totalCredits,
    },
    ge: {
      current: geCredits,
      required: rule.geCredits,
      ok: geCredits >= rule.geCredits,
    },
    required: {
      done: requiredDone,
      total: requiredList.length,
      missing: missingRequired,
      // 讓 app.js 顯示提醒（你前面那段 buildReportText 加上即可）
      unrecognizedInputs,
    },
    specialization,
    trackResult,
  };
}
