-- ============================================================================
-- 0022 · Las reglas de cada perfil y el registro de cambios, en la base
-- ============================================================================
-- Con Supabase el navegador habla directo con la base: lo que la app solo oculta en pantalla, un
-- usuario con la consola del navegador lo puede hacer igual. La revisión de seguridad del 27-09-2026
-- (scripts/sql/prueba-ataques-remota.sql, contra el CRM "Revela Pruebas") encontró 12 operaciones
-- que la base dejaba pasar. Esta migración las cierra:
--
--   1. Usuario base (invariante 4 de CLAUDE.md): solo AVANZA leads en el pipeline. No retrocede
--      etapas ni cambia monto, moneda, zona, empresa cliente, país ni origen del dato; los
--      productos y las personas de un lead ajeno tampoco (sí las del que capturó, y sí puede
--      agregar una persona a cualquier lead desde el registro de contacto).
--   2. El autor de un lead es quien lo crea (created_by = auth.uid()), no lo que diga la solicitud.
--   3. recalculate_lead_value() deja de estar en la API: la usa solo el trigger de lead_items.
--   4. lead_is_blocked() solo responde por leads del propio CRM.
--   5. Las zonas oficiales ya no las edita ni borra gerencia (vienen del catálogo, 0020).
--   6. change_log: la base registra quién cambió qué columna de qué fila, aunque el cambio no pase
--      por la app (el historial de la app, audit_log, lo escribe el navegador y se puede omitir).
--      Guarda NOMBRES de columnas, nunca valores (invariante 5): no tiene datos personales.
--
-- Las reglas se saltan para los cambios que hace la propia base en cadena (pg_trigger_depth() > 1:
-- recálculo del valor, espejo del contacto principal), para las tareas sin sesión (pg_cron,
-- migraciones, servidor con la clave secreta) y dentro de la anonimización.
-- ============================================================================

-- ------------------------------------------------------------------ 1. etapas del pipeline
CREATE OR REPLACE FUNCTION public.lead_stage_rank(p_status VARCHAR)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
    SELECT array_position(ARRAY['new', 'contacted', 'qualified', 'proposal', 'pending_payment', 'won', 'lost']::TEXT[], p_status::TEXT);
$$;

COMMENT ON FUNCTION public.lead_stage_rank(VARCHAR) IS
    'Posición de una etapa en el embudo (1 = nuevo … 7 = perdido). Retroceder es ir a una posición menor. Igual que STAGE_ORDER en src/lib/tenantGuards.ts.';

-- ------------------------------------------------------------------ 2. reglas del usuario base en leads
CREATE OR REPLACE FUNCTION public.leads_enforce_role_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL OR pg_trigger_depth() > 1 OR public.privacy_bypass_active() THEN
        RETURN NEW;
    END IF;

    -- El lead queda a nombre de quien lo crea
    IF TG_OP = 'INSERT' THEN
        NEW.created_by := auth.uid();
        RETURN NEW;
    END IF;

    IF public.get_current_user_role() IS DISTINCT FROM 'agent' THEN
        RETURN NEW;
    END IF;

    IF NEW.commercial_status IS DISTINCT FROM OLD.commercial_status
       AND COALESCE(public.lead_stage_rank(NEW.commercial_status), 0) <= COALESCE(public.lead_stage_rank(OLD.commercial_status), 0) THEN
        RAISE EXCEPTION 'Tu perfil solo avanza leads en el pipeline: retroceder un lead es de gerencia.' USING ERRCODE = '42501';
    END IF;

    IF NEW.estimated_deal_value IS DISTINCT FROM OLD.estimated_deal_value
       OR NEW.currency_code IS DISTINCT FROM OLD.currency_code
       OR NEW.value_source IS DISTINCT FROM OLD.value_source
       OR NEW.client_account_id IS DISTINCT FROM OLD.client_account_id
       OR NEW.assigned_territory_id IS DISTINCT FROM OLD.assigned_territory_id
       OR NEW.country_code IS DISTINCT FROM OLD.country_code
       OR NEW.data_origin IS DISTINCT FROM OLD.data_origin
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION 'El monto, la moneda, la zona, la empresa cliente, el país y el origen de un lead los cambia gerencia.' USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.leads_enforce_role_rules() IS
    'Firma el autor de cada lead nuevo y aplica al usuario base sus límites: solo avanza etapas y no cambia monto, moneda, zona, empresa cliente, país ni origen.';

-- El nombre hace que corra después de los demás BEFORE (se ejecutan en orden alfabético): así compara
-- el valor ya recalculado por trg_leads_value_source.
DROP TRIGGER IF EXISTS trg_leads_verify_role_rules ON public.leads;
CREATE TRIGGER trg_leads_verify_role_rules
    BEFORE INSERT OR UPDATE ON public.leads
    FOR EACH ROW EXECUTE FUNCTION public.leads_enforce_role_rules();

-- ------------------------------------------------------------------ 3. productos y personas de leads ajenos
CREATE OR REPLACE FUNCTION public.lead_children_enforce_role_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_propio BOOLEAN;
BEGIN
    IF auth.uid() IS NULL OR pg_trigger_depth() > 1 OR public.privacy_bypass_active()
       OR public.get_current_user_role() IS DISTINCT FROM 'agent' THEN
        RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;

    -- Agregar una persona a cualquier lead es parte del registro de contacto
    IF TG_TABLE_NAME = 'lead_contacts' AND TG_OP = 'INSERT' THEN
        RETURN NEW;
    END IF;

    SELECT bool_and(l.created_by = auth.uid()) INTO v_propio
    FROM public.leads l
    WHERE l.id IN (
        CASE WHEN TG_OP = 'DELETE' THEN OLD.lead_id ELSE NEW.lead_id END,
        CASE WHEN TG_OP = 'UPDATE' THEN OLD.lead_id ELSE NULL END
    );
    IF NOT COALESCE(v_propio, FALSE) THEN
        RAISE EXCEPTION 'Los productos y las personas de un lead los edita gerencia o quien lo capturó.' USING ERRCODE = '42501';
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

COMMENT ON FUNCTION public.lead_children_enforce_role_rules() IS
    'El usuario base solo cambia productos (lead_items) y personas (lead_contacts) de los leads que capturó; agregar una persona a cualquier lead sí puede.';

DROP TRIGGER IF EXISTS trg_lead_items_role_rules ON public.lead_items;
CREATE TRIGGER trg_lead_items_role_rules
    BEFORE INSERT OR UPDATE OR DELETE ON public.lead_items
    FOR EACH ROW EXECUTE FUNCTION public.lead_children_enforce_role_rules();

DROP TRIGGER IF EXISTS trg_lead_contacts_role_rules ON public.lead_contacts;
CREATE TRIGGER trg_lead_contacts_role_rules
    BEFORE INSERT OR UPDATE OR DELETE ON public.lead_contacts
    FOR EACH ROW EXECUTE FUNCTION public.lead_children_enforce_role_rules();

-- ------------------------------------------------------------------ 4. funciones que no validaban el CRM
-- Solo la usa trg_lead_items_recalculate(), que corre como dueño: la API no la necesita
REVOKE EXECUTE ON FUNCTION public.recalculate_lead_value(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.lead_is_blocked(p_lead_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.lead_privacy_requests r
        JOIN public.leads l ON l.id = r.lead_id
        WHERE r.lead_id = p_lead_id
          AND r.status = 'pending'
          -- Solo por leads del propio CRM; sin sesión (tareas del sistema) responde siempre
          AND (auth.uid() IS NULL OR l.company_id = public.get_current_user_company_id() OR public.is_superadmin())
    );
$$;

COMMENT ON FUNCTION public.lead_is_blocked(UUID) IS
    'Si el lead tiene una solicitud del titular pendiente (art. 8 ter). Solo responde por leads del propio CRM.';

-- ------------------------------------------------------------------ 5. zonas oficiales
DROP POLICY IF EXISTS "Territorios: gestión gerencia" ON public.territories;
REVOKE INSERT, UPDATE, DELETE ON public.territories FROM authenticated;

-- ------------------------------------------------------------------ 6. registro de cambios de la base
CREATE TABLE IF NOT EXISTS public.change_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    table_name VARCHAR(60) NOT NULL,
    row_id VARCHAR(80),
    operation VARCHAR(10) NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
    changed_columns TEXT[] NOT NULL DEFAULT '{}',
    actor_id UUID,
    actor_role VARCHAR(20),
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);

COMMENT ON TABLE public.change_log IS
    'Registro de cambios que escribe la propia base: quién cambió qué columnas de qué fila y cuándo, aunque el cambio no pase por la app. Solo nombres de columnas, nunca valores (sin datos personales). Nadie lo edita ni lo borra.';
