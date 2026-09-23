-- ============================================================================
-- CATÁLOGO DE PRODUCTOS Y SERVICIOS + ÍTEMS DE CADA LEAD
-- El gerente mantiene el catálogo; los leads llevan uno o varios ítems. Con ítems, el valor estimado
-- del lead se calcula solo (value_source = 'items'), salvo que se edite a mano (value_source = 'manual').
-- Permite medir qué se vende más y en qué zonas (comunas, distritos…).
-- Requiere: 20260922000004_international_plan.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Catálogo por CRM
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.catalog_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    item_type VARCHAR(10) NOT NULL CHECK (item_type IN ('product', 'service')),
    name VARCHAR(200) NOT NULL,
    sku VARCHAR(60),
    category VARCHAR(120),
    description TEXT,
    billing_type VARCHAR(10) CHECK (billing_type IN ('one_time', 'monthly')), -- solo servicios
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE (company_id, name),
    CONSTRAINT catalog_items_billing_only_services CHECK (item_type = 'service' OR billing_type IS NULL)
);
CREATE INDEX IF NOT EXISTS idx_catalog_items_company ON public.catalog_items (company_id, item_type);

-- Precio sugerido por país, en la moneda de ese país
CREATE TABLE IF NOT EXISTS public.catalog_item_prices (
    catalog_item_id UUID NOT NULL REFERENCES public.catalog_items(id) ON DELETE CASCADE,
    country_code CHAR(2) NOT NULL REFERENCES public.countries(code),
    price NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
    PRIMARY KEY (catalog_item_id, country_code)
);

-- ----------------------------------------------------------------------------
-- 2. Ítems de cada lead (el precio unitario queda guardado: si cambia el catálogo, la venta no cambia)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lead_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    catalog_item_id UUID NOT NULL REFERENCES public.catalog_items(id) ON DELETE RESTRICT, -- en uso: se desactiva, no se borra
    quantity INT NOT NULL CHECK (quantity BETWEEN 1 AND 100000),
    unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE (lead_id, catalog_item_id)
);
CREATE INDEX IF NOT EXISTS idx_lead_items_lead ON public.lead_items (lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_items_item ON public.lead_items (company_id, catalog_item_id);

ALTER TABLE public.leads
    ADD COLUMN IF NOT EXISTS value_source VARCHAR(10) NOT NULL DEFAULT 'manual' CHECK (value_source IN ('items', 'manual'));

-- ----------------------------------------------------------------------------
-- 3. Integridad: un ítem de lead debe ser del mismo CRM que el lead y que el catálogo
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_lead_item_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.leads l WHERE l.id = NEW.lead_id AND l.company_id = NEW.company_id) THEN
        RAISE EXCEPTION 'El lead pertenece a otro CRM' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.catalog_items ci WHERE ci.id = NEW.catalog_item_id AND ci.company_id = NEW.company_id
    ) THEN
        RAISE EXCEPTION 'El producto o servicio pertenece a otro CRM' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lead_items_tenant ON public.lead_items;
CREATE TRIGGER trg_lead_items_tenant
    BEFORE INSERT OR UPDATE OF company_id, lead_id, catalog_item_id ON public.lead_items
    FOR EACH ROW EXECUTE FUNCTION public.enforce_lead_item_tenant();

