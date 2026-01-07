// js/engine.js
export function runAudit(courses, rules, year, track=null){
  const rule = rules[year];
  if (!rule) throw new Error("找不到規定版本：" + year);

  const passed = courses.filter(c => c.status === "passed");

  const sumCredits = arr => arr.reduce((s,c)=>s+(c.credits||0),0);

  const totalCredits = sumCredits(passed);
  const geCredits = sumCredits(passed.filter(c => c.category === "ge"));

  // 共同必修
  const requiredList = rule.requiredCourses || [];
  const takenNames = passed.map(c => c.name);

  const missingRequired = requiredList.filter(r => !takenNames.includes(r));
  const requiredDone = requiredList.length - missingRequired.length;

  // 專業註記（113）
  let specialization = null;
  if (year === "113"){
    const specCredits = sumCredits(
      passed.filter(c => c.category === "specialization")
    );
    specialization = {
      current: specCredits,
      required: rule.specialization.minCredits,
      ok: specCredits >= rule.specialization.minCredits
    };
  }

  // 114 乙組（示意）
  let trackResult = null;
  if (year === "114" && track === "B"){
    const majorCredits = sumCredits(passed.filter(c => c.category === "major"));
    const minorCredits = sumCredits(passed.filter(c => c.category === "minor"));
    trackResult = {
      major: { current: majorCredits, required: rule.tracks.B.majorCredits },
      minor: { current: minorCredits, required: rule.tracks.B.minorOrProgramCredits }
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
