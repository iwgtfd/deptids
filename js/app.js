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
    // 預設乙組（demo 友善，你也可改成不預設）
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
function populateSpecSelect(rules, year){
  const select = document.getElementById("specSelect");
  if (!select) return;

  // 記住目前選擇（切換 year 時保留用）
  const prev = select.value;

  // 清空選單
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

  // 若切換 year 前有選、且新 year 仍存在該 id，就保留
  if (prev && specMap[prev]){
    select.value = prev;
  }
}

/* ----------------------------
 * GitHub Pages-safe loader
 * ---------------------------- */
async function loadRules(){
  // ✅ 對 GitHub Pages 子路徑（/deptids/）最穩的寫法
  const base = new URL(".", window.location.href);
  const url = new URL("data/rules.json", base);

  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error("rules.json 載入失敗：" + res.status);
  return await res.json();
}

/* ----------------------------
 * Report builder (human-friendly but still structured)
 * ---------------------------- */
function buildReportText(year, track, audit){
  const lines = [];

  /* ===== Header ===== */
  lines.push(
    `🎓 畢業資格審核（Rule Engine）｜規定：${year}` +
    (year === "114" ? `｜${track === "A" ? "甲組" : "乙組"}` : "")
  );
  lines.push("------------------------------------------------");

  /* ===== Overall credits ===== */
  lines.push(
    `📌 總學分：${audit.total.current}/${audit.total.required}` +
    `（尚差 ${Math.max(0, audit.total.required - audit.total.current)}）`
  );

  lines.push(
    `📌 通識：${audit.ge.current}/${audit.ge.required}` +
    `（尚差 ${Math.max(0, audit.ge.required - audit.ge.current)}）`
  );

  /* ===== Required courses ===== */
  lines.push(
    `📌 共同必修：${audit.required.done}/${audit.required.total}`
  );

  if (audit.required.missing?.length){
    lines.push("❗ 共同必修缺項：");
    audit.required.missing.forEach(c => lines.push(`- ${c}`));
  } else {
    lines.push("✅ 共同必修已全數完成");
  }

  /* ===== Specialization (專業註記) ===== */
  if (audit.specialization){
    const s = audit.specialization;

    lines.push("");
    lines.push(`📌 專業註記（${s.name}）`);
    lines.push("（依該系輔系課程規定檢核，僅作為紫荊不分系專業註記進度參考）");

    // 先修
    if (s.prereq){
      if (s.prereq.missing.length > 0){
        lines.push(
          `❗ 先修課程尚缺 ${s.prereq.missing.length} 門：`
        );
        s.prereq.missing.forEach(c => lines.push(`- ${c}`));
      } else {
        lines.push("✅ 先修課程已完成");
      }
    }

    // 必修
    if (s.required){
      if (s.required.missing.length > 0){
        lines.push(
          `❗ 必修課程尚缺 ${s.required.missing.length} 門：`
        );
        s.required.missing.forEach(c => lines.push(`- ${c}`));
      } else {
        lines.push("✅ 必修課程已完成");
      }
    }

    // Credits
    lines.push(
      `📌 已修專業註記學分：${s.credits.current} / ${s.credits.required}` +
      `（尚差 ${Math.max(0, s.credits.required - s.credits.current)}）`
    );

    lines.push(
      s.ok
        ? "🎉 已達成專業註記修課門檻"
        : "⚠️ 尚未達成專業註記修課門檻"
    );
  }

  /* ===== Track B (114) ===== */
  if (year === "114" && track === "B" && audit.trackResult){
    const m = audit.trackResult.major;
    const n = audit.trackResult.minor;

    lines.push("");
    lines.push("📌 114 乙組修業門檻（學分制）");

    lines.push(
      `- 主專業註記：${m.current}/${m.required}` +
      `（尚差 ${Math.max(0, m.required - m.current)}）`
    );

    lines.push(
      `- 輔專業／客製化學程：${n.current}/${n.required}` +
      `（尚差 ${Math.max(0, n.required - n.current)}）`
    );
  }

  /* ===== Advisor hints ===== */
  lines.push("");
  lines.push("💡 修課建議：");
  lines.push("1. 優先補齊共同必修，避免後續學期卡修。");
  if (audit.specialization && !audit.specialization.ok){
    lines.push("2. 專業註記建議以『必修 → 補足學分』為修課優先順序。");
  }
  lines.push("3. 可搭配通識與自由選修，同步補足總學分需求。");

  return lines.join("\n");
}

