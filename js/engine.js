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
  // 建立學分查表（由 JSON 規則得來）
  // - 共同必修：rule.requiredCourses = {課名:學分}
  // - 專業註記：rules.specializations[id].prerequisites/required/electives = {課名:學分}
  // =======================
  function buildCreditLookup(){
    const map = new Map(); // normName -> credits

    // 1) 共同必修
    const requiredMap = rule.requiredCourses || {};
    if (requiredMap && typeof requiredMap === "object" && !Array.isArray(requiredMap)){
      for (const [name, cr] of Object.entries(requiredMap)){
        const n = norm(name);
        const v = Number(cr);
        if (n && Number.isFinite(v)) map.set(n, v);
      }
    }

    // 2) 專業註記（只針對目前選的 specializationId 建表）
    if (specializationId){
      const spec = (rules?.specializations || {})[specializationId] || null;
      if (spec){
        const addObj = (obj) => {
          if (!obj || typeof obj !== "object") return;
          for (const [name, cr] of Object.entries(obj)){
            const n = norm(name);
            const v = Number(cr);
            if (n && Number.isFinite(v)) map.set(n, v);
          }
        };
        addObj(spec.prerequisites);
        addObj(spec.required);
        addObj(spec.electives);
      }
    }

    return map;
  }

  const creditLookup = buildCreditLookup();

  // =======================
  // 回填 passed 的 credits（嚴謹）
  // 規則：
  // - 若使用者本來就有填 credits：用使用者的
  // - 通識：固定 2
  // - 其他：必須能在 creditLookup 找到，否則 throw（避免錯算）
  // =======================
  const passed = passedRaw.map((c) => {
    const userCr = Number(c.credits);
    const hasUserCredits = Number.isFinite(userCr) && userCr > 0;

    if (hasUserCredits) return { ...c, credits: userCr };

    // 通識固定 2
    if (c.category === "ge") return { ...c, credits: 2 };

    // 其他課：必須查得到
    const n = norm(c.name);
    if (n && creditLookup.has(n)){
      return { ...c, credits: creditLookup.get(n) };
    }

    throw new Error(
      `無法從資料庫判斷學分：${c.name}\n` +
      `可能原因：課名與規則表不完全一致（全形/半形、空格、括號、（一）（二）等）\n` +
      `請修正輸入課名或更新 rules.json 的課名。`
    );
  });

  // =======================
  // 總學分 / 通識學分（回填後）
  // =======================
  const totalCredits = sumCredits(passed);
  const geCredits = sumCredits(passed.filter(c => c.category === "ge"));

  // =======================
  // 共同必修檢核（normalize 後比對）
  // requiredCourses 期望格式：{課名:學分}
  // =======================
  const requiredMap = (rule.requiredCourses && typeof rule.requiredCourses === "object" && !Array.isArray(rule.requiredCourses))
    ? rule.requiredCourses
    : {};

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
  // 專業註記檢核（選到才算）
  // spec 格式：prerequisites/required/electives 都是 {課名:學分}
  // =======================
  let specialization = null;
  const specMap = rules?.specializations || {};

  if (specializationId){
    const spec = specMap[specializationId];
    if (!spec){
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

  // =======================
  // ✅ 自由選修（新增）
  // 定義：不是通識、不是共同必修的課都算自由選修
  // 門檻：
  // - 113：48
  // - 114甲：16
  // - 114乙：若已選「輔專業註記/學程」(specializationId 有值) => 自由選修門檻視為 0
  //         若未選 => 自由選修 20
  // =======================
  const freeCourses = passed.filter(c =>
    c.category !== "ge" && c.category !== "required"
  );
  const freeCredits = sumCredits(freeCourses);

  let freeRequired = 0;
  if (year === "113"){
    freeRequired = 48;
  } else if (year === "114"){
    if (track === "A") freeRequired = 16;
    else if (track === "B") freeRequired = specializationId ? 0 : 20;
    else freeRequired = 0;
  }

  const free = {
    current: freeCredits,
    required: freeRequired,
    ok: freeRequired > 0 ? (freeCredits >= freeRequired) : true
  };

  // =======================
  // 114 乙組（保留：示意）
  // 注意：major/minor category 你目前 parser 還沒做 mapping，所以這塊可能一直是 0
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
    free,            // ✅ 新增：自由選修
    trackResult
  };
}