COMMENT ON COLUMN public.change_log.company_id IS 'CRM al que pertenece la fila cambiada (NULL: cambios de la plataforma).';
COMMENT ON COLUMN public.change_log.table_name IS 'Tabla de la fila cambiada.';
COMMENT ON COLUMN public.change_log.row_id IS 'Identificador de la fila (id, o su clave compuesta como texto).';
COMMENT ON COLUMN public.change_log.operation IS 'INSERT, UPDATE o DELETE.';
COMMENT ON COLUMN public.change_log.changed_columns IS 'En un UPDATE, las columnas que cambiaron (solo sus nombres). Vacío en INSERT y DELETE.';
COMMENT ON COLUMN public.change_log.actor_id IS 'Usuario con sesión que hizo el cambio (auth.uid()). Sin FK: el registro sobrevive al usuario.';
COMMENT ON COLUMN public.change_log.actor_role IS 'Perfil de ese usuario al momento del cambio.';

CREATE INDEX IF NOT EXISTS idx_change_log_company_created ON public.change_log (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_change_log_row ON public.change_log (table_name, row_id);

ALTER TABLE public.change_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Registro de cambios: lectura gerencia" ON public.change_log;
CREATE POLICY "Registro de cambios: lectura gerencia" ON public.change_log
    FOR SELECT TO authenticated
    USING (
        (company_id = public.get_current_user_company_id() AND public.get_current_user_role() = 'manager')
        OR public.is_superadmin()
    );

-- Solo lectura para quien tiene sesión: lo escribe únicamente el trigger (como dueño)
REVOKE ALL ON public.change_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.change_log TO authenticated;
GRANT ALL ON public.change_log TO service_role;

CREATE OR REPLACE FUNCTION public.log_row_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_new JSONB := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END;
    v_old JSONB := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END;
    v_fila JSONB;
    v_columnas TEXT[] := '{}';
    v_company UUID;
    v_row_id TEXT;
BEGIN
    -- Solo cambios de personas con sesión: las tareas del sistema firman en audit_log
    IF auth.uid() IS NULL THEN
        RETURN NULL;
    END IF;
    v_fila := COALESCE(v_new, v_old);

    IF TG_OP = 'UPDATE' THEN
        SELECT COALESCE(array_agg(k ORDER BY k), '{}') INTO v_columnas
        FROM jsonb_object_keys(v_new) AS k
        WHERE k <> 'updated_at' AND (v_new -> k) IS DISTINCT FROM (v_old -> k);
        IF cardinality(v_columnas) = 0 THEN
            RETURN NULL;
        END IF;
    END IF;

    v_company := CASE TG_TABLE_NAME
        WHEN 'companies' THEN (v_fila ->> 'id')::UUID
        WHEN 'catalog_item_prices' THEN (SELECT ci.company_id FROM public.catalog_items ci WHERE ci.id = (v_fila ->> 'catalog_item_id')::UUID)
        ELSE (v_fila ->> 'company_id')::UUID
    END;
    -- Al borrar un CRM, sus filas se van en cascada: basta con registrar el borrado del CRM
    IF v_company IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.id = v_company) THEN
        IF TG_TABLE_NAME <> 'companies' THEN
            RETURN NULL;
        END IF;
        v_company := NULL;
    END IF;
    v_row_id := COALESCE(
        v_fila ->> 'id',
        CASE TG_TABLE_NAME
            WHEN 'catalog_item_prices' THEN (v_fila ->> 'catalog_item_id') || ':' || (v_fila ->> 'country_code')
            WHEN 'company_countries' THEN (v_fila ->> 'company_id') || ':' || (v_fila ->> 'country_code')
        END
    );

    INSERT INTO public.change_log (company_id, table_name, row_id, operation, changed_columns, actor_id, actor_role)
    VALUES (v_company, TG_TABLE_NAME, v_row_id, TG_OP, v_columnas, auth.uid(), public.get_current_user_role());
    RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.log_row_change() IS
    'Escribe en change_log quién cambió qué columnas de una fila. Corre como dueño porque nadie más puede escribir ahí.';

REVOKE EXECUTE ON FUNCTION public.log_row_change() FROM PUBLIC, anon, authenticated;

-- Tablas que cambian las personas. Las zonas quedan fuera: son de referencia y al crear un CRM se
-- copian miles de una vez.
DO $$
DECLARE
    v_tabla TEXT;
BEGIN
    FOREACH v_tabla IN ARRAY ARRAY[
        'leads', 'lead_contacts', 'lead_items', 'lead_activities', 'lead_privacy_requests',
        'client_accounts', 'catalog_items', 'catalog_item_prices', 'pipeline_stage_configs',
        'profiles', 'companies', 'company_countries'
    ] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_' || v_tabla || '_change_log', v_tabla);
        EXECUTE format(
            'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.log_row_change()',
            'trg_' || v_tabla || '_change_log', v_tabla);
    END LOOP;
END;
$$;
