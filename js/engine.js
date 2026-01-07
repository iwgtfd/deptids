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

  const norm = (s) => normalizeCourseName(s);

  const passedRaw = (courses || []).filter(c => c.status === "passed");

  const sumCredits = (arr) =>
    arr.reduce((s, c) => s + (Number(c.credits) || 0), 0);

  // =======================
  // 共同必修：rule.requiredCourses 允許兩種格式
  // A) {課名: 學分}
  // B) ["課名", ...]（舊版沒有學分，先當 0 / 或你要 2 也行）
  // =======================
  function getRequiredMap(){
    const rc = rule.requiredCourses;
    if (rc && typeof rc === "object" && !Array.isArray(rc)) return rc;
    if (Array.isArray(rc)){
      const obj = {};
      rc.forEach(name => { obj[name] = 0; });
      return obj;
    }
    return {};
  }

  const requiredMap = getRequiredMap();

  // =======================
  // 專業註記課庫：rules.specializations[id]
  // spec.prerequisites/required/electives 都是 {課名: 學分}
  // =======================
  const specMap = rules?.specializations || {};
  const spec = specializationId ? (specMap[specializationId] || null) : null;

  // =======================
  // 建立「課名 -> 學分」查表（只用來回填缺失學分）
  // 注意：我們只保證 required + ge + spec 的準確學分
  // =======================
  function buildCreditLookup(){
    const map = new Map(); // normName -> credits

    // 1) 共同必修
    for (const [name, cr] of Object.entries(requiredMap)){
      const n = norm(name);
      const v = Number(cr);
      if (n && Number.isFinite(v) && v > 0) map.set(n, v);
    }

    // 2) 選定的專業註記
    if (spec){
      const addObj = (obj) => {
        for (const [name, cr] of Object.entries(obj || {})){
          const n = norm(name);
          const v = Number(cr);
          if (n && Number.isFinite(v) && v > 0) map.set(n, v);
        }
      };
      addObj(spec.prerequisites);
      addObj(spec.required);
      addObj(spec.electives);
    }

    return map;
  }

  const creditLookup = buildCreditLookup();

  // =======================
  // 回填 passed 的 credits（不再 throw，改成 warnings）
  // 優先順序：
  // 1) 使用者輸入 credits
  // 2) 通識 => 2
  // 3) 共同必修 / 專業註記課庫 => 查表
  // 4) 仍未知 => credits=0 且列入 warnings（不影響頁面運作）
  // =======================
  const warnings = {
    unknownCredits: [] // { name, code }
  };

  const passed = passedRaw.map((c) => {
    const userCr = Number(c.credits);
    const hasUserCredits = Number.isFinite(userCr) && userCr > 0;

    if (hasUserCredits) return { ...c, credits: userCr };

    // 通識固定 2（你規則已確定）
    if (c.category === "ge") return { ...c, credits: 2 };

    const n = norm(c.name);
    if (n && creditLookup.has(n)){
      return { ...c, credits: creditLookup.get(n) };
    }

    // 查不到：不炸掉，只警告，且不把它算進總學分（credits=0）
    warnings.unknownCredits.push({ name: c.name, code: c.code });
    return { ...c, credits: 0 };
  });

  // =======================
  // 總學分 / 通識學分（回填後）
  // 注意：unknownCredits 會以 0 計算（不會誤算）
  // =======================
  const totalCredits = sumCredits(passed);
  const geCredits = sumCredits(passed.filter(c => c.category === "ge"));

  // =======================
  // 共同必修檢核（normalize 後 exact match）
  // =======================
  const takenNameSet = new Set(passed.map(c => norm(c.name)).filter(Boolean));

  const requiredEntries = Object.keys(requiredMap).map(name => ({
    raw: name,
    norm: norm(name)
  }));

  const missingRequired = requiredEntries
    .filter(r => !takenNameSet.has(r.norm))
    .map(r => r.raw);

  const requiredDone = requiredEntries.length - missingRequired.length;

  // =======================
  // 專業註記檢核（選到才算）
  // =======================
  let specialization = null;

  if (specializationId){
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

      const allowedSet = new Set(
        [...prereqNames, ...reqNames, ...elecNames].map(norm).filter(Boolean)
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
  // 114 乙組（仍保留示意）
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
    trackResult,
    warnings
  };
}
