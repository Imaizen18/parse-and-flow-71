ALTER TABLE public.budgets ALTER COLUMN category_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS budgets_user_month_overall_idx
  ON public.budgets (user_id, month)
  WHERE category_id IS NULL;