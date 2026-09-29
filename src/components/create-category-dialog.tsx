import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CategoryIcon, CATEGORY_ICONS } from "@/components/category-icon";

const ICON_NAMES = Object.keys(CATEGORY_ICONS);

export function CreateCategoryDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("Gift");
  const [color, setColor] = useState("#22c55e");
  const [busy, setBusy] = useState(false);

  async function addCategory() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("categories")
        .insert({ user_id: auth.user.id, name: name.trim(), icon, color });
      if (error) throw error;

      setName("");
      qc.invalidateQueries({ queryKey: ["categories"] });
      toast.success("Category created");
      onOpenChange(false);
    } catch (err) {
      toast.error("Could not create category");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Category</DialogTitle>
          <DialogDescription>
            Create a custom category to organize your spending.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="cat-name">Name</Label>
            <Input
              id="cat-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Pets"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Icon</Label>
              <Select value={icon} onValueChange={setIcon}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ICON_NAMES.map((e) => (
                    <SelectItem key={e} value={e}>
                      <div className="flex items-center gap-2">
                        <CategoryIcon icon={e} className="size-4" />
                        <span className="truncate">{e}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cat-color">Color</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="cat-color"
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-10 w-14 p-1 cursor-pointer"
                />
                <span className="text-sm text-muted-foreground">{color}</span>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={addCategory} disabled={!name.trim() || busy}>
            <Plus className="mr-2 size-4" /> Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
