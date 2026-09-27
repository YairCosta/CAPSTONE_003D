-- ============================================================================
-- 0029 · Divisas para ver el CRM, elegidas por la gerencia
-- ============================================================================
-- El selector de moneda del encabezado ofrece siempre la moneda del país base y el dólar. La gerencia
-- puede sumar la de otros países activos de su CRM (PEN, MXN…), y todo el equipo ve ese botón. Solo
-- cambia cómo se muestran y suman los montos: cada lead sigue guardado en la moneda en que se negoció,
-- sin convertir (docs/MONEDAS.md). Cada persona elige cuál mirar; eso queda en su navegador.
--
-- Mismo modelo que company_countries (0004 y 0023): la gerencia agrega y quita solo en su CRM, el
-- administrador en cualquiera, y la base rechaza la moneda de un país que el CRM no tiene activo.
-- Si después se desactiva ese país, la fila queda guardada pero la app no la ofrece (vuelve con él).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.company_view_currencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    currency_code CHAR(3) NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
    CONSTRAINT company_view_currencies_unica UNIQUE (company_id, currency_code)
);

COMMENT ON TABLE public.company_view_currencies IS
    'Divisas que la gerencia sumó al selector de moneda del CRM, además de la del país base y el dólar (que están siempre). Solo afectan cómo se muestran los montos.';
COMMENT ON COLUMN public.company_view_currencies.company_id IS 'CRM al que pertenece la preferencia.';
COMMENT ON COLUMN public.company_view_currencies.currency_code IS 'Código ISO 4217 de una moneda de un país activo del CRM.';
COMMENT ON COLUMN public.company_view_currencies.created_at IS 'Cuándo se sumó la divisa.';

-- ------------------------------------------------------------------ solo monedas de países activos
CREATE OR REPLACE FUNCTION public.enforce_view_currency_of_company()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.countries co
        WHERE co.currency_code = NEW.currency_code
          AND public.is_country_enabled(NEW.company_id, co.code)
    ) THEN
        RAISE EXCEPTION 'La divisa % no es de un país activo de este CRM', NEW.currency_code USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_view_currency_of_company() IS
    'Rechaza una divisa de la vista que no sea la moneda de un país activo del CRM.';

REVOKE EXECUTE ON FUNCTION public.enforce_view_currency_of_company() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_company_view_currencies_valid ON public.company_view_currencies;
CREATE TRIGGER trg_company_view_currencies_valid
    BEFORE INSERT OR UPDATE ON public.company_view_currencies
    FOR EACH ROW EXECUTE FUNCTION public.enforce_view_currency_of_company();

-- Quién cambió qué, como en el resto de las tablas que cambian las personas (0022)
DROP TRIGGER IF EXISTS trg_company_view_currencies_change_log ON public.company_view_currencies;
CREATE TRIGGER trg_company_view_currencies_change_log
    AFTER INSERT OR UPDATE OR DELETE ON public.company_view_currencies
    FOR EACH ROW EXECUTE FUNCTION public.log_row_change();

-- ------------------------------------------------------------------ RLS
ALTER TABLE public.company_view_currencies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Divisas de la vista: lectura" ON public.company_view_currencies;
CREATE POLICY "Divisas de la vista: lectura" ON public.company_view_currencies
    FOR SELECT TO authenticated
    USING (company_id = public.get_current_user_company_id() OR public.is_superadmin());

DROP POLICY IF EXISTS "Divisas de la vista: gestión superadmin" ON public.company_view_currencies;
CREATE POLICY "Divisas de la vista: gestión superadmin" ON public.company_view_currencies
    FOR ALL TO authenticated
    USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

DROP POLICY IF EXISTS "Divisas de la vista: la gerencia agrega" ON public.company_view_currencies;
CREATE POLICY "Divisas de la vista: la gerencia agrega" ON public.company_view_currencies
    FOR INSERT TO authenticated
    WITH CHECK (
        company_id = public.get_current_user_company_id()
        AND public.get_current_user_role() = 'manager'
    );

DROP POLICY IF EXISTS "Divisas de la vista: la gerencia quita" ON public.company_view_currencies;
CREATE POLICY "Divisas de la vista: la gerencia quita" ON public.company_view_currencies
    FOR DELETE TO authenticated
    USING (
        company_id = public.get_current_user_company_id()
        AND public.get_current_user_role() = 'manager'
    );

REVOKE ALL ON public.company_view_currencies FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.company_view_currencies TO authenticated;
GRANT ALL ON public.company_view_currencies TO service_role;
