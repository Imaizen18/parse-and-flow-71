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
  date: /^(txn|transaction|value|posting|book)?\s*_?-?\s*date$|date/i,
  description: /description|narration|particular|details|remark|memo|reference|transaction remarks/i,
  debit: /withdraw|debit|dr\b|paid out|money out/i,
  credit: /deposit|credit|cr\b|paid in|money in/i,
  amount: /^amount|amount$|value|transaction amount/i,
  type: /^type$|dr\/cr|drcr|indicator/i,
};

function pick(headers: string[], rx: RegExp) {
  return headers.find((h) => rx.test(h.trim()));
}

function toNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (v == null) return NaN;
  const s = String(v)
    .replace(/[^0-9.\-()]/g, "")
    .replace(/\((.*)\)/, "-$1");
  if (!s || s === "-" || s === ".") return NaN;
  return Number(s);
}

function toDate(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    // Excel serial date
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  const s = String(v ?? "").trim();
  if (!s) return null;
  const dmy = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (dmy) {
    const d = dmy[1]!;
    const m = dmy[2]!;
    let y = dmy[3]!;
    if (y.length === 2) y = `20${y}`;
    const dd = Number(d);
    const mm = Number(m);
    // If first part > 12 it's definitely day-first; otherwise assume day-first (most bank exports)
    const date = new Date(Number(y), mm - 1, dd);
    if (!isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }
  const parsed = new Date(s);
  return isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

const NOISE =
  /\b(pos|upi|neft|imps|rtgs|ach|atm|nach|ecs|vps|txn|ref|refno|debit card|credit card|purchase|payment|transfer|inf|mps|bil|onl|tpt)\b/gi;

export function cleanMerchant(description: string): string {
  let s = description
    .replace(/[*/|]+/g, " ")
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
  "Food & Dining": ["swiggy", "zomato", "restaurant", "cafe", "starbucks", "dominos", "mcdonald", "pizza", "eatery", "bar & "],
  Transport: ["uber", "ola", "lyft", "metro", "fuel", "petrol", "shell", "indian oil", "irctc", "rapido", "parking", "toll"],
  Groceries: ["bigbasket", "blinkit", "zepto", "dmart", "grocery", "supermarket", "instamart", "reliance fresh", "more retail"],
  "Housing & Rent": ["rent", "maintenance", "society", "electricity", "water bill", "gas bill", "broadband", "landlord"],
  "Health & Medical": ["pharmacy", "apollo", "hospital", "clinic", "medical", "pharmeasy", "1mg", "diagnostic", "dental"],
  Entertainment: ["bookmyshow", "pvr", "inox", "cinema", "gaming", "steam", "playstation", "concert"],
  Shopping: ["amazon", "flipkart", "myntra", "ajio", "nykaa", "ikea", "zara", "hm ", "decathlon", "store"],
  Subscriptions: ["netflix", "spotify", "prime", "youtube", "icloud", "google one", "adobe", "notion", "figma", "openai", "subscription"],
  Travel: ["makemytrip", "goibibo", "airbnb", "hotel", "indigo", "airlines", "air india", "booking.com", "oyo"],
  Education: ["udemy", "coursera", "school", "college", "tuition", "byju", "unacademy", "course"],
  Business: ["aws", "invoice", "gst", "consulting", "office", "vendor", "payroll"],
};

export function guessCategoryName(text: string): string | null {
  const t = text.toLowerCase();
  for (const [category, words] of Object.entries(DEFAULT_KEYWORDS)) {
    if (words.some((w) => t.includes(w))) return category;
  }
  return null;
}

export function mapRows(raw: Raw[]): ParsedRow[] {
  if (!raw.length) return [];
  const headers = Object.keys(raw[0] as Raw);
  const dateKey = pick(headers, RX.date);
  const descKey = pick(headers, RX.description) ?? headers.find((h) => !RX.date.test(h));
  const debitKey = pick(headers, RX.debit);
  const creditKey = pick(headers, RX.credit);
  const amountKey = pick(headers, RX.amount);
  const typeKey = pick(headers, RX.type);

  const rows: ParsedRow[] = [];
  for (const r of raw) {
    const date = dateKey ? toDate(r[dateKey]) : null;
    if (!date) continue;
    const description = String((descKey ? r[descKey] : "") ?? "").trim();

    let amount = NaN;
    let type: "debit" | "credit" = "debit";

    const debit = debitKey ? toNumber(r[debitKey]) : NaN;
    const credit = creditKey ? toNumber(r[creditKey]) : NaN;

    if (!isNaN(debit) && debit !== 0) {
      amount = Math.abs(debit);
      type = "debit";
    } else if (!isNaN(credit) && credit !== 0) {
      amount = Math.abs(credit);
      type = "credit";
    } else if (amountKey) {
      const a = toNumber(r[amountKey]);
      if (isNaN(a) || a === 0) continue;
      const t = typeKey ? String(r[typeKey] ?? "").toLowerCase() : "";
      if (t) type = /cr|credit|income|in\b/.test(t) ? "credit" : "debit";
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

export async function parseStatementFile(file: File): Promise<ParsedRow[]> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "csv" || ext === "txt") {
    const text = await file.text();
    const result = Papa.parse<Raw>(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
    });
    return mapRows(result.data.filter(Boolean));
  }
  if (ext === "xlsx" || ext === "xls") {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { cellDates: true });
    const sheet = wb.Sheets[wb.SheetNames[0]!]!;
    const json = XLSX.utils.sheet_to_json<Raw>(sheet, { defval: "" });
    return mapRows(json);
  }
  throw new Error("Unsupported file type. Upload a CSV or Excel export from your bank.");
}
