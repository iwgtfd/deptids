// js/app.js
// 第 2 步目標：
// 1) 113/114 切換時，啟用/禁用 114 甲/乙組選項
// 2) 按「產生審核結果」先用 mock 資料更新 KPI/進度條/報告（不碰解析、不碰 rules.json）
// 3) 複製報告

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

  // 若切回 113，清掉已選的 track
  if (!enabled){
    a.checked = false;
    b.checked = false;
  } else {
    // 預設幫使用者選乙組（你們也可以改成不預選）
    if (!a.checked && !b.checked) b.checked = true;
  }
}

function clamp01(x){
  return Math.max(0, Math.min(1, x));
}

function setProgress(barId, metaId, current, required){
  const ratio = required > 0 ? clamp01(current / required) : 0;
  $(barId).style.width = `${Math.round(ratio * 100)}%`;
  $(metaId).textContent = `${current} / ${required}`;
}

function mockAuditResult(){
  // 這裡是「假資料」：讓畫面先動起來
  // 後面第 3～4 步會用真正的 parser + rules.json 取代
  const year = getRuleYear();
  const track = year === "114" ? (getTrack114() || "B") : null;

  // 你可以把這些數字改成你 demo 想呈現的狀態
  const total = 96;
  const totalReq = 128;

  const ge = 20;
  const geReq = 28;

  const reqDone = (year === "113") ? 10 : 8;          // 假設完成幾門
  const reqTotal = (year === "113") ? 13 : 16;        // 示意：113/114 共同必修門數不同
  const reqRatio = reqTotal > 0 ? Math.round((reqDone/reqTotal)*100) : 0;

  // 專業註記（示意）
  let specText = "—";
  if (year === "113"){
    specText = "12 / 20";
  } else {
    specText = (track === "A") ? "甲組（未展示）" : "主 28/44、輔 6/20";
  }

  // 缺項（示意）
  const missingCourses = (year === "113")
    ? ["永續能源與碳中和", "聯合國永續發展目標與實踐"]
    : ["氣候變遷與能源議題", "跨領域專題研究與實作（一）"];

  // 組合成報告文字（示意）
  const reportLines = [];
  reportLines.push(`🎓 畢業資格審核（Mock）｜規定：${year}${year==="114" ? `｜${track==="A"?"甲組":"乙組"}` : ""}`);
  reportLines.push("------------------------------------------------");
  reportLines.push(`📌 總學分：${total}/${totalReq}（尚差 ${Math.max(0,totalReq-total)}）`);
  reportLines.push(`📌 通識：${ge}/${geReq}（尚差 ${Math.max(0,geReq-ge)}）`);
  reportLines.push(`📌 共同必修：${reqDone}/${reqTotal}（完成度約 ${reqRatio}%）`);
  reportLines.push(`📌 專業註記進度：${specText}`);
  reportLines.push("");
  reportLines.push("❗ 可能缺項（示意）：");
  for (const c of missingCourses){
    reportLines.push(`- ${c}`);
  }
  reportLines.push("");
  reportLines.push("💡 建議（示意）：");
  reportLines.push("A. 快速補齊：下學期優先補共同必修缺項 + 通識缺口");
  reportLines.push("B. 低負擔版：先補最常開課的必修，保留選修彈性");

  return {
    total, totalReq,
    ge, geReq,
    reqDone, reqTotal,
    specText,
    reportText: reportLines.join("\n")
  };
}

function applyResultToUI(result){
  // KPI
  $("kpiCredits").textContent = `${result.total}`;
  $("kpiReq").textContent = `${result.reqDone}/${result.reqTotal}`;
  $("kpiSpec").textContent = result.specText;

  // Progress
  setProgress("barTotal", "metaTotal", result.total, result.totalReq);
  setProgress("barGE", "metaGE", result.ge, result.geReq);

  // 共同必修：用門數當作示意
  const reqRatio = result.reqTotal > 0 ? Math.round((result.reqDone/result.reqTotal)*100) : 0;
  $("barReq").style.width = `${reqRatio}%`;
  $("metaReq").textContent = `${result.reqDone} / ${result.reqTotal}`;

  // Report
  $("reportText").textContent = result.reportText;
}

function copyReport(){
  const text = $("reportText").textContent || "";
  navigator.clipboard.writeText(text).then(() => {
    alert("已複製報告到剪貼簿 ✅");
  }).catch(() => {
    alert("無法自動複製，請手動全選複製。");
  });
}

function init(){
  // 初始：依預設選項決定是否啟用 114 track
  setTrackEnabled(getRuleYear() === "114");

  // 綁定規定切換
  document.querySelectorAll('input[name="ruleYear"]').forEach(el => {
    el.addEventListener("change", () => {
      const year = getRuleYear();
      setTrackEnabled(year === "114");
    });
  });

  // 綁按鈕
  $("btnRun").addEventListener("click", () => {
    const result = mockAuditResult();
    applyResultToUI(result);
  });

  $("btnCopy").addEventListener("click", copyReport);
}

document.addEventListener("DOMContentLoaded", init);
