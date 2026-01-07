// js/engine.js
import { normalizeCourseName } from "./normalize.js";

export function runAudit(courses, rules, year, track = null, specializationId = null) {
  const rule = rules?.[year];
  if (!rule) throw new Error("找不到規定版本：" + year);

  const norm = (s) => normalizeCourseName(s);
  const passed = (courses || []).filter(c => c.status === "passed");

  const sumCredits = (arr) => arr.reduce((s, c) => s + (Number(c.credits) || 0), 0);

  // -------------------------
  // 共同必修：rule.requiredCourses 是 {課名:學分}
  // -------------------------
  const requiredMap = rule.requiredCourses && typeof rule.requiredCourses === "object"
    ? rule.requiredCourses
    : {};

  const requiredNormSet = new Set(
    Object.keys(requiredMap).map(norm).filter(Boolean)
  );

  const takenNameSet = new Set(passed.map(c => norm(c.name)).filter(Boolean));

  const requiredMissing = Object.keys(requiredMap)
    .filter(name => !takenNameSet.has(norm(name)));

  const requiredDone = Object.keys(requiredMap).length - requiredMissing.length;

  const requiredCredits = sumCredits(
    passed.filter(c => requiredNormSet.has(norm(c.name)))
  );

  // -------------------------
  // 通識：category === "ge"
  // -------------------------
  const geCredits = sumCredits(passed.filter(c => c.category === "ge"));

  // -------------------------
  // 專業註記：只有「選到 specializationId」才計入 specCredits
  // 注意：specCredits 其實是從 free 裡面「抽出來」的一部分
  // -------------------------
  let specialization = null;
  let specCredits = 0;

  if (specializationId) {
    const spec = (rules?.specializations || {})[specializationId];
    if (!spec) {
      throw new Error(`找不到專業註記規則：${specializationId}`);
    }

    const prereqMap = spec.prerequisites || {};
    const reqMap = spec.required || {};
    const elecMap = spec.electives || {};
    const minCredits = spec.minCredits ?? 20;

    const prereqNames = Object.keys(prereqMap);
    const reqNames = Object.keys(reqMap);
    const elecNames = Object.keys(elecMap);

    const prereqMissing = prereqNames.filter(n => !takenNameSet.has(norm(n)));
    const requiredMissing = reqNames.filter(n => !takenNameSet.has(norm(n)));

    const allowedSet = new Set(
      [...prereqNames, ...reqNames, ...elecNames].map(norm).filter(Boolean)
    );

    // spec 只從「非共同必修、非通識」的課裡抓（避免把共同必修/通識重複算進 spec）
    const poolForSpec = passed.filter(c => c.category !== "required" && c.category !== "ge");

    const takenInSpec = poolForSpec.filter(c => allowedSet.has(norm(c.name)));
    specCredits = sumCredits(takenInSpec);

    const prereqOk = prereqMissing.length === 0;
    const requiredOk = requiredMissing.length === 0;
    const creditsOk = specCredits >= minCredits;

    specialization = {
      id: specializationId,
      name: spec.name || specializationId,
      credits: {
        current: specCredits,
        required: minCredits,
        remaining: Math.max(0, minCredits - specCredits),
        ok: creditsOk
      },
      prereq: {
        total: prereqNames.length,
        missing: prereqMissing,
        ok: prereqOk
      },
      required: {
        total: reqNames.length,
        missing: requiredMissing,
        ok: requiredOk
      },
      ok: prereqOk && requiredOk && creditsOk
    };
  }

  // -------------------------
  // 總學分
  // -------------------------
  const totalCredits = sumCredits(passed);

  // -------------------------
  // 自由選修學分（紫荊定義）
  // = 非通識、非共同必修、非被專業註記計入的剩下全部
  // -------------------------
  const freeCredits = Math.max(0, totalCredits - geCredits - requiredCredits - specCredits);

  // -------------------------
  // 自由選修門檻（依年度/組別）
  // 你也可以放到 rules.json：rule.freeElectiveCreditsRequired
  // -------------------------
  const fallbackFreeReq = (() => {
    if (year === "113") return 48;
    if (year === "114" && track === "A") return 16;
    if (year === "114" && track === "B") {
      // 乙組擇一：有選註記 => 不用自由選修；沒選註記 => 自由選修 20
      return specializationId ? 0 : 20;
    }
    return 0;
  })();

  const freeRequired = Number(rule.freeElectiveCreditsRequired) || fallbackFreeReq;

  return {
    total: {
      current: totalCredits,
      required: rule.totalCredits,
      ok: totalCredits >= rule.totalCredits
    },
    ge: {
      current: geCredits,
      required: rule.geCredits,
      ok: geCredits >= rule.geCredits
    },
    required: {
      done: requiredDone,
      total: Object.keys(requiredMap).length,
      missing: requiredMissing
    },
    specialization,
    free: {
      current: freeCredits,
      required: freeRequired,
      ok: freeCredits >= freeRequired
    },
    trackResult: null
  };
}
