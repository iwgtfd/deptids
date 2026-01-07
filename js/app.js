// js/app.js
import { runAudit } from "./engine.js";
import { parseTranscriptToCourses } from "./parser.js";

/* ---------- Utils ---------- */
const $ = id => document.getElementById(id);

const getRuleYear = () =>
  document.querySelector('input[name="ruleYear"]:checked')?.value || "113";

const getTrack114 = () =>
  document.querySelector('input[name="track114"]:checked')?.value || null;

const clamp01 = x => Math.max(0, Math.min(1, x));

const setProgress = (barId, metaId, cur, req) => {
  const ratio = req > 0 ? clamp01(cur / req) : 0;
  $(barId).style.width = `${Math.round(ratio * 100)}%`;
  $(metaId).textContent = `${cur} / ${req}`;
};

/* ---------- rules ---------- */
async function loadRules(){
  const base = new URL(".", window.location.href);
  const url = new URL("data/rules.json", base);
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error("rules.json 載入失敗");
  return await res.json();
}

/* ---------- 專業註記選單 ---------- */
function populateSpecSelect(rules){
  const select = $("specSelect");
  if (!select) return;

  select.innerHTML = `<option value="">（未選擇專業註記）</option>`;
  Object.entries(rules.specializations || {}).forEach(([id, s]) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = s.name || id;
    select.appendChild(opt);
  });
}

/* ---------- Report ---------- */
function buildReportText(year, track, audit){
  const r = audit.required.credits;
  const lines = [];

  lines.push(`🎓 畢業資格審核｜${year}`);
  lines.push("-----------------------------");

  lines.push(`📌 總學分：${audit.total.current}/${audit.total.required}`);
  lines.push(`📌 通識：${audit.ge.current}/${audit.ge.required}`);
  lines.push(`📌 共同必修：${r.current}/${r.required}`);

  if (audit.required.missing.length){
    lines.push("❗ 共同必修尚缺：");
    audit.required.missing.forEach(c => lines.push(`- ${c}`));
  }

  if (audit.specialization){
    const s = audit.specialization;
    lines.push("");
    lines.push(`📌 專業註記：${s.name}`);
    lines.push(
      `學分：${s.credits.current}/${s.credits.required}`
    );
  }

  return lines.join("\n");
}

/* ---------- UI ---------- */
function applyAuditToUI(year, track, audit){
  $("kpiCredits").textContent = audit.total.current;
  $("kpiReq").textContent =
    `${audit.required.credits.current}/${audit.required.credits.required}`;

  $("kpiSpec").textContent = audit.specialization
    ? `${audit.specialization.credits.current}/${audit.specialization.credits.required}`
    : "—";

  setProgress(
    "barTotal",
    "metaTotal",
    audit.total.current,
    audit.total.required
  );

  setProgress(
    "barGE",
    "metaGE",
    audit.ge.current,
    audit.ge.required
  );

  setProgress(
    "barReq",
    "metaReq",
    audit.required.credits.current,
    audit.required.credits.required
  );

  $("reportText").textContent =
    buildReportText(year, track, audit);
}

/* ---------- Init ---------- */
async function init(){
  const rules = await loadRules();
  populateSpecSelect(rules);

  $("btnRun").addEventListener("click", () => {
    const year = getRuleYear();
    const track = year === "114" ? getTrack114() : null;
    const specId = $("specSelect")?.value || null;

    const rawText = $("txtRaw").value;
    const parsed = parseTranscriptToCourses(rawText, rules, year);

    if (parsed.errors?.length){
      alert(parsed.errors[0].reason);
      return;
    }

    const audit = runAudit(
      parsed.courses,
      rules,
      year,
      track,
      specId
    );

    applyAuditToUI(year, track, audit);
  });

  $("btnCopy").addEventListener("click", () => {
    navigator.clipboard.writeText($("reportText").textContent);
    alert("已複製報告");
  });
}

document.addEventListener("DOMContentLoaded", init);
