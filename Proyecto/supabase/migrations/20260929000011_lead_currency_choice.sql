-- ============================================================================
-- MONEDA ELEGIDA POR LEAD
-- Hasta ahora la moneda del lead era siempre la de su país. Ahora se elige al crearlo entre:
--   - la moneda de cada país habilitado del CRM (con el plan Internacional, cada país suma la suya), y
--   - el dólar, que se ofrece siempre porque es habitual cotizar en US$ entre empresas.
-- El monto se sigue GUARDANDO en esa moneda, sin convertir. Ver la vista en CLP o US$ es solo de la app.
--
-- Cambio aditivo: no se toca la columna ni los datos existentes (todos los leads actuales ya tienen
-- la moneda de su país, que sigue siendo válida). Solo se reemplaza la función del trigger por una
-- que, además de poner la moneda por defecto, valida que sea una de las permitidas.
-- Requiere: 20260925000007_data_quality_conventions.sql (columna currency_code y trigger trg_leads_currency)
--           20260922000004_international_plan.sql (company_countries, companies.home_country)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.lead_allowed_currencies(p_company_id UUID)
RETURNS CHAR(3)[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT ARRAY(
        SELECT DISTINCT c.currency_code
        FROM public.countries c
        WHERE c.code IN (
            SELECT cc.country_code FROM public.company_countries cc WHERE cc.company_id = p_company_id
            UNION
            SELECT co.home_country FROM public.companies co WHERE co.id = p_company_id
        )
        UNION
        SELECT 'USD'::CHAR(3)
    );
$$;

COMMENT ON FUNCTION public.lead_allowed_currencies(UUID) IS
    'Monedas en que puede negociarse un lead del CRM: las de sus países habilitados más USD.';

-- Misma firma que la versión de la migración 0007: el trigger trg_leads_currency sigue llamándola
CREATE OR REPLACE FUNCTION public.set_lead_currency()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.currency_code IS NULL THEN
        SELECT c.currency_code INTO NEW.currency_code FROM public.countries c WHERE c.code = NEW.country_code;
    END IF;

    IF NOT (NEW.currency_code = ANY (public.lead_allowed_currencies(NEW.company_id))) THEN
        RAISE EXCEPTION 'La moneda % no está habilitada para este CRM', NEW.currency_code;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON COLUMN public.leads.currency_code IS
    'Moneda en que se negoció el lead (ISO 4217): la de un país habilitado del CRM o USD. El monto y los precios de sus ítems están en esta moneda y nunca se guardan convertidos.';
