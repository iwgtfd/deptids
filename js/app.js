// js/app.js  (Strict input mode, ES Module)
import { runAudit } from "./engine.js";
import { parseTranscriptToCourses } from "./parser.js";

/* ----------------------------
 * Utils
 * ---------------------------- */
function $(id){ return document.getElementById(id); }

function getRuleYear(){
  return document.querySelector('input[name="ruleYear"]:checked')?.value || "113";
}

function getTrack114(){
  return document.querySelector('input[name="track114"]:checked')?.value || null;
}

function setTrackEnabled(enabled){
  const a = $("trackA");
  const b = $("trackB");
  if (!a || !b) return;

  a.disabled = !enabled;
  b.disabled = !enabled;

  if (!enabled){
    a.checked = false;
    b.checked = false;
  } else {
    if (!a.checked && !b.checked) b.checked = true;
  }
}

function clamp01(x){
  return Math.max(0, Math.min(1, x));
}

function setProgress(barId, metaId, current, required){
  const ratio = required > 0 ? clamp01(current / required) : 0;
  const bar = $(barId);
  const meta = $(metaId);
  if (bar) bar.style.width = `${Math.round(ratio * 100)}%`;
  if (meta) meta.textContent = `${current} / ${required}`;
}

/* ----------------------------
 * 專業註記選單（全域 specializations）
 * ---------------------------- */
function populateSpecSelect(rules){
  const select = $("specSelect");
  if (!select) return;

  const prev = select.value;
  select.innerHTML = "";

  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = "（未選擇專業註記）";
  select.appendChild(opt0);

  const specMap = rules?.specializations || {};
  Object.entries(specMap).forEach(([id, spec]) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = spec?.name || id;
    select.appendChild(opt);
  });

  if (prev && specMap[prev]) select.value = prev;
}

/* ----------------------------
 * GitHub Pages-safe loader
 * ---------------------------- */
async function loadRules(){
  const base = new URL(".", window.location.href);
  const url = new URL("data/rules.json", base);

  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error("rules.json 載入失敗：" + res.status);
  return await res.json();
}

/* ----------------------------
 * Report builder
 * ---------------------------- */
function buildReportText(year, track, audit){
  const lines = [];
  const missingReq = audit?.required?.missing || [];

  lines.push(
    `🎓 畢業資格審核｜規定：${year}` +
    (year === "114" ? `｜${track === "A" ? "甲組" : "乙組"}` : "")
  );
  lines.push("------------------------------------------------");

  lines.push(`📌 總學分：${audit.total.current}/${audit.total.required}（尚差 ${Math.max(0, audit.total.required - audit.total.current)}）`);
  lines.push(`📌 通識：${audit.ge.current}/${audit.ge.required}（尚差 ${Math.max(0, audit.ge.required - audit.ge.current)}）`);

  lines.push(`📌 共同必修：${audit.required.done}/${audit.required.total}`);
  if (missingReq.length){
    lines.push("❗ 共同必修缺項：");
    missingReq.forEach(c => lines.push(`- ${c}`));
  } else {
    lines.push("✅ 共同必修已完成");
  }

  // ✅ 自由選修（紫荊核心）
  if (audit.free){
    lines.push("");
    lines.push(`📌 自由選修：${audit.free.current}/${audit.free.required}（尚差 ${Math.max(0, audit.free.required - audit.free.current)}）`);
    lines.push(audit.free.ok ? "✅ 自由選修已達標" : "⚠️ 自由選修尚未達標");
  }

  // 專業註記
  if (audit.specialization){
    const s = audit.specialization;
    lines.push("");
    lines.push(`📌 專業註記：${s.name}`);

    if (s.prereq && !s.prereq.ok){
      lines.push("❗ 先修尚缺：");
      (s.prereq.missing || []).forEach(c => lines.push(`- ${c}`));
    } else if (s.prereq?.ok){
      lines.push("✅ 先修已完成");
    }

    if (s.required && !s.required.ok){
      lines.push("❗ 必修尚缺：");
      (s.required.missing || []).forEach(c => lines.push(`- ${c}`));
    } else if (s.required?.ok){
      lines.push("✅ 必修已完成");
    }

    lines.push(`📌 註記學分：${s.credits.current}/${s.credits.required}（尚差 ${s.credits.remaining}）`);
    lines.push(s.ok ? "🎉 已達成專業註記門檻" : "⚠️ 尚未達成專業註記門檻");
  } else {
    // 114乙組：若不選註記，表示你走「自由選修20」那條
    if (year === "114" && track === "B"){
      lines.push("");
      lines.push("ℹ️ 你目前未選專業註記：系統將以「乙組自由選修 20 學分」路線檢核。");
    }
  }

  lines.push("");
  lines.push("💡 下一步建議：");
  if (missingReq.length) lines.push("1) 先補共同必修缺項（最容易卡畢業）。");
  if (!audit.free?.ok) lines.push("2) 再補自由選修學分缺口（任何非通識/非共同必修/非被註記計入的課都算）。");
  if (audit.specialization && !audit.specialization.ok) lines.push("3) 專業註記用『先修→必修→補學分』順序。");

  return lines.join("\n");
}

