import { useState, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Camera, Loader2, Upload, X, ImageIcon } from "lucide-react";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCategories } from "@/hooks/use-app-data";
import { CategoryIcon } from "@/components/category-icon";
import { CreateCategoryDialog } from "@/components/create-category-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ScannedData {
  amount?: string | number;
  merchant_name?: string;
  date?: string;
  type?: string;
  description?: string;
}

// ─── Gemini Vision Scanner (via @google/generative-ai SDK) ────────────────

/** Resize + compress image via Canvas to reduce payload size for free-tier API */
async function compressImage(base64: string, mimeType: string, maxWidth = 1024): Promise<{ data: string; mimeType: string }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
      resolve({ data: dataUrl.split(",")[1], mimeType: "image/jpeg" });
    };
    img.onerror = () => resolve({ data: base64, mimeType }); // fallback: use original
    img.src = `data:${mimeType};base64,${base64}`;
  });
}

async function scanWithGemini(base64String: string, mimeType: string): Promise<ScannedData> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing VITE_GEMINI_API_KEY");

  // Compress image before sending (reduces free-tier 503 errors)
  const compressed = await compressImage(base64String, mimeType);

  const prompt = `You are analyzing a payment screenshot from an Indian payment app (Paytm, PhonePe, Google Pay, BHIM, bank app, etc.).

Extract the transaction details and return ONLY a raw JSON object with NO markdown, NO backticks, NO explanation.

Use exactly these keys:
- "amount": number only, no currency symbols (e.g. 1450.00)
- "merchant_name": the recipient/sender name or shop name (string)
- "date": in YYYY-MM-DD format (string). If only day/month visible, use current year.
- "type": strictly "debit" if money was sent/paid/debited, or "credit" if money was received/credited
- "description": brief one-line description of the transaction (string, optional)

Example output:
{"amount": 250.00, "merchant_name": "Rahul Sharma", "date": "2024-09-26", "type": "debit", "description": "UPI transfer"}`;

  const modelsToTry = [
    "gemini-1.5-flash", 
    "gemini-1.5-flash-8b",
    "gemini-1.5-pro",
    "gemini-flash-latest"
  ];

  let lastErr: unknown;
  for (let attempt = 0; attempt < modelsToTry.length; attempt++) {
    const modelName = modelsToTry[attempt];
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: { maxOutputTokens: 512, temperature: 0 },
    });

    if (attempt > 0) {
      console.warn(`Model failed, falling back to ${modelName}...`);
      await new Promise((r) => setTimeout(r, 1000)); // small delay between fallbacks
    }

    try {
      const result = await model.generateContent([
        prompt,
        { inlineData: { mimeType: compressed.mimeType, data: compressed.data } },
      ]);
      const raw = result.response.text();
      if (!raw) throw new Error(`Empty response from ${modelName}`);
      const clean = raw.replace(/```json/g, "").replace(/```/g, "").trim();
      return JSON.parse(clean) as ScannedData;
    } catch (err) {
      console.error(`Error with ${modelName}:`, err);
      lastErr = err;
    }
  }
  throw lastErr;
}


// ─── Image Drop Zone ──────────────────────────────────────────────────────────

interface DropZoneProps {
  scanning: boolean;
  previewUrl: string | null;
  onFile: (file: File) => void;
  onClear: () => void;
}

