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
 * 專業註記選單
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

  const specMap = rules.specializations || {};
  Object.entries(specMap).forEach(([id, spec]) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = spec.name || id;
    select.appendChild(opt);
  });

  if (prev && specMap[prev]) {
    select.value = prev;
  }
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

  lines.push(
    `🎓 畢業資格審核｜規定：${year}` +
    (year === "114" ? `｜${track === "A" ? "甲組" : "乙組"}` : "")
  );
  lines.push("------------------------------------------------");

  lines.push(
    `📌 總學分：${audit.total.current}/${audit.total.required}` +
    `（尚差 ${Math.max(0, audit.total.required - audit.total.current)}）`
  );

  lines.push(
    `📌 通識：${audit.ge.current}/${audit.ge.required}` +
    `（尚差 ${Math.max(0, audit.ge.required - audit.ge.current)}）`
  );

  lines.push(`📌 共同必修：${audit.required.done}/${audit.required.total}`);
  if (audit.required.missing.length){
    lines.push("❗ 共同必修缺項：");
    audit.required.missing.forEach(c => lines.push(`- ${c}`));
  } else {
    lines.push("✅ 共同必修已完成");
  }

  if (audit.specialization){
    const s = audit.specialization;

    lines.push("");
    lines.push(`📌 專業註記：${s.name}`);

    if (s.prereq && !s.prereq.ok){
      lines.push("❗ 先修尚缺：");
      s.prereq.missing.forEach(c => lines.push(`- ${c}`));
    }

    if (s.required && !s.required.ok){
      lines.push("❗ 必修尚缺：");
      s.required.missing.forEach(c => lines.push(`- ${c}`));
    }

    lines.push(
      `📌 專業註記學分：${s.credits.current}/${s.credits.required}` +
      `（尚差 ${s.credits.remaining}）`
    );

    lines.push(s.ok ? "🎉 已達成專業註記門檻" : "⚠️ 尚未達成專業註記門檻");
  }

  if (year === "114" && track === "B" && audit.trackResult){
    const m = audit.trackResult.major;
    const n = audit.trackResult.minor;

    lines.push("");
    lines.push("📌 114 乙組學分門檻");
    lines.push(`- 主專業註記：${m.current}/${m.required}`);
    lines.push(`- 輔專業／學程：${n.current}/${n.required}`);
  }

 /* ===== Next-term suggestions ===== */
  lines.push("");
  lines.push("💡 建議：");
  lines.push("");
  lines.push("🧭 下一學期修課建議（優先順序）");

  // 1️⃣ 共同必修
  if (audit.required.missing.length > 0){
    lines.push("1️⃣ 優先補齊共同必修：");
    audit.required.missing.slice(0, 3).forEach(c => {
      lines.push(`- ${c}`);
    });
  }

  // 2️⃣ 專業註記
  if (audit.specialization){
    const s = audit.specialization;

    if (s.prereq && s.prereq.missing.length > 0){
      lines.push("2️⃣ 專業註記先修課程：");
      s.prereq.missing.slice(0, 3).forEach(c => {
        lines.push(`- ${c}`);
      });
    } else if (s.required && s.required.missing.length > 0){
      lines.push("2️⃣ 專業註記必修課程：");
      s.required.missing.slice(0, 3).forEach(c => {
        lines.push(`- ${c}`);
      });
    }
  }

  // 3️⃣ 學分策略
  if (!audit.total.ok){
    lines.push("3️⃣ 視課表空間補通識或自由選修，以補足總學分。");
  }

  return lines.join("\n");
}

/* ----------------------------
 * UI update
 * ---------------------------- */
function applyAuditToUI(year, track, audit){
  $("kpiCredits").textContent = audit.total.current;
  $("kpiReq").textContent = `${audit.required.done}/${audit.required.total}`;

  if (audit.specialization){
    $("kpiSpec").textContent =
      `${audit.specialization.credits.current}/${audit.specialization.credits.required}`;
  } else {
    $("kpiSpec").textContent = "—";
  }

  setProgress("barTotal", "metaTotal", audit.total.current, audit.total.required);
  setProgress("barGE", "metaGE", audit.ge.current, audit.ge.required);

  const reqRatio = audit.required.total > 0
    ? clamp01(audit.required.done / audit.required.total)
    : 0;

  $("barReq").style.width = `${Math.round(reqRatio * 100)}%`;
  $("metaReq").textContent = `${audit.required.done} / ${audit.required.total}`;

  $("reportText").textContent = buildReportText(year, track, audit);
}

/* ----------------------------
 * Strict parse
 * ---------------------------- */
function strictParseFromTextarea(year, rules){
  const rawText = $("txtRaw")?.value || "";
  if (rawText.trim().length < 5){
    return { ok: false, message: "請貼上課程清單（課程代碼/課程名稱[/學分]）" };
  }

  const parsed = parseTranscriptToCourses(rawText, rules[year]);
  if (parsed.errors.length){
    const preview = parsed.errors.slice(0, 5)
      .map(e => `第 ${e.lineNo} 行：${e.reason}\n${e.line}`)
      .join("\n\n");

    return {
      ok: false,
      message: `輸入格式錯誤（共 ${parsed.errors.length} 行）：\n\n${preview}`
    };
  }

  return { ok: true, courses: parsed.courses };
}

/* ----------------------------
 * Init
 * ---------------------------- */
async function init(){
  let rules;
  try{
    rules = await loadRules();
  } catch (e){
    alert("rules.json 載入失敗");
    return;
  }

  populateSpecSelect(rules);
  setTrackEnabled(getRuleYear() === "114");

  document.querySelectorAll('input[name="ruleYear"]').forEach(el => {
    el.addEventListener("change", () => {
      const year = getRuleYear();
      setTrackEnabled(year === "114");
    });
  });

  $("btnRun").addEventListener("click", () => {
    const year = getRuleYear();
    const track = year === "114" ? (getTrack114() || "B") : null;
    const specializationId = $("specSelect")?.value || null;

    const parsed = strictParseFromTextarea(year, rules);
    if (!parsed.ok){
      alert(parsed.message);
      return;
    }

    const audit = runAudit(
      parsed.courses,
      rules,
      year,
      track,
      specializationId
    );

    applyAuditToUI(year, track, audit);
  });

  $("btnCopy").addEventListener("click", () => {
    navigator.clipboard.writeText($("reportText").textContent);
    alert("已複製報告");
  });
}

document.addEventListener("DOMContentLoaded", init);
