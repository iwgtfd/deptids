// js/engine.js

import { normalizeCourseName } from "./normalize.js";

export function runAudit(
  courses,
  rules,
  year,
  track = null,
  specializationId = null
){
  const rule = rules?.[year];
  if (!rule) throw new Error("找不到規定版本：" + year);

  const norm = s => normalizeCourseName(s);
  const passed = (courses || []).filter(c => c.status === "passed");

  const sumCredits = arr =>
    arr.reduce((s, c) => s + (Number(c.credits) || 0), 0);

  /* =========================
   * 總學分 / 通識
   * ========================= */
  const totalCredits = sumCredits(passed);
  const geCredits = sumCredits(passed.filter(c => c.category === "ge"));

  /* =========================
   * 共同必修（學分制）
   * rule.requiredCourses = { 課名: 學分 }
   * ========================= */
  const requiredMap = rule.requiredCourses || {};

  const takenNameSet = new Set(
    passed.map(c => norm(c.name)).filter(Boolean)
  );

  const requiredEntries = Object.entries(requiredMap).map(([name, cr]) => ({
    raw: name,
    norm: norm(name),
    credits: Number(cr) || 0
  }));

  const missingRequired = requiredEntries
    .filter(r => !takenNameSet.has(r.norm))
    .map(r => r.raw);

  const requiredCreditsCurrent = requiredEntries
    .filter(r => takenNameSet.has(r.norm))
    .reduce((s, r) => s + r.credits, 0);

  const requiredCreditsRequired = requiredEntries
    .reduce((s, r) => s + r.credits, 0);

  /* =========================
   * 專業註記（學分制）
   * ========================= */
  let specialization = null;

  if (specializationId){
    const spec = rules.specializations?.[specializationId];
    if (!spec) throw new Error("找不到專業註記：" + specializationId);

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
      [...prereqNames, ...reqNames, ...elecNames].map(norm)
    );

    const takenInSpec = passed.filter(c =>
      allowedSet.has(norm(c.name))
    );

    const specCredits = sumCredits(takenInSpec);

    specialization = {
      id: specializationId,
      name: spec.name || specializationId,
      credits: {
        current: specCredits,
        required: minCredits,
        remaining: Math.max(0, minCredits - specCredits),
        ok: specCredits >= minCredits
      },
      prereq: {
        missing: prereqMissing,
        ok: prereqMissing.length === 0
      },
      required: {
        missing: requiredMissing,
        ok: requiredMissing.length === 0
      },
      ok:
        prereqMissing.length === 0 &&
        requiredMissing.length === 0 &&
        specCredits >= minCredits
    };
  }

  /* =========================
   * 114 乙組（示意）
   * ========================= */
  let trackResult = null;
  if (year === "114" && track === "B"){
    trackResult = {
      major: {
        current: sumCredits(passed.filter(c => c.category === "major")),
        required: rule.tracks?.B?.majorCredits ?? 0
      },
      minor: {
        current: sumCredits(passed.filter(c => c.category === "minor")),
        required: rule.tracks?.B?.minorOrProgramCredits ?? 0
      }
    };
  }

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
      credits: {
        current: requiredCreditsCurrent,
        required: requiredCreditsRequired,
        remaining:
          Math.max(0, requiredCreditsRequired - requiredCreditsCurrent),
        ok: requiredCreditsCurrent >= requiredCreditsRequired
      },
      missing: missingRequired
    },
    specialization,
    trackResult
  };
}
