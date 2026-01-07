// js/engine.js
import { normalizeCourseName } from "./normalize.js";

export function runAudit(
  courses,
  rules,
  year,
  track = null,
  specializationId = null
){
  const rule = rules[year];
  if (!rule) throw new Error("找不到規定版本：" + year);

  const passed = courses.filter(c => c.status === "passed");
  const norm = s => normalizeCourseName(s);

  const sumCredits = arr => arr.reduce((s,c)=>s+(c.credits||0),0);

  const totalCredits = sumCredits(passed);
  const geCredits = sumCredits(passed.filter(c => c.category === "ge"));

  // =======================
  // 共同必修（requiredCourses：物件 課名->學分）
  // =======================
  const requiredMap = rule.requiredCourses || {}; // {name: credits}

  const takenNameSet = new Set(
    passed.map(c => norm(c.name)).filter(Boolean)
  );

  const requiredEntries = Object.keys(requiredMap).map(name => ({
    raw: name,
    norm: norm(name)
  }));

  const missingRequired = requiredEntries
    .filter(r => !takenNameSet.has(r.norm))
    .map(r => r.raw);

  const requiredDone = requiredEntries.length - missingRequired.length;

  // =======================
  // 專業註記（rules.specializations：全域）
  // spec 格式：prerequisites/required/electives 都是 物件 課名->學分
  // =======================
  let specialization = null;
  const specMap = rules.specializations || {};

  if (specializationId){
    const spec = specMap[specializationId];

    if (!spec){
      specialization = {
        id: specializationId,
        name: "(找不到此專業註記規則)",
        ok: false,
        error: `rules.specializations 找不到 id：${specializationId}`
      };
    } else {
      const prereqMap = spec.prerequisites || {};
      const reqMap = spec.required || {};
      const elecMap = spec.electives || {};
      const minCredits = spec.minCredits ?? 20;

      const prereqNames = Object.keys(prereqMap);
      const reqNames = Object.keys(reqMap);
      const elecNames = Object.keys(elecMap);

      const prereqMissing = prereqNames.filter(n => !takenNameSet.has(norm(n)));
      const requiredMissing = reqNames.filter(n => !takenNameSet.has(norm(n)));

      // 專業註記可計入的課：先修+必修+（若有列）選修
      const allowedSet = new Set(
        [...prereqNames, ...reqNames, ...elecNames]
          .map(norm)
          .filter(Boolean)
      );

      const takenInSpec = passed.filter(c => allowedSet.has(norm(c.name)));
      const specCredits = sumCredits(takenInSpec);

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
  }

  // =======================
  // 114 乙組（保留：學分門檻示意）
  // =======================
  let trackResult = null;
  if (year === "114" && track === "B"){
    const majorCredits = sumCredits(passed.filter(c => c.category === "major"));
    const minorCredits = sumCredits(passed.filter(c => c.category === "minor"));
    trackResult = {
      major: { current: majorCredits, required: rule.tracks?.B?.majorCredits ?? 0 },
      minor: { current: minorCredits, required: rule.tracks?.B?.minorOrProgramCredits ?? 0 }
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
      done: requiredDone,
      total: requiredEntries.length,
      missing: missingRequired
    },
    specialization,
    trackResult
  };
}