function ImageDropZone({ scanning, previewUrl, onFile, onClear }: DropZoneProps) {
  const [dragging, setDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file && file.type.startsWith("image/")) onFile(file);
    },
    [onFile]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const item = Array.from(e.clipboardData.items).find((i) =>
        i.type.startsWith("image/")
      );
      if (item) onFile(item.getAsFile()!);
    },
    [onFile]
  );

  return (
    <div
      className={`relative rounded-xl border-2 border-dashed transition-colors cursor-pointer
        ${dragging ? "border-primary bg-primary/10" : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30"}
        ${previewUrl ? "border-solid border-primary/40 bg-muted/10" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onPaste={handlePaste}
      tabIndex={0}
      aria-label="Drop or paste a payment screenshot here"
    >
      {previewUrl ? (
        <div className="relative">
          <img
            src={previewUrl}
            alt="Payment screenshot preview"
            className="w-full max-h-48 object-contain rounded-lg p-1"
          />
          {scanning && (
            <div className="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-background/80 backdrop-blur-sm">
              <Loader2 className="size-8 animate-spin text-primary mb-2" />
              <p className="text-sm font-medium text-primary">Reading transaction…</p>
            </div>
          )}
          {!scanning && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onClear(); }}
              className="absolute top-2 right-2 rounded-full bg-background/90 p-1 shadow hover:bg-destructive hover:text-white transition-colors"
              aria-label="Remove image"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 py-6 px-4 text-center text-muted-foreground select-none">
          <ImageIcon className="size-8 opacity-40" />
          <div>
            <p className="text-sm font-medium">Drop or paste screenshot here</p>
            <p className="text-xs opacity-70 mt-0.5">Paytm · PhonePe · GPay · Any UPI app</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function GlobalAddTransaction() {
  const qc = useQueryClient();
  const { data: categories } = useCategories();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showCreateCat, setShowCreateCat] = useState(false);

  const [form, setForm] = useState({
    date: new Date().toISOString().split("T")[0],
    amount: "",
    type: "debit",
    merchant_name: "",
    description: "",
    category_id: "none",
  });

  // ── Shared file processing logic ─────────────────────────────────────────
  const processFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file.");
      return;
    }

    // Show preview immediately
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    setScanning(true);

    const reader = new FileReader();
    reader.readAsDataURL(file);

    reader.onload = async () => {
      let parsedData: ScannedData | null = null;

      try {
        const base64String = (reader.result as string).split(",")[1];
        parsedData = await scanWithGemini(base64String, file.type);
        toast.success("Details filled from screenshot!");
      } catch (err) {
        console.warn("Gemini scan failed, using demo data:", err);
        toast.info("Scan unavailable — loaded demo data instead.");
        parsedData = {
          amount: "1450.00",
          merchant_name: "Mock Coffee Roasters",
          date: new Date().toISOString().split("T")[0],
          type: "debit",
          description: "Demo transaction",
        };
      } finally {
        if (parsedData) {
          setForm((prev) => ({
            ...prev,
            amount: parsedData!.amount ? String(parsedData!.amount) : prev.amount,
            merchant_name: parsedData!.merchant_name || prev.merchant_name,
            date: parsedData!.date || prev.date,
            type: parsedData!.type === "credit" ? "credit" : "debit",
            description: parsedData!.description || prev.description,
          }));
        }
        setScanning(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };

    reader.onerror = () => {
      toast.error("Failed to read file.");
      setScanning(false);
      setPreviewUrl(null);
    };
  }, []);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const clearPreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  };

  // ── Form reset ────────────────────────────────────────────────────────────
  const resetAll = () => {
    clearPreview();
    setForm({
      date: new Date().toISOString().split("T")[0],
      amount: "",
      type: "debit",
      merchant_name: "",
      description: "",
      category_id: "none",
    });
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.amount || isNaN(Number(form.amount))) {
      toast.error("Please enter a valid amount");
      return;
    }
    if (!form.description && !form.merchant_name) {
      toast.error("Please enter a merchant or description");
      return;
    }

    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setSaving(false); return; }

    const { error } = await supabase.from("transactions").insert({
      user_id: auth.user.id,
      date: form.date,
      amount: Number(form.amount),
      type: form.type,
      merchant_name: form.merchant_name || null,
      description: form.description || form.merchant_name || "Manual Transaction",
      category_id: form.category_id === "none" ? null : form.category_id,
      is_manually_categorized: true,
      statement_id: null,
    });

    setSaving(false);

    if (error) {
      toast.error("Could not add transaction");
      return;
    }

    toast.success("Transaction added!");
    setOpen(false);
    resetAll();
    qc.invalidateQueries();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetAll(); }}>
      <DialogTrigger asChild>
        <Button
          size="icon"
          className="fixed bottom-20 right-4 lg:bottom-8 lg:right-8 z-50 h-14 w-14 rounded-full shadow-2xl transition-transform hover:scale-105"
        >
          <Plus className="size-6" />
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[460px] max-h-[90vh] overflow-y-auto">
        <DialogHeader className="flex flex-row justify-between items-start pr-6">
          <div>
            <DialogTitle>Add Transaction</DialogTitle>
            <DialogDescription>
              Paste or drop a UPI screenshot, or fill manually.
            </DialogDescription>
          </div>

          {/* Hidden file input */}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            ref={fileInputRef}
            onChange={handleImageUpload}
          />

          {/* Upload button */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 bg-primary/10 text-primary border-primary/20 hover:bg-primary/20"
            disabled={scanning}
            onClick={() => fileInputRef.current?.click()}
          >
            {scanning
              ? <Loader2 className="size-4 animate-spin mr-1.5" />
              : <Upload className="size-4 mr-1.5" />}
            Upload
          </Button>
        </DialogHeader>

        {/* ── Drop / paste zone ─────────────────────────────────────── */}
        <ImageDropZone
          scanning={scanning}
          previewUrl={previewUrl}
          onFile={processFile}
          onClear={clearPreview}
        />

        {/* ── Manual form ───────────────────────────────────────────── */}
        <form onSubmit={handleSubmit} className="grid gap-5 pt-1">

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="type">Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
                <SelectTrigger className={scanning ? "opacity-50 pointer-events-none" : ""}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="debit">Debit (Spent)</SelectItem>
                  <SelectItem value="credit">Credit (Income)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                required
                value={form.date}
                disabled={scanning}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="amount">Amount</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">₹</span>
              <Input
                id="amount"
                type="number"
                step="0.01"
                required
                placeholder="0.00"
                className="pl-7"
                value={form.amount}
                disabled={scanning}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="merchant">Merchant / Title</Label>
            <Input
              id="merchant"
              placeholder="e.g. Rahul Sharma, Swiggy, Coffee Shop"
              value={form.merchant_name}
              disabled={scanning}
              onChange={(e) => setForm((f) => ({ ...f, merchant_name: e.target.value }))}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="category">Category</Label>
            <Select
              value={form.category_id}
              onValueChange={(v) => {
                if (v === "new-category") setShowCreateCat(true);
                else setForm((f) => ({ ...f, category_id: v }));
              }}
            >
              <SelectTrigger className={scanning ? "opacity-50 pointer-events-none" : ""}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Uncategorized</SelectItem>
                {(categories ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <div className="flex items-center gap-2">
                      <CategoryIcon icon={c.icon} className="size-4" /> {c.name}
                    </div>
                  </SelectItem>
                ))}
                <SelectItem value="new-category" className="text-primary font-medium mt-1 border-t">
                  <div className="flex items-center gap-2">
                    <Plus className="size-4" /> Add new category
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="description">Notes (Optional)</Label>
            <Input
              id="description"
              placeholder="Additional details…"
              value={form.description}
              disabled={scanning}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>

          {/* ── Camera button for mobile (native capture) ─────────── */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full text-muted-foreground hover:text-foreground border border-dashed border-muted-foreground/30 hover:border-primary/50 transition-colors"
            disabled={scanning}
            onClick={() => {
              if (fileInputRef.current) {
                fileInputRef.current.setAttribute("capture", "environment");
                fileInputRef.current.click();
                // Remove capture attr after click so desktop upload still works
                setTimeout(() => fileInputRef.current?.removeAttribute("capture"), 500);
              }
            }}
          >
            <Camera className="size-4 mr-2" />
            Take a photo with camera
          </Button>

          <DialogFooter className="mt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || scanning}>
              {saving ? "Saving…" : "Save Transaction"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>

      {/* Internal dialog for creating new category */}
      <CreateCategoryDialog open={showCreateCat} onOpenChange={setShowCreateCat} />
    </Dialog>
  );
}