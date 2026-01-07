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
    const line = lines[i];

    // 跳過常見無效行（你也可自行加更多）
    if (/^(步驟|建議：|目前|提醒：)/.test(line)) continue;

    // 嚴謹：必須含 /
    if (!line.includes("/")){
      errors.push({ lineNo: i + 1, line, reason: "缺少分隔符 /（格式需為 課程代碼/課程名稱）" });
      continue;
    }

    const parts = line.split("/").map(p => p.trim()).filter(p => p.length > 0);

    if (parts.length < 2){
      errors.push({ lineNo: i + 1, line, reason: "欄位不足（至少需 CODE/NAME）" });
      continue;
    }

    const code = parts[0];
    const name = parts[1];
    const credits = parseCredits(parts[2] ?? null) ?? 2; // 學分省略時預設 2（紫荊共同必修多為 2）

    // === 分類（通識 / 非通識）===
    let category = "free";

    // 通識：課程代碼 7 開頭
    const gePrefixes = rule.geCodePrefixes || [];
    if (gePrefixes.some(p => code.startsWith(p))) {
      category = "ge";
    }

    if (!isLikelyCourseCode(code)){
      errors.push({ lineNo: i + 1, line, reason: "課程代碼格式不合理" });
      continue;
    }

    if (name.length < 2){
      errors.push({ lineNo: i + 1, line, reason: "課程名稱太短" });
      continue;
    }

    // 去重：同 code+name 視為同一門（避免重複貼上）
    const key = `${code}__${name}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // 分類：嚴謹模式下，先用 rule.requiredCourses 判斷 required
    let category = "free";
    const requiredList = rule?.requiredCourses || [];
    if (requiredList.includes(name)) category = "required";

    // 若你之後要更嚴謹通識/註記分類，可在此加入 mapping table（第 5 步）
   courses.push({
      code,
      name,
      credits,
      status: "passed",
      category
    });
  }

  return { courses, errors };
}
