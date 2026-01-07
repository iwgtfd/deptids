// js/parser.js  (Strict mode only)
// 支援格式：
// 1) CODE/NAME
// 2) CODE/NAME/CREDITS   (credits 可省略)
// 規則：沒有 "/" 或缺欄位 => 當作錯行，不納入課程
//
// 分類與學分策略：
// - 通識：課碼 7 開頭 => category="ge"，credits=2（你已確認通識都是 2）
// - 共同必修：以 rule.requiredCourses（物件：課名->學分）抓學分 + category="required"
// - 其他課：
//   - 若使用者有輸入學分 => 用輸入
//   - 若沒輸入且資料庫也沒有 => 視為錯行（要求補 /學分），避免亂算

function normalizeLine(s){
  return (s || "")
    .replace(/\s+/g, " ")
    .trim();
}

function isLikelyCourseCode(code){
  if (!code) return false;
  const c = code.trim();
  return /^[0-9]{6,10}$/.test(c) || /^[A-Za-z0-9]{4,12}$/.test(c);
}

function parseCredits(x){
  if (x == null || x === "") return null;
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

  // 重要：你 rules.json 現在有兩種可能
  // A) geCodePrefixes 放在每個 year 的 rule 裡
  // B) geCodePrefixes 放在 meta 裡（你後來有做 meta）
  // 這裡先支援 A（若你之後要支援 meta，再在 app.js 傳進來即可）
  const gePrefixes = rule?.geCodePrefixes || ["7"];

  // 共同必修：你最新的 rules.json 是 requiredCourses 物件（課名->學分）
  // 兼容舊格式（requiredCourses 是陣列）：
  const requiredMap = (rule && typeof rule.requiredCourses === "object" && !Array.isArray(rule.requiredCourses))
    ? rule.requiredCourses
    : null;
  const requiredList = Array.isArray(rule?.requiredCourses) ? rule.requiredCourses : [];

  for (let i = 0; i < lines.length; i++){
    const line = lines[i];

    // 跳過常見非課程行
    if (/^(步驟|建議：|目前|提醒：)/.test(line)) continue;

    // 嚴謹：必須含 /
    if (!line.includes("/")){
      errors.push({
        lineNo: i + 1,
        line,
        reason: "缺少分隔符 /（格式需為 課程代碼/課程名稱，可加 /學分）"
      });
      continue;
    }

    const parts = line.split("/").map(p => p.trim()).filter(Boolean);
    if (parts.length < 2){
      errors.push({ lineNo: i + 1, line, reason: "欄位不足（至少需 CODE/NAME）" });
      continue;
    }

    const code = parts[0];
    const name = parts[1];

    if (!isLikelyCourseCode(code)){
      errors.push({ lineNo: i + 1, line, reason: "課程代碼格式不合理" });
      continue;
    }

    if (name.length < 2){
      errors.push({ lineNo: i + 1, line, reason: "課程名稱太短" });
      continue;
    }

    // 去重：同 code+name 視為同一門
    const key = `${code}__${name}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // ===== 分類（通識 / 必修 / 其他）=====
    // 注意優先權：共同必修 > 通識 > 其他（避免某些必修課碼剛好 7 開頭造成誤判）
    let category = "free";

    const isRequired =
      (requiredMap && Object.prototype.hasOwnProperty.call(requiredMap, name)) ||
      (!requiredMap && requiredList.includes(name));

    const isGE = gePrefixes.some(p => code.startsWith(p));

    if (isGE) category = "ge";
    if (isRequired) category = "required";

    // ===== 學分決定（嚴謹）=====
    // 1) 使用者輸入
    let credits = parseCredits(parts[2] ?? null);

    // 2) 共同必修：直接用資料庫學分（最可靠）
    if (credits == null && isRequired){
      if (requiredMap) credits = Number(requiredMap[name]);
      else credits = 2; // 舊格式沒有學分表時保底
    }

    // 3) 通識：你確認都 2 學分
    if (credits == null && isGE){
      credits = 2;
    }

    // 4) 其他課：如果沒輸入學分，為了避免亂算 -> 要求補上
    if (credits == null){
      errors.push({
        lineNo: i + 1,
        line,
        reason: "缺少學分：此課不在共同必修且非通識，請補上第三欄 /學分（例如：123456/資料結構/3）"
      });
      continue;
    }

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
