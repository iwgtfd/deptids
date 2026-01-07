// js/parser.js  (Strict mode only)
// 支援格式：
// 1) CODE/NAME
// 2) CODE/NAME/CREDITS   (credits 可省略)
// 規則：沒有 "/" 或缺欄位 => 當作錯行，不納入課程

function normalizeLine(s){
  return (s || "")
    .replace(/\s+/g, " ")
    .trim();
}

function isLikelyCourseCode(code){
  // 允許：純數字(6~10碼) 或 英數混合(最多 12 碼)
  // 你們之後也可以依 CCU 的實際課碼格式再收斂
  if (!code) return false;
  const c = code.trim();
  return /^[0-9]{6,10}$/.test(c) || /^[A-Za-z0-9]{4,12}$/.test(c);
}

function parseCredits(x){
  if (!x) return null;
  const n = Number(String(x).trim());
  if (Number.isFinite(n) && n >= 0.5 && n <= 6) return n;
  return null;
}

export function parseTranscriptToCourses(rawText, rule){
  const text = (rawText || "").replace(/\r/g, "\n");
  const lines = text.split("\n").map(normalizeLine).filter(Boolean);

  const courses = [];
  const errors = [];
  const seen = new Set();

  for (let i = 0; i < lines.length; i++){
    const line = li
