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
 * 專業註記下拉選單（由 rules.json 產生）
 * ---------------------------- */
function populateSpecSelect(rules, year){
  const select = $("specSelect");
  if (!select) return;

  const prev = select.value;

  select.innerHTML = "";
  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = "（未選擇專業註記）";
  select.appendChild(opt0);

  const specMap = rules?.[year]?.specializations;
  if (!specMap) return;

  Object.entries(specMap).forEach(([id, spec]) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = spec.name || id;
    select.appendChild(opt);
  });

  if (prev && specMap[prev]){
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
 * 報告文字生成（顧問版）
 * ---------------------------- */
function buildReportText(year, track, audit){
  const lines = [];

  lines.push(
    `🎓 畢業資格審核（Rule Engine）｜規定：${year}` +
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
    lines.push(`📌 專業註記（${s.name}）`);
    lines.push("（依該系輔系課程規定檢核，僅作為紫荊不分系專業註記進度參考）");

    if (s.prereq){
      if (s.prereq.missing.length){
        lines.push(`❗ 先修課程尚缺 ${s.prereq.missing.length} 門：`);
        s.prereq.missing.forEach(c => lines.push(`- ${c}`));
      } else {
        lines.push("✅ 先修課程已完成");
      }
    }

    if (s.required){
      if (s.required.missing.length){
        lines.push(`❗ 必修課程尚缺 ${s.required.missing.length} 門：`);
        s.required.missing.forEach(c => lines.push(`- ${c}`));
      } else {
        lines.push("✅ 必修課程已完成");
      }
    }

    lines.push(
      `📌 已修專業註記學分：${s.credits.current}/${s.credits.required}` +
      `（尚差 ${Math.max(0, s.credits.required - s.credits.current)}）`
    );

    lines.push(
      s.ok
        ? "🎉 已達成專業註記門檻"
        : "⚠️ 尚未達成專業註記門檻"
    );
  }

  if (year === "114" && track === "B" && audit.trackResult){
    const m = audit.trackResult.major;
    const n = audit.trackResult.minor;
    lines.push("");
    lines.push("📌 114 乙組學分門檻");
    lines.push(`- 主專業註記：${m.current}/${m.required}`);
    lines.push(`- 輔專業／學程：${n.current}/${n.required}`);
  }

  lines.push("");
  lines.push("💡 修課建議：");
  lines.push("1. 優先補齊共同必修，避免後續卡修。");
  if (audit.specialization && !audit.specialization.ok){
    lines.push("2. 專業註記建議先修必修課程，再補足學分。");
  }
  lines.push("3. 同步規劃通識與自由選修，讓大三修課更彈性。");

  return lines.join("\n");
}

/* ----------------------------
 * UI update
 * ---------------------------- */
function applyAuditToUI(year, track, audit){
  $("kpiCredits").textContent = `${audit.total.current}`;
  $("kpiReq").textContent = `${audit.required.done}/${audit.required.total}`;

  if (audit.specialization){
    const s = audit.specialization;
    $("kpiSpec").textContent = `${s.credits.current} / ${s.credits.required}`;
  } else {
    $("kpiSpec").textContent = "未選擇";
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
 * Copy report
 * ---------------------------- */
function copyReport(){
  const text = $("reportText")?.textContent || "";
  navigator.clipboard.writeText(text).then(
    () => alert("已複製報告到剪貼簿 ✅"),
    () => alert("無法自動複製，請手動複製。")
  );
}

/* ----------------------------
 * Strict parse + validate
 * ---------------------------- */
function strictParseFromTextarea(year, rules){
  const rawText = $("txtRaw")?.value || "";
  if (rawText.trim().length < 5){
    return { ok:false, message:"請貼上課程清單（格式：課碼/課名）" };
  }

  const parsed = parseTranscriptToCourses(rawText, rules[year]);
  if (parsed.errors?.length){
    return {
      ok:false,
      message:
        `輸入格式錯誤（${parsed.errors.length} 行）：\n` +
        parsed.errors.slice(0,5).map(e => `第 ${e.lineNo} 行：${e.line}`).join("\n")
    };
  }

  if (!parsed.courses?.length){
    return { ok:false, message:"未解析到任何課程" };
  }

  return { ok:true, courses: parsed.courses };
}

/* ----------------------------
 * Init
 * ---------------------------- */
async function init(){
  setTrackEnabled(getRuleYear() === "114");

  let rules = null;
  try{
    rules = await loadRules();
  } catch(e){
    alert("無法載入規則檔 rules.json");
    return;
  }

  populateSpecSelect(rules, getRuleYear());

  document.querySelectorAll('input[name="ruleYear"]').forEach(el => {
    el.addEventListener("change", () => {
      const year = getRuleYear();
      setTrackEnabled(year === "114");
      populateSpecSelect(rules, year);
    });
  });

  $("btnRun")?.addEventListener("click", () => {
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

  $("btnCopy")?.addEventListener("click", copyReport);
}

document.addEventListener("DOMContentLoaded", init);
