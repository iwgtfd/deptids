// js/app.js  (ES Module)
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
    if (!a.checked && !b.checked) b.checked = true; // 預設乙組，demo 友善
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
 * GitHub Pages-safe loader
 * ---------------------------- */
async function loadRules(){
  const base = new URL(".", window.location.href);
  const url = new URL("data/rules.json", base);

  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error("rules.json 載入失敗：" + res.status);
  return await res.json();
}


function buildFakeCourses(year, track){
  if (year === "113"){
    return [
      // 通識（示意：10/28）
      { name: "通識課A", credits: 2, status: "passed", category: "ge" },
      { name: "通識課B", credits: 2, status: "passed", category: "ge" },
      { name: "通識課C", credits: 2, status: "passed", category: "ge" },
      { name: "通識課D", credits: 2, status: "passed", category: "ge" },
      { name: "通識課E", credits: 2, status: "passed", category: "ge" },

      // 共同必修（故意缺「永續能源與碳中和」「聯合國永續...」）
      { name: "中正講座-向典範學習", credits: 2, status: "passed", category: "required" },
      { name: "認識大學教育", credits: 2, status: "passed", category: "required" },
      { name: "運算思維與程式設計", credits: 2, status: "passed", category: "required" },
      { name: "紫荊學習規劃（一）", credits: 1, status: "passed", category: "required" },
      { name: "紫荊學習規劃（二）", credits: 1, status: "passed", category: "required" },
      { name: "英語閱讀與溝通", credits: 2, status: "passed", category: "required" },
      { name: "職涯探索", credits: 2, status: "passed", category: "required" },

      // 專業註記（示意：12/20）
      { name: "專業註記課1", credits: 3, status: "passed", category: "specialization" },
      { name: "專業註記課2", credits: 3, status: "passed", category: "specialization" },
      { name: "專業註記課3", credits: 3, status: "passed", category: "specialization" },
      { name: "專業註記課4", credits: 3, status: "passed", category: "specialization" },

      // 自由選修補總學分（示意）
      { name: "自由選修A", credits: 20, status: "passed", category: "free" },
      { name: "自由選修B", credits: 20, status: "passed", category: "free" },
      { name: "自由選修C", credits: 20, status: "passed", category: "free" }
    ];
  }

  // 114：demo 先跑乙組
  if (year === "114" && (track === "B" || !track)){
    return [
      // 通識（示意：8/28）
      { name: "通識課A", credits: 2, status: "passed", category: "ge" },
      { name: "通識課B", credits: 2, status: "passed", category: "ge" },
      { name: "通識課C", credits: 2, status: "passed", category: "ge" },
      { name: "通識課D", credits: 2, status: "passed", category: "ge" },

      // 共同必修（先放幾門，故意缺一些）
      { name: "運算思維與程式設計", credits: 2, status: "passed", category: "required" },
      { name: "統計學", credits: 2, status: "passed", category: "required" },
      { name: "人工智慧導論與應用", credits: 2, status: "passed", category: "required" },

      // 主專業（示意：28/44）
      { name: "主專業課1", credits: 3, status: "passed", category: "major" },
      { name: "主專業課2", credits: 3, status: "passed", category: "major" },
      { name: "主專業課3", credits: 3, status: "passed", category: "major" },
      { name: "主專業課4", credits: 3, status: "passed", category: "major" },
      { name: "主專業課5", credits: 3, status: "passed", category: "major" },
      { name: "主專業課6", credits: 3, status: "passed", category: "major" },
      { name: "主專業課7", credits: 3, status: "passed", category: "major" },
      { name: "主專業課8", credits: 4, status: "passed", category: "major" },
      { name: "主專業課9", credits: 3, status: "passed", category: "major" }, // total 28

      // 輔專業/學程（示意：6/20）
      { name: "輔專業課1", credits: 3, status: "passed", category: "minor" },
      { name: "輔專業課2", credits: 3, status: "passed", category: "minor" },

      // 自由選修補總學分
      { name: "自由選修A", credits: 20, status: "passed", category: "free" },
      { name: "自由選修B", credits: 20, status: "passed", category: "free" },
      { name: "自由選修C", credits: 20, status: "passed", category: "free" }
    ];
  }

  // 114 甲組（先不展示詳細，避免規則不完整造成混亂）
  return [
    { name: "自由選修A", credits: 10, status: "passed", category: "free" }
  ];
}

/* ----------------------------
 * Report builder
 * ---------------------------- */
