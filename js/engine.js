// js/engine.js
import { normalizeCourseName } from "./normalize.js";

export function runAudit(courses, rules, year, track = null, specializationId = null) {
  const rule = rules[year];
  if (!rule) throw new Error("找不到規定版本：" + year);

  const passed = courses.filter(c => c.status === "passed");

  const sumCredits = (arr) => arr.reduce((s, c) => s + (c.credits || 0), 0);

  const totalCredits = sumCredits(passed);
  const geCredits = sumCredits(passed.filter(c => c.category === "ge"));

  // =============== 共同必修（正規化後 exact match） ===============
  const requiredList = rule.requiredCourses || [];

  const takenNameSet = new Set(
    passed.map(c => normalizeCourseName(c.name)).filter(Boolean)
  );

  const requiredPairs = requiredList.map(raw => ({
    raw,
    norm: normalizeCourseName(raw)
  }));

  const missingRequired = requiredPairs
    .filter(r => !takenNameSet.has(r.norm))
    .map(r => r.raw);

  const requiredDone = requiredList.length - missingRequired.length;

  // =============== 專業註記/輔系（依 specializationId 計算） ===============
  let specialization = null;

  // rules 內建的 specializations（你剛剛 Step 1 加的）
  const specMap = rule.specializations || {};

  if (specializationId) {
    const spec = specMap[specializationId];
    if (!spec) {
      specialization = {
        id: specializationId,
        name: "(找不到此專業註記/輔系規則)",
        ok: false,
        error: `rules.${year}.specializations 找不到 id：${specializationId}`
      };
    } else {
      const prereq = spec.prereqCourses || [];
      const req = spec.requiredCourses || [];
      const elec = spec.electiveCourses || [];
      const minCredits = spec.minCredits ?? 20;

      const norm = (s) => normalizeCourseName(s);

      const prereqNorm = prereq.map(norm);
      const reqNorm = req.map(norm);
      const elecNorm = elec.map(norm);

      const prereqMissing = prereq.filter((name, i) => !takenNameSet.has(prereqNorm[i]));
      const requiredMissing = req.filter((name, i) => !takenNameSet.has(reqNorm[i]));

      // 計入該輔系/註記的課：先修 + 必修 +（如果有列）選修
      const allowedSet = new Set([...prereqNorm, ...reqNorm, ...elecNorm].filter(Boolean));

      const takenInSpec = passed.filter(c => {
        const n = norm(c.name);
        return allowedSet.has(n);
      });

      const specCredits = sumCredits(takenInSpec);

      const prereqOk = prereqMissing.length === 0;
      const requiredOk = requiredMissing.length === 0;
      const creditsOk = specCredits >= minCredits;

      // 規則：先修與必修要全完成；學分不足可用（規則表列出的）選修補
      // （對於你沒有列 electiveCourses 的系：通常必修/先修本身已>=20，不會卡）
      const ok = prereqOk && requiredOk && creditsOk;

      specialization = {
        id: specializationId,
        name: spec.name,
        minCredits,
        credits: {
          current: specCredits,
          required: minCredits,
          remaining: Math.max(0, minCredits - specCredits),
          ok: creditsOk
        },
        prereq: {
          total: prereq.length,
          missing: prereqMissing,
          ok: prereqOk
        },
        required: {
          total: req.length,
          missing: requiredMissing,
          ok: requiredOk
        },
        ok
      };
    }
  }

  // =============== 114 乙組（保留你原本的示意） ===============
  let trackResult = null;
  if (year === "114" && track === "B") {
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
      total: requiredList.length,
      missing: missingRequired
    },
    specialization,
    trackResult
  };
}
