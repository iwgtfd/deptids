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
    // 預設乙組（你也可拿掉預設）
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

  lines.push(
    `📌 總學分：${audit.total.current}/${audit.total.required}` +
    `（尚差 ${Math.max(0, audit.total.required - audit.total.current)}）`
  );

  lines.push(
    `📌 通識：${audit.ge.current}/${audit.ge.required}` +
    `（尚差 ${Math.max(0, audit.ge.required - audit.ge.current)}）`
  );

  lines.push(`📌 共同必修：${audit.required.done}/${audit.required.total}`);
  if (missingReq.length){
    lines.push("❗ 共同必修缺項：");
    missingReq.forEach(c => lines.push(`- ${c}`));
  } else {
    lines.push("✅ 共同必修已完成");
  }

  if (audit.specialization){
    const s = audit.specialization;

    lines.push("");
    lines.push(`📌 專業註記：${s.name}`);

    if (s.prereq && !s.prereq.ok){
      lines.push("❗ 先修尚缺：");
      (s.prereq.missing || []).forEach(c => lines.push(`- ${c}`));
    } else if (s.prereq && s.prereq.ok){
      lines.push("✅ 先修已完成");
    }

    if (s.required && !s.required.ok){
      lines.push("❗ 必修尚缺：");
      (s.required.missing || []).forEach(c => lines.push(`- ${c}`));
    } else if (s.required && s.required.ok){
      lines.push("✅ 必修已完成");
    }

    if (s.credits){
      lines.push(
        `📌 專業註記學分：${s.credits.current}/${s.credits.required}` +
        `（尚差 ${s.credits.remaining}）`
      );
    }

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

  // ===== Next-term suggestions =====
  lines.push("");
  lines.push("💡 建議：");
  lines.push("🧭 下一學期修課建議（優先順序）");

  // 1) 共同必修
  if (missingReq.length > 0){
    lines.push("1️⃣ 優先補齊共同必修：");
    missingReq.slice(0, 4).forEach(c => lines.push(`- ${c}`));
  } else {
    lines.push("1️⃣ 共同必修已完成，可把重心放在通識/專業註記/總學分。");
  }

  // 2) 專業註記
  if (audit.specialization){
    const s = audit.specialization;
    const prereqMissing = s.prereq?.missing || [];
    const requiredMissing = s.required?.missing || [];

    if (prereqMissing.length > 0){
      lines.push("2️⃣ 專業註記先修優先：");
      prereqMissing.slice(0, 4).forEach(c => lines.push(`- ${c}`));
    } else if (requiredMissing.length > 0){
      lines.push("2️⃣ 專業註記必修優先：");
      requiredMissing.slice(0, 4).forEach(c => lines.push(`- ${c}`));
    } else if (!s.ok){
      lines.push("2️⃣ 專業註記必修已齊，下一步用選修/可計入課程補足學分到門檻。");
    } else {
      lines.push("2️⃣ 專業註記已達標。");
    }
  } else {
    lines.push("2️⃣ 建議先選擇你的專業註記（系/輔系）才能計算進度。");
  }

  // 3) 學分策略
  if (!audit.total.ok){
    lines.push("3️⃣ 視課表空間補通識或自由選修，以補足總學分。");
  } else {
    lines.push("3️⃣ 總學分已達標，後續以畢業門檻缺項為主。");
  }

  return lines.join("\n");
}

/* ----------------------------
 * UI update
 * ---------------------------- */
function applyAuditToUI(year, track, audit){
  const kpiCredits = $("kpiCredits");
  const kpiReq = $("kpiReq");
  const kpiSpec = $("kpiSpec");

  if (kpiCredits) kpiCredits.textContent = String(audit.total.current ?? "—");
  if (kpiReq) kpiReq.textContent = `${audit.required.done}/${audit.required.total}`;

  if (kpiSpec){
    if (audit.specialization?.credits){
      kpiSpec.textContent = `${audit.specialization.credits.current}/${audit.specialization.credits.required}`;
    } else {
      kpiSpec.textContent = "—";
    }
  }

  setProgress("barTotal", "metaTotal", audit.total.current, audit.total.required);
  setProgress("barGE", "metaGE", audit.ge.current, audit.ge.required);

  const reqRatio = audit.required.total > 0
    ? clamp01(audit.required.done / audit.required.total)
    : 0;

  const barReq = $("barReq");
  const metaReq = $("metaReq");
  if (barReq) barReq.style.width = `${Math.round(reqRatio * 100)}%`;
  if (metaReq) metaReq.textContent = `${audit.required.done} / ${audit.required.total}`;

  const report = $("reportText");
  if (report) report.textContent = buildReportText(year, track, audit);
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
  const errors = parsed?.errors || [];

  if (errors.length){
    const preview = errors.slice(0, 6)
      .map(e => `第 ${e.lineNo} 行：${e.reason}\n${e.line}`)
      .join("\n\n");

    return {
      ok: false,
      message:
        `輸入格式錯誤（共 ${errors.length} 行）：\n\n${preview}\n\n` +
        `👉 提醒：非通識、非共同必修的課，請補第三欄 /學分（例：123456/資料結構/3）`
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
      const year = getRuleYear();
      setTrackEnabled(year === "114");
    });
  });

  // Run
  const btnRun = $("btnRun");
  if (btnRun){
    btnRun.addEventListener("click", () => {
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
  }

  // Copy
  const btnCopy = $("btnCopy");
  if (btnCopy){
    btnCopy.addEventListener("click", async () => {
      const text = $("reportText")?.textContent || "";
      try{
        await navigator.clipboard.writeText(text);
        alert("已複製報告 ✅");
      } catch {
        alert("無法自動複製（可能因瀏覽器權限），請手動全選複製。");
      }
    });
  }
}

document.addEventListener("DOMContentLoaded", init);
