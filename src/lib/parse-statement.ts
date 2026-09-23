import Papa from "papaparse";
import * as XLSX from "xlsx";

export type ParsedRow = {
  date: string; // yyyy-mm-dd
  description: string;
  merchant_name: string;
  amount: number;
  type: "debit" | "credit";
};

type Raw = Record<string, unknown>;

const RX = {
  date: /(txn|transaction|value|posting|book|order|payment|completion)?\s*[_-]?\s*date|^date\b|date$|^dt$/i,
  description: /description|narration|particular|details|remark|memo|note|reference|transaction remarks|payee|merchant|name|to\s*\/\s*from|paid to|sent to|received from/i,
  debit: /withdraw|debit(?!\/)|^dr$|\bdr\samount|paid out|money out|outflow|spent|expense/i,
  credit: /deposit|credit(?!\/)|^cr$|\bcr\samount|paid in|money in|inflow|received|income/i,
  amount: /^amount|amount$|^value$|transaction amount|txn amount|amount \(|amt/i,
  type: /^type$|dr\s*\/\s*cr|drcr|cr\s*\/\s*dr|indicator|debit\s*\/\s*credit|transaction type/i,
  balance: /balance|bal\b|closing|available/i,
};

function pick(headers: string[], rx: RegExp, exclude?: RegExp) {
  return headers.find((h) => {
    const s = h.trim();
    if (!s) return false;
    if (exclude && exclude.test(s)) return false;
    return rx.test(s);
  });
}

function toNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (v == null) return NaN;
  let s = String(v).trim();
  if (!s) return NaN;
  const negative = /^\(.*\)$/.test(s) || /(^|\s)(dr|debit)\b/i.test(s) || s.startsWith("-");
  s = s
    .replace(/[()]/g, "")
    .replace(/[^0-9.,-]/g, "")
    .replace(/,/g, "")
    .replace(/-/g, "");
  if (!s || s === ".") return NaN;
  const n = Number(s);
  if (isNaN(n)) return NaN;
  return negative ? -n : n;
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function iso(y: number, m: number, d: number): string | null {
  if (m < 0 || m > 11 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m, d));
  if (isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

export function toDate(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime()))
    return iso(v.getFullYear(), v.getMonth(), v.getDate());
  if (typeof v === "number") {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  let s = String(v ?? "").trim();
  if (!s) return null;
  // strip time portion / timezone noise
  s = s.replace(/\b\d{1,2}:\d{2}(:\d{2})?\s*(am|pm)?\b/i, "").replace(/\s+/g, " ").trim();

  // 2024-08-12 or 2024/08/12
  const ymd = s.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})/);
  if (ymd) return iso(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));

  // 12 Aug 2024 / 12-Aug-24 / Aug 12, 2024
  const dMon = s.match(/^(\d{1,2})[\s\-/]*([A-Za-z]{3,})[\s\-/,]*(\d{2,4})/);
  if (dMon) {
    const m = MONTHS[dMon[2]!.slice(0, 3).toLowerCase()];
    if (m !== undefined) {
      let y = Number(dMon[3]);
      if (y < 100) y += 2000;
      return iso(y, m, Number(dMon[1]));
    }
  }
  const monD = s.match(/^([A-Za-z]{3,})[\s\-/]*(\d{1,2})[\s\-/,]*(\d{2,4})/);
  if (monD) {
    const m = MONTHS[monD[1]!.slice(0, 3).toLowerCase()];
    if (m !== undefined) {
      let y = Number(monD[3]);
      if (y < 100) y += 2000;
      return iso(y, m, Number(monD[2]));
    }
  }

  // 12/08/2024 — day-first unless the first part is clearly a month-only value
  const dmy = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (dmy) {
    let a = Number(dmy[1]);
    let b = Number(dmy[2]);
    let y = Number(dmy[3]);
    if (y < 100) y += 2000;
    if (a > 12 && b <= 12) return iso(y, b - 1, a);
    if (b > 12 && a <= 12) return iso(y, a - 1, b);
    return iso(y, b - 1, a); // default day-first (most bank exports)
  }

  const parsed = new Date(s);
  return isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

const NOISE =
  /\b(pos|upi|neft|imps|rtgs|ach|atm|nach|ecs|vps|txn|ref|refno|utr|rrn|mandate|autopay|debit card|credit card|purchase|payment|paid to|sent to|received from|transfer|inf|mps|bil|onl|tpt|sbin|hdfc|icic|utib|ybl|okaxis|okhdfcbank|oksbi|paytm|ibl|ptm|apl|ptys|wallet|vpa)\b/gi;