/* ----------------------------
 * UI update
 * ---------------------------- */
function applyAuditToUI(year, track, audit){
  $("kpiCredits").textContent = String(audit.total.current ?? "—");
  $("kpiReq").textContent = `${audit.required.done}/${audit.required.total}`;

  // KPI：顯示自由選修進度更直覺（你也可改回註記）
  if ($("kpiSpec")){
    $("kpiSpec").textContent = audit.free ? `${audit.free.current}/${audit.free.required}` : "—";
  }

  setProgress("barTotal", "metaTotal", audit.total.current, audit.total.required);
  setProgress("barGE", "metaGE", audit.ge.current, audit.ge.required);
  setProgress("barFree", "metaFree", audit.free.current, audit.free.required);

  const reqRatio = audit.required.total > 0 ? clamp01(audit.required.done / audit.required.total) : 0;
  $("barReq").style.width = `${Math.round(reqRatio * 100)}%`;
  $("metaReq").textContent = `${audit.required.done} / ${audit.required.total}`;

  $("reportText").textContent = buildReportText(year, track, audit);
}

/* ----------------------------
 * Strict parse（✅ 正確三參數）
 * ---------------------------- */
function strictParseFromTextarea(year, rules){
  const rawText = $("txtRaw")?.value || "";
  if (rawText.trim().length < 5){
    return { ok: false, message: "請貼上課程清單（課程代碼/課程名稱[/學分]）" };
  }

  const parsed = parseTranscriptToCourses(rawText, rules, year);
  const errors = parsed?.errors || [];

  if (errors.length){
    const preview = errors.slice(0, 6)
      .map(e => `第 ${e.lineNo} 行：${e.reason}\n${e.line}`)
      .join("\n\n");

    return {
      ok: false,
      message:
        `輸入格式錯誤（共 ${errors.length} 行）：\n\n${preview}\n\n` +
        `👉 提醒：非通識、非共同必修、且資料庫沒有的課，請補第三欄 /學分（例：123456/資料結構/3）`
    };
  }

  const courses = parsed?.courses || [];
  if (!courses.length){
    return { ok: false, message: "沒有解析到課程，請確認每行格式：課程代碼/課程名稱[/學分]" };
  }

  return { ok: true, courses };
}

/* ----------------------------
 * Init
 * ---------------------------- */
async function init(){
  let rules;
  try{
    rules = await loadRules();
  } catch (e){
    console.error(e);
    alert("rules.json 載入失敗（請確認 data/rules.json 路徑與大小寫）");
    return;
  }

  populateSpecSelect(rules);

  // Track enable/disable
  setTrackEnabled(getRuleYear() === "114");
  document.querySelectorAll('input[name="ruleYear"]').forEach(el => {
    el.addEventListener("change", () => {
      setTrackEnabled(getRuleYear() === "114");
    });
  });

  // Run
  $("btnRun")?.addEventListener("click", () => {
    const year = getRuleYear();
    const track = year === "114" ? (getTrack114() || "B") : null;
    const specializationId = $("specSelect")?.value || null;

    const parsed = strictParseFromTextarea(year, rules);
    if (!parsed.ok){
      alert(parsed.message);
      return;
    }

    const audit = runAudit(parsed.courses, rules, year, track, specializationId);
    applyAuditToUI(year, track, audit);
  });

  // Copy
  $("btnCopy")?.addEventListener("click", async () => {
    const text = $("reportText")?.textContent || "";
    try{
      await navigator.clipboard.writeText(text);
      alert("已複製報告 ✅");
    } catch {
      alert("無法自動複製，請手動全選複製。");
    }
  });
}

document.addEventListener("DOMContentLoaded", init);
