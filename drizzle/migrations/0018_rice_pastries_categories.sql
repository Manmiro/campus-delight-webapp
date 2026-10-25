ALTER TABLE public.menu_items DROP CONSTRAINT menu_items_category_check;
ALTER TABLE public.menu_items ADD CONSTRAINT menu_items_category_check CHECK (category = ANY (ARRAY['meals','rice','pastries','swallow','drinks','snacks','sides']));
ALTER TABLE public.menu_items ALTER COLUMN category SET DEFAULT 'rice';