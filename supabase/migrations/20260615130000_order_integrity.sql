-- H5: business-value integrity. The SPA trusts RLS for *access*, but RLS does
-- not validate the *values* a member writes. Any assigned staff could POST an
-- arbitrary order total / negative price, silently corrupting revenue and
-- analytics. These DB-side checks enforce value integrity for everyone
-- (authenticated client and service role alike).

-- ============ Non-negative money / sane counts ============
-- Drop-then-add so the migration is re-runnable.
ALTER TABLE public.table_orders DROP CONSTRAINT IF EXISTS table_orders_total_nonneg;
ALTER TABLE public.table_orders ADD CONSTRAINT table_orders_total_nonneg CHECK (total >= 0);

ALTER TABLE public.club_tables DROP CONSTRAINT IF EXISTS club_tables_total_nonneg;
ALTER TABLE public.club_tables ADD CONSTRAINT club_tables_total_nonneg CHECK (total_amount IS NULL OR total_amount >= 0);

ALTER TABLE public.club_tables DROP CONSTRAINT IF EXISTS club_tables_people_nonneg;
ALTER TABLE public.club_tables ADD CONSTRAINT club_tables_people_nonneg CHECK (people_count >= 0);

ALTER TABLE public.bottles DROP CONSTRAINT IF EXISTS bottles_price_nonneg;
ALTER TABLE public.bottles ADD CONSTRAINT bottles_price_nonneg CHECK (price >= 0);

ALTER TABLE public.zones DROP CONSTRAINT IF EXISTS zones_min_per_person_nonneg;
ALTER TABLE public.zones ADD CONSTRAINT zones_min_per_person_nonneg CHECK (min_per_person >= 0);

-- ============ Order total must equal the sum of its line items ============
CREATE OR REPLACE FUNCTION public.validate_table_order_total()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _sum numeric;
  _negatives int;
BEGIN
  IF jsonb_typeof(NEW.bottles) <> 'array' THEN
    RAISE EXCEPTION 'Ordine non valido: il campo bottiglie deve essere un array';
  END IF;

  -- Reject any negative line price.
  SELECT count(*) INTO _negatives
  FROM jsonb_array_elements(NEW.bottles) AS e
  WHERE COALESCE((e->>'price_actual')::numeric, -1) < 0;
  IF _negatives > 0 THEN
    RAISE EXCEPTION 'Ordine non valido: prezzo di riga negativo';
  END IF;

  SELECT COALESCE(sum((e->>'price_actual')::numeric), 0) INTO _sum
  FROM jsonb_array_elements(NEW.bottles) AS e;

  -- Compare to the cent (the client rounds totals to 2 decimals).
  IF round(_sum, 2) <> round(NEW.total, 2) THEN
    RAISE EXCEPTION 'Totale ordine (%) non corrisponde alla somma delle bottiglie (%)', NEW.total, _sum;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_table_order_total() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_table_order_total() TO service_role;

DROP TRIGGER IF EXISTS validate_table_order_total_before_write ON public.table_orders;
CREATE TRIGGER validate_table_order_total_before_write
BEFORE INSERT OR UPDATE ON public.table_orders
FOR EACH ROW EXECUTE FUNCTION public.validate_table_order_total();