-- ----------------------------------------------------------------------------
-- 4. Valor del lead calculado desde sus ítems (cuando no es manual)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recalculate_lead_value(p_lead_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_items INT;
BEGIN
    SELECT COUNT(*) INTO v_items FROM public.lead_items WHERE lead_id = p_lead_id;

    IF v_items = 0 THEN
        -- Sin ítems, el valor solo puede ser manual
        UPDATE public.leads SET value_source = 'manual' WHERE id = p_lead_id AND value_source <> 'manual';
        RETURN;
    END IF;

    UPDATE public.leads l
    SET estimated_deal_value = (
            SELECT COALESCE(SUM(li.quantity * li.unit_price), 0) FROM public.lead_items li WHERE li.lead_id = l.id
        ),
        updated_at = TIMEZONE('utc'::text, NOW())
    WHERE l.id = p_lead_id AND l.value_source = 'items';
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_lead_items_recalculate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public.recalculate_lead_value(COALESCE(NEW.lead_id, OLD.lead_id));
    IF TG_OP = 'UPDATE' AND NEW.lead_id IS DISTINCT FROM OLD.lead_id THEN
        PERFORM public.recalculate_lead_value(OLD.lead_id);
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_lead_items_value ON public.lead_items;
CREATE TRIGGER trg_lead_items_value
    AFTER INSERT OR UPDATE OR DELETE ON public.lead_items
    FOR EACH ROW EXECUTE FUNCTION public.trg_lead_items_recalculate();

-- Al volver de "manual" a "items" se recalcula el valor
CREATE OR REPLACE FUNCTION public.trg_leads_value_source()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.value_source = 'items' THEN
        NEW.estimated_deal_value := COALESCE(
            (SELECT SUM(li.quantity * li.unit_price) FROM public.lead_items li WHERE li.lead_id = NEW.id),
            NEW.estimated_deal_value
        );
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_value_source ON public.leads;
CREATE TRIGGER trg_leads_value_source
    BEFORE UPDATE OF value_source, estimated_deal_value ON public.leads
    FOR EACH ROW EXECUTE FUNCTION public.trg_leads_value_source();

-- ----------------------------------------------------------------------------
-- 5. RLS: catálogo visible para el CRM, editable solo por gerencia; ítems de leads para el CRM
-- ----------------------------------------------------------------------------
ALTER TABLE public.catalog_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_item_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Catálogo: lectura" ON public.catalog_items;
CREATE POLICY "Catálogo: lectura" ON public.catalog_items
    FOR SELECT USING (company_id = public.get_current_user_company_id());
DROP POLICY IF EXISTS "Catálogo: gestión gerencia" ON public.catalog_items;
CREATE POLICY "Catálogo: gestión gerencia" ON public.catalog_items
    FOR ALL
    USING (company_id = public.get_current_user_company_id() AND public.get_current_user_role() = 'manager')
    WITH CHECK (company_id = public.get_current_user_company_id() AND public.get_current_user_role() = 'manager');

DROP POLICY IF EXISTS "Precios de catálogo: lectura" ON public.catalog_item_prices;
CREATE POLICY "Precios de catálogo: lectura" ON public.catalog_item_prices
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM public.catalog_items ci
        WHERE ci.id = catalog_item_id AND ci.company_id = public.get_current_user_company_id()
    ));
DROP POLICY IF EXISTS "Precios de catálogo: gestión gerencia" ON public.catalog_item_prices;
CREATE POLICY "Precios de catálogo: gestión gerencia" ON public.catalog_item_prices
    FOR ALL
    USING (public.get_current_user_role() = 'manager' AND EXISTS (
        SELECT 1 FROM public.catalog_items ci
        WHERE ci.id = catalog_item_id AND ci.company_id = public.get_current_user_company_id()
    ))
    WITH CHECK (
        public.get_current_user_role() = 'manager'
        AND public.is_country_enabled(public.get_current_user_company_id(), country_code)
        AND EXISTS (
            SELECT 1 FROM public.catalog_items ci
            WHERE ci.id = catalog_item_id AND ci.company_id = public.get_current_user_company_id()
        )
    );

-- Usuarios base y gerentes agregan productos a los leads de su CRM
DROP POLICY IF EXISTS "Ítems de leads: acceso del CRM" ON public.lead_items;
CREATE POLICY "Ítems de leads: acceso del CRM" ON public.lead_items
    FOR ALL
    USING (company_id = public.get_current_user_company_id())
    WITH CHECK (company_id = public.get_current_user_company_id());

