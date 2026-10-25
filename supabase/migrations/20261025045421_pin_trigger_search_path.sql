/*
# Fix: pin search_path on fn_settings_updated_at trigger function
Removes the search_path mutable advisory warning by explicitly setting search_path to public.
*/
DROP FUNCTION IF EXISTS fn_settings_updated_at() CASCADE;
CREATE OR REPLACE FUNCTION fn_settings_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_settings_updated_at ON settings;
CREATE TRIGGER trg_settings_updated_at
  BEFORE UPDATE ON settings
  FOR EACH ROW EXECUTE FUNCTION fn_settings_updated_at();