function buildReportText(year, track, audit){
  const lines = [];
  lines.push(`🎓 畢業資格審核（Rule Engine）｜規定：${year}${year==="114" ? `｜${track==="A"?"甲組":"乙組"}` : ""}`);
  lines.push("------------------------------------------------");

  lines.push(`📌 總學分：${audit.total.current}/${audit.total.required}（尚差 ${Math.max(0, audit.total.required - audit.total.current)}）`);
  lines.push(`📌 通識：${audit.ge.current}/${audit.ge.required}（尚差 ${Math.max(0, audit.ge.required - audit.ge.current)}）`);

  lines.push(`📌 共同必修：${audit.required.done}/${audit.required.total}`);
  if (audit.required.missing?.length){
    lines.push("❗ 共同必修缺項：");
    audit.required.missing.forEach(c => lines.push(`- ${c}`));
  } else {
    lines.push("✅ 共同必修已全數完成");
  }

  if (year === "113" && audit.specialization){
    const s = audit.specialization;
    lines.push("");
    lines.push(`📌 專業註記（示意）：${s.current}/${s.required}（${s.ok ? "✅ 達標" : `尚差 ${Math.max(0, s.required - s.current)}`}）`);
  }

  if (year === "114" && track === "B" && audit.trackResult){
    const m = audit.trackResult.major;
    const n = audit.trackResult.minor;
    lines.push("");
    lines.push(`📌 乙組主專業註記：${m.current}/${m.required}（尚差 ${Math.max(0, m.required - m.current)}）`);
    lines.push(`📌 乙組輔專業/學程：${n.current}/${n.required}（尚差 ${Math.max(0, n.required - n.current)}）`);
  }

  lines.push("");
  lines.push("💡 建議（示意）：");
  lines.push("A. 優先補共同必修缺項（避免後續卡修）");
  lines.push("B. 同步規劃通識與專業註記缺口，讓大三更自由");

  return lines.join("\n");
}

/* ----------------------------
 * UI update
 * ---------------------------- */
function applyAuditToUI(year, track, audit){
  // KPI
  $("kpiCredits").textContent = `${audit.total.current}`;
  $("kpiReq").textContent = `${audit.required.done}/${audit.required.total}`;

  if (year === "113" && audit.specialization){
    $("kpiSpec").textContent = `${audit.specialization.current}/${audit.specialization.required}`;
  } else if (year === "114" && track === "B" && audit.trackResult){
    $("kpiSpec").textContent = `主 ${audit.trackResult.major.current}/${audit.trackResult.major.required}、輔 ${audit.trackResult.minor.current}/${audit.trackResult.minor.required}`;
  } else {
    $("kpiSpec").textContent = "—";
  }

  // Progress
  setProgress("barTotal", "metaTotal", audit.total.current, audit.total.required);
  setProgress("barGE", "metaGE", audit.ge.current, audit.ge.required);

  // required progress as ratio of course-count
  const ratio = audit.required.total > 0 ? clamp01(audit.required.done / audit.required.total) : 0;
  $("barReq").style.width = `${Math.round(ratio * 100)}%`;
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
 * Init
 * ---------------------------- */
async function init(){
  // 先處理 114 track 啟用/禁用
  setTrackEnabled(getRuleYear() === "114");
  document.querySelectorAll('input[name="ruleYear"]').forEach(el => {
    el.addEventListener("change", () => {
      const year = getRuleYear();
      setTrackEnabled(year === "114");
    });
  });

  // 載入規則
  let rules = null;
  try{
    rules = await loadRules();
  } catch (e){
    console.error(e);
    alert("無法載入 data/rules.json（請確認檔案路徑與大小寫）");
    return;
  }

  // 綁事件：Run
  $("btnRun")?.addEventListener("click", () => {
    const year = getRuleYear();
    const track = (year === "114") ? (getTrack114() || "B") : null;

    const rawText = document.getElementById("txtRaw")?.value || "";
    let courses = [];

    if (rawText.trim().length >= 20){
     // 有貼成績單文字：用 parser 解析
    courses = parseTranscriptToCourses(rawText, rules[year]);
    } 
    else {
      // 沒貼文字：用假資料當備援（demo 不會掛）
    courses = buildFakeCourses(year, track);
    }

    // 真正跑規則引擎
    const audit = runAudit(courses, rules, year, track);

    // 更新 UI
    applyAuditToUI(year, track, audit);
  });

  // 綁事件：Copy
  $("btnCopy")?.addEventListener("click", copyReport);
}

document.addEventListener("DOMContentLoaded", init);