-- ----------------------------------------------------------------------------
-- 6. Ventas por producto/servicio y distribución por zona (paneles de KPI)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_catalog_sales(
    p_company_id UUID,
    p_countries CHAR(2)[] DEFAULT NULL,
    p_from TIMESTAMPTZ DEFAULT NULL,
    p_to TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
    catalog_item_id UUID,
    item_type VARCHAR(10),
    name VARCHAR(200),
    country_code CHAR(2),
    currency_code CHAR(3),
    leads BIGINT,
    won_leads BIGINT,
    lost_leads BIGINT,
    units_won BIGINT,
    revenue_won NUMERIC,
    pipeline_open NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role'
       AND p_company_id IS DISTINCT FROM public.get_current_user_company_id() THEN
        RAISE EXCEPTION 'Acceso denegado: los datos pertenecen a otro CRM' USING ERRCODE = '42501';
    END IF;

    -- Montos por país (cada uno en su moneda): la consolidación en US$ la hace la aplicación
    RETURN QUERY
    SELECT
        ci.id,
        ci.item_type,
        ci.name,
        l.country_code,
        co.currency_code,
        COUNT(DISTINCT l.id),
        COUNT(DISTINCT l.id) FILTER (WHERE l.commercial_status = 'won'),
        COUNT(DISTINCT l.id) FILTER (WHERE l.commercial_status = 'lost'),
        COALESCE(SUM(li.quantity) FILTER (WHERE l.commercial_status = 'won'), 0)::BIGINT,
        COALESCE(SUM(li.quantity * li.unit_price) FILTER (WHERE l.commercial_status = 'won'), 0),
        COALESCE(SUM(li.quantity * li.unit_price) FILTER (WHERE l.commercial_status NOT IN ('won', 'lost')), 0)
    FROM public.lead_items li
    JOIN public.leads l ON l.id = li.lead_id AND l.company_id = p_company_id
    JOIN public.catalog_items ci ON ci.id = li.catalog_item_id AND ci.company_id = p_company_id
    JOIN public.countries co ON co.code = l.country_code
    WHERE li.company_id = p_company_id
      AND public.is_country_enabled(p_company_id, l.country_code)
      AND (p_countries IS NULL OR l.country_code = ANY (p_countries))
      AND (p_from IS NULL OR l.created_at >= p_from)
      AND (p_to IS NULL OR l.created_at <= p_to)
    GROUP BY ci.id, ci.item_type, ci.name, l.country_code, co.currency_code;
END;
$$;

-- ¿Dónde se vende? Leads que incluyen los ítems indicados, por zona
CREATE OR REPLACE FUNCTION public.get_item_distribution_by_territories(
    p_company_id UUID,
    p_item_ids UUID[],
    p_scope VARCHAR DEFAULT 'won',          -- won | open | all (todos sin perdidos)
    p_countries CHAR(2)[] DEFAULT NULL
)
RETURNS TABLE (
    territory_id UUID,
    country_code CHAR(2),
    territory_name VARCHAR(150),
    lead_count BIGINT,
    total_country_leads BIGINT,
    percentage NUMERIC(5, 2)
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role'
       AND p_company_id IS DISTINCT FROM public.get_current_user_company_id() THEN
        RAISE EXCEPTION 'Acceso denegado: los datos pertenecen a otro CRM' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    WITH matching_leads AS (
        SELECT DISTINCT l.id, l.country_code, l.assigned_territory_id
        FROM public.leads l
        JOIN public.lead_items li ON li.lead_id = l.id AND li.company_id = p_company_id
        WHERE l.company_id = p_company_id
          AND li.catalog_item_id = ANY (p_item_ids)
          AND public.is_country_enabled(p_company_id, l.country_code)
          AND (p_countries IS NULL OR l.country_code = ANY (p_countries))
          AND CASE p_scope
                WHEN 'won' THEN l.commercial_status = 'won'
                WHEN 'open' THEN l.commercial_status NOT IN ('won', 'lost')
                ELSE l.commercial_status <> 'lost'
              END
    ),
    totals AS (
        SELECT ml.country_code, COUNT(*)::BIGINT AS total FROM matching_leads ml GROUP BY ml.country_code
    )
    SELECT
        t.id,
        t.country_code,
        t.name,
        COUNT(ml.id)::BIGINT,
        COALESCE(tt.total, 0),
        CASE WHEN COALESCE(tt.total, 0) = 0 THEN 0.00
             ELSE ROUND(COUNT(ml.id)::NUMERIC / tt.total * 100.0, 2) END
    FROM public.territories t
    LEFT JOIN matching_leads ml ON ml.assigned_territory_id = t.id
    LEFT JOIN totals tt ON tt.country_code = t.country_code
    WHERE t.company_id = p_company_id
      AND (p_countries IS NULL OR t.country_code = ANY (p_countries))
    GROUP BY t.id, t.country_code, t.name, tt.total
    HAVING COUNT(ml.id) > 0
    ORDER BY COUNT(ml.id) DESC;
END;
$$;