/* ----------------------------
 * UI update
 * ---------------------------- */
function applyAuditToUI(year, track, audit){
  // KPI
  $("kpiCredits").textContent = `${audit.total.current}`;
  $("kpiReq").textContent = `${audit.required.done}/${audit.required.total}`;

  // 專業註記 KPI：目前嚴謹模式下沒做註記 mapping，先顯示 —
  if (year === "114" && track === "B" && audit.trackResult){
    $("kpiSpec").textContent = `主 ${audit.trackResult.major.current}/${audit.trackResult.major.required}、輔 ${audit.trackResult.minor.current}/${audit.trackResult.minor.required}`;
  } else {
    $("kpiSpec").textContent = "—";
  }

  // Progress bars
  setProgress("barTotal", "metaTotal", audit.total.current, audit.total.required);
  setProgress("barGE", "metaGE", audit.ge.current, audit.ge.required);

  const reqRatio = audit.required.total > 0 ? clamp01(audit.required.done / audit.required.total) : 0;
  $("barReq").style.width = `${Math.round(reqRatio * 100)}%`;
  $("metaReq").textContent = `${audit.required.done} / ${audit.required.total}`;

  // Report
  $("reportText").textContent = buildReportText(year, track, audit);
}

/* ----------------------------
 * Copy report
 * ---------------------------- */
function copyReport(){
  const text = $("reportText")?.textContent || "";
  navigator.clipboard.writeText(text).then(() => {
    alert("已複製報告到剪貼簿 ✅");
  }).catch(() => {
    alert("無法自動複製，請手動全選複製。");
  });
}

/* ----------------------------
 * Strict parse + validate
 * ---------------------------- */
function strictParseFromTextarea(year, rules){
  const rawText = $("txtRaw")?.value || "";
  if (rawText.trim().length < 5){
    return {
      ok: false,
      message: "請貼上課程清單，格式：課程代碼/課程名稱（可加 /學分）"
    };
  }

  const parsed = parseTranscriptToCourses(rawText, rules[year]);
  const courses = parsed.courses || [];
  const errors = parsed.errors || [];

  if (errors.length > 0){
    const preview = errors.slice(0, 6)
      .map(e => `第 ${e.lineNo} 行：${e.reason}\n  ${e.line}`)
      .join("\n\n");

    return {
      ok: false,
      message:
        `輸入格式有誤：共 ${errors.length} 行不符合格式。\n\n` +
        `請用「課程代碼/課程名稱」(可加 /學分)\n\n` +
        `前幾筆錯誤：\n${preview}\n\n` +
        `（已停止計算，請修正後再產生審核結果）`
    };
  }

  if (courses.length === 0){
    return {
      ok: false,
      message: "未解析到任何課程。請確認格式為：課程代碼/課程名稱（可加 /學分）"
    };
  }

  return { ok: true, courses };
}

/* ----------------------------
 * Init
 * ---------------------------- */
async function init(){
  // Track enable/disable
  setTrackEnabled(getRuleYear() === "114");
  document.querySelectorAll('input[name="ruleYear"]').forEach(el => {
    el.addEventListener("change", () => {
      const year = getRuleYear();
      setTrackEnabled(year === "114");
    });
  });

  // Load rules
  let rules = null;
  try{
    rules = await loadRules();
  } catch (e){
    console.error(e);
    alert("無法載入 data/rules.json（請確認檔案路徑與大小寫）");
    return;
  }

  // Bind run
  $("btnRun")?.addEventListener("click", () => {
    const year = getRuleYear();
    const track = (year === "114") ? (getTrack114() || "B") : null;
    const specializationId =
    document.getElementById("specSelect")?.value || null;

    // Strict parse (no fallback)
    const parsed = strictParseFromTextarea(year, rules);
    if (!parsed.ok){
      alert(parsed.message);
      return;
    }

    // Run audit
    const audit = runAudit(
  parsed.courses,
  rules,
  year,
  track,
  specializationId
);

    // Update UI
    applyAuditToUI(year, track, audit);
  });

  // Bind copy
  $("btnCopy")?.addEventListener("click", copyReport);
}

document.addEventListener("DOMContentLoaded", init);