export function cleanMerchant(description: string): string {
  let s = description
    .replace(/[*/|_\-#:;]+/g, " ")
    .replace(/\b[\w.]+@[\w.]+\b/g, " ") // UPI ids / emails
    .replace(/[*/|_\-#:;]+/g, " ")
    .replace(/\b[0-9]{4,}\b/g, " ")
    .replace(/\b[a-z0-9]*\d{3,}[a-z0-9]*\b/gi, " ")
    .replace(NOISE, " ")
    .replace(/[^a-z0-9&.' -]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) s = description.trim();
  return s
    .split(" ")
    .slice(0, 4)
    .map((w) => (w.length > 2 ? w[0]!.toUpperCase() + w.slice(1).toLowerCase() : w.toUpperCase()))
    .join(" ");
}

export const DEFAULT_KEYWORDS: Record<string, string[]> = {
  "Food & Dining": ["swiggy", "zomato", "restaurant", "cafe", "starbucks", "dominos", "mcdonald", "pizza", "eatery", "kfc", "burger", "biryani", "eatclub", "dunkin", "chai", "bakery"],
  Transport: ["uber", "ola", "lyft", "metro", "fuel", "petrol", "shell", "indian oil", "bharat petroleum", "hp petrol", "irctc", "rapido", "parking", "toll", "fastag", "redbus", "namma yatri", "blusmart"],
  Groceries: ["bigbasket", "blinkit", "zepto", "dmart", "grocery", "supermarket", "instamart", "reliance fresh", "more retail", "jiomart", "licious", "country delight", "milk"],
  "Housing & Rent": ["rent", "maintenance", "society", "electricity", "water bill", "gas bill", "broadband", "landlord", "airtel fiber", "jio fiber", "act fibernet", "tata power", "bescom", "nobroker"],
  "Health & Medical": ["pharmacy", "apollo", "hospital", "clinic", "medical", "pharmeasy", "1mg", "netmeds", "diagnostic", "dental", "practo", "cult.fit", "gym"],
  Entertainment: ["bookmyshow", "pvr", "inox", "cinema", "gaming", "steam", "playstation", "concert", "district"],
  Shopping: ["amazon", "flipkart", "myntra", "ajio", "nykaa", "ikea", "zara", "decathlon", "store", "meesho", "croma", "reliance digital", "lenskart", "tata cliq", "shein"],
  Subscriptions: ["netflix", "spotify", "prime", "youtube", "icloud", "google one", "adobe", "notion", "figma", "openai", "chatgpt", "subscription", "hotstar", "jiocinema", "sonyliv", "zee5", "apple.com/bill", "canva", "claude"],
  Travel: ["makemytrip", "goibibo", "airbnb", "hotel", "indigo", "airlines", "air india", "booking.com", "oyo", "vistara", "cleartrip", "ixigo", "akasa"],
  Education: ["udemy", "coursera", "school", "college", "tuition", "byju", "unacademy", "course", "kindle", "physicswallah"],
  Business: ["aws", "invoice", "gst", "consulting", "office", "vendor", "payroll", "razorpay", "stripe", "godaddy", "digitalocean", "vercel", "cloudflare"],
  Income: ["salary", "interest credit", "refund", "cashback", "dividend", "reversal", "neft credit", "received from"],
};

export function guessCategoryName(text: string): string | null {
  const t = text.toLowerCase();
  for (const [category, words] of Object.entries(DEFAULT_KEYWORDS)) {
    if (words.some((w) => t.includes(w))) return category;
  }
  return null;
}

const HEADER_HINT =
  /date|description|narration|particular|amount|debit|credit|withdraw|deposit|balance|type|details|transaction/i;

/** Banks and payment apps put metadata rows above the real header — find it. */
function findHeaderRow(matrix: unknown[][]): number {
  let best = -1;
  let bestScore = 0;
  const limit = Math.min(matrix.length, 30);
  for (let i = 0; i < limit; i++) {
    const cells = (matrix[i] ?? []).map((c) => String(c ?? "").trim());
    const filled = cells.filter(Boolean);
    if (filled.length < 2) continue;
    const score = filled.filter((c) => c.length < 40 && HEADER_HINT.test(c)).length;
    const hasDate = filled.some((c) => RX.date.test(c));
    const hasValue = filled.some(
      (c) => RX.amount.test(c) || RX.debit.test(c) || RX.credit.test(c),
    );
    if (hasDate && hasValue && score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

function matrixToRecords(matrix: unknown[][]): Raw[] {
  const headerIdx = findHeaderRow(matrix);
  if (headerIdx === -1) return [];
  const header = (matrix[headerIdx] ?? []).map((c, i) => {
    const s = String(c ?? "").trim();
    return s || `col_${i}`;
  });
  const out: Raw[] = [];
  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const row = matrix[i] ?? [];
    if (!row.some((c) => String(c ?? "").trim())) continue;
    const rec: Raw = {};
    header.forEach((h, j) => {
      rec[h] = row[j];
    });
    out.push(rec);
  }
  return out;
}

export function mapRows(raw: Raw[]): ParsedRow[] {
  if (!raw.length) return [];
  const headers = Object.keys(raw[0] as Raw);
  const dateKey = pick(headers, RX.date);
  const descKey =
    pick(headers, RX.description) ?? headers.find((h) => h !== dateKey && !RX.amount.test(h));
  const debitKey = pick(headers, RX.debit, RX.balance);
  const creditKey = pick(headers, RX.credit, RX.balance);
  const amountKey = pick(
    headers.filter((h) => h !== debitKey && h !== creditKey),
    RX.amount,
    RX.balance,
  );
  const typeKey = pick(headers, RX.type);

  const rows: ParsedRow[] = [];
  for (const r of raw) {
    const date = dateKey ? toDate(r[dateKey]) : null;
    if (!date) continue;

    // Some exports spread the description across multiple text columns.
    const description = String((descKey ? r[descKey] : "") ?? "").trim();

    let amount = NaN;
    let type: "debit" | "credit" = "debit";

    const debit = debitKey && debitKey !== amountKey ? toNumber(r[debitKey]) : NaN;
    const credit = creditKey && creditKey !== amountKey ? toNumber(r[creditKey]) : NaN;

    if (!isNaN(debit) && debit !== 0) {
      amount = Math.abs(debit);
      type = "debit";
    } else if (!isNaN(credit) && credit !== 0) {
      amount = Math.abs(credit);
      type = "credit";
    } else if (amountKey) {
      const rawAmount = r[amountKey];
      const a = toNumber(rawAmount);
      if (isNaN(a) || a === 0) continue;
      const typeText = `${typeKey ? String(r[typeKey] ?? "") : ""} ${String(rawAmount ?? "")}`
        .trim()
        .toLowerCase();
      if (/cr\b|credit|deposit|received|income|money in|inflow/.test(typeText)) type = "credit";
      else if (/dr\b|debit|withdraw|paid|sent|money out|outflow|spent/.test(typeText)) type = "debit";
      else if (/received from|refund|cashback|salary/i.test(description)) type = "credit";
      else type = a < 0 ? "debit" : "credit";
      amount = Math.abs(a);
    }

    if (isNaN(amount) || amount === 0) continue;
    rows.push({
      date,
      description,
      merchant_name: cleanMerchant(description),
      amount,
      type,
    });
  }
  return rows;
}

function parseDelimited(text: string): ParsedRow[] {
  // Let Papa sniff the delimiter (comma, semicolon, tab, pipe) and read raw rows
  // so metadata lines above the real header can be skipped.
  const result = Papa.parse<string[]>(text, { header: false, skipEmptyLines: "greedy" });
  const matrix = (result.data ?? []).filter(Array.isArray);
  const records = matrixToRecords(matrix);
  return mapRows(records);
}

export async function parseStatementFile(file: File): Promise<ParsedRow[]> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "csv" || ext === "txt" || ext === "tsv") {
    const rows = parseDelimited(await file.text());
    if (!rows.length)
      throw new Error(
        "Couldn't find a date and amount column in this file. Check that the export includes headers.",
      );
    return rows;
  }
  if (ext === "xlsx" || ext === "xls") {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { cellDates: true });
    let best: ParsedRow[] = [];
    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName];
      if (!sheet) continue;
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: false, blankrows: false });
      const rows = mapRows(matrixToRecords(matrix));
      if (rows.length > best.length) best = rows;
    }
    if (!best.length)
      throw new Error("Couldn't find transaction rows in this spreadsheet.");
    return best;
  }
  throw new Error("Unsupported file type. Upload a CSV or Excel export from your bank or payment app.");
}
