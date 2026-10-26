-- ============================================================================
-- 0031 · Presupuesto mensual del asistente de IA
-- ============================================================================
-- El asistente usa la clave de OpenAI del cliente y cada consulta cuesta dinero. Cada CRM tiene un
-- presupuesto mensual en dólares (30 por defecto) que la gerencia ajusta desde la configuración del chat;
-- el servidor mide lo que gasta cada consulta y deja de responder cuando se alcanza.
--
--   · company_ai_settings: el presupuesto mensual de cada CRM. Sin fila vale el predeterminado (US$30).
--   · ai_usage_monthly: lo gastado en el mes (consultas, tokens y dólares), una fila por CRM y mes.
--
-- Las dos las escribe únicamente el servidor (clave secreta de Supabase), con las funciones set_company_ai_budget
-- (solo a nombre de la gerencia del CRM, y queda en change_log) y record_ai_usage: ninguna persona con sesión
-- puede borrar su gasto ni cambiarse el tope directo contra la base. Cada persona del CRM puede leer las de su
-- CRM (el chat muestra cuánto se lleva gastado) y el administrador las de todos.
-- ============================================================================

-- ------------------------------------------------------------------ presupuesto
CREATE TABLE IF NOT EXISTS public.company_ai_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
    monthly_budget_usd NUMERIC(8, 2) NOT NULL DEFAULT 30 CHECK (monthly_budget_usd >= 0 AND monthly_budget_usd <= 1000),
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);

COMMENT ON TABLE public.company_ai_settings IS
    'Presupuesto mensual del asistente de IA de cada CRM, en dólares. Sin fila vale el predeterminado (US$30). Lo escribe solo el servidor; 0 apaga el asistente.';
COMMENT ON COLUMN public.company_ai_settings.company_id IS 'CRM al que pertenece el presupuesto.';
COMMENT ON COLUMN public.company_ai_settings.monthly_budget_usd IS 'Tope de gasto en el mes, en dólares (de 0 a 1.000). Al alcanzarlo el asistente deja de responder hasta el mes siguiente o hasta que la gerencia lo suba.';
COMMENT ON COLUMN public.company_ai_settings.updated_by IS 'Quien lo cambió por última vez (la gerencia del CRM).';
COMMENT ON COLUMN public.company_ai_settings.updated_at IS 'Cuándo se cambió por última vez.';

-- Quien cambia el presupuesto debe ser del mismo CRM (los CRMs nunca se mezclan)
CREATE OR REPLACE FUNCTION public.enforce_ai_settings_updater_company()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.updated_by IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = NEW.updated_by AND p.company_id = NEW.company_id) THEN
        RAISE EXCEPTION 'Esa persona no pertenece a ese CRM' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_ai_settings_updater_company() IS
    'Trigger de company_ai_settings: quien cambió el presupuesto debe ser del CRM de la fila.';

REVOKE EXECUTE ON FUNCTION public.enforce_ai_settings_updater_company() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_company_ai_settings_same_company ON public.company_ai_settings;
CREATE TRIGGER trg_company_ai_settings_same_company
    BEFORE INSERT OR UPDATE ON public.company_ai_settings
    FOR EACH ROW EXECUTE FUNCTION public.enforce_ai_settings_updater_company();

CREATE INDEX IF NOT EXISTS idx_company_ai_settings_updated_by ON public.company_ai_settings (updated_by);

ALTER TABLE public.company_ai_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Presupuesto de IA: lectura del CRM" ON public.company_ai_settings;
CREATE POLICY "Presupuesto de IA: lectura del CRM" ON public.company_ai_settings
    FOR SELECT TO authenticated
    USING (company_id = public.get_current_user_company_id() OR public.is_superadmin());

REVOKE ALL ON public.company_ai_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.company_ai_settings TO authenticated;
GRANT ALL ON public.company_ai_settings TO service_role;

-- El servidor cambia el presupuesto con esta función, nunca escribiendo la tabla a mano. Así la base misma
-- exige que quien cambia sea gerente activo de ese CRM, y el cambio queda en change_log con su nombre:
-- el trigger log_row_change no sirve aquí porque el servidor escribe con la clave secreta, sin sesión de persona.
CREATE OR REPLACE FUNCTION public.set_company_ai_budget(
    p_company_id UUID,
    p_user_id UUID,
    p_budget_usd NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rol TEXT;
    v_anterior NUMERIC;
    v_id UUID;
BEGIN
    SELECT p.role::text INTO v_rol
    FROM public.profiles p
    WHERE p.id = p_user_id AND p.company_id = p_company_id AND p.is_active;
    IF v_rol IS DISTINCT FROM 'manager' THEN
        RAISE EXCEPTION 'Solo la gerencia del CRM puede cambiar el presupuesto de IA' USING ERRCODE = '42501';
    END IF;
    IF p_budget_usd IS NULL OR p_budget_usd < 0 OR p_budget_usd > 1000 THEN
        RAISE EXCEPTION 'El presupuesto de IA debe estar entre US$ 0 y US$ 1.000 al mes' USING ERRCODE = '23514';
    END IF;

    SELECT s.monthly_budget_usd INTO v_anterior FROM public.company_ai_settings s WHERE s.company_id = p_company_id;

    INSERT INTO public.company_ai_settings (company_id, monthly_budget_usd, updated_by, updated_at)
    VALUES (p_company_id, p_budget_usd, p_user_id, TIMEZONE('utc'::text, NOW()))
    ON CONFLICT (company_id) DO UPDATE SET
        monthly_budget_usd = EXCLUDED.monthly_budget_usd,
        updated_by = EXCLUDED.updated_by,
        updated_at = EXCLUDED.updated_at
    RETURNING id INTO v_id;

    -- Solo nombres de columnas, nunca valores (igual que log_row_change)
    IF v_anterior IS DISTINCT FROM p_budget_usd THEN
        INSERT INTO public.change_log (company_id, table_name, row_id, operation, changed_columns, actor_id, actor_role)
        VALUES (p_company_id, 'company_ai_settings', v_id::text,
                CASE WHEN v_anterior IS NULL THEN 'INSERT' ELSE 'UPDATE' END,
                CASE WHEN v_anterior IS NULL THEN '{}'::text[] ELSE ARRAY['monthly_budget_usd'] END,
                p_user_id, v_rol);
    END IF;
    RETURN p_budget_usd;
END;
$$;

COMMENT ON FUNCTION public.set_company_ai_budget(UUID, UUID, NUMERIC) IS
    'Cambia el presupuesto mensual de IA de un CRM. Solo la ejecuta el servidor (clave secreta), a nombre de una persona que debe ser gerente activo de ese CRM; el cambio queda en change_log.';

REVOKE ALL ON FUNCTION public.set_company_ai_budget(UUID, UUID, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_company_ai_budget(UUID, UUID, NUMERIC) TO service_role;

-- ------------------------------------------------------------------ gasto del mes
CREATE TABLE IF NOT EXISTS public.ai_usage_monthly (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    month DATE NOT NULL,
    requests INTEGER NOT NULL DEFAULT 0 CHECK (requests >= 0),
    input_tokens BIGINT NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
    cached_input_tokens BIGINT NOT NULL DEFAULT 0 CHECK (cached_input_tokens >= 0),
    output_tokens BIGINT NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
    cost_usd NUMERIC(12, 6) NOT NULL DEFAULT 0 CHECK (cost_usd >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
    CONSTRAINT ai_usage_monthly_unica UNIQUE (company_id, month)
);

COMMENT ON TABLE public.ai_usage_monthly IS
    'Lo que gastó el asistente de IA de cada CRM en cada mes: llamadas al modelo, tokens y dólares, calculados con el precio del modelo. Solo números: nada de lo conversado. Lo escribe solo el servidor.';
COMMENT ON COLUMN public.ai_usage_monthly.company_id IS 'CRM que hizo el gasto.';
COMMENT ON COLUMN public.ai_usage_monthly.month IS 'Primer día del mes (UTC), el mismo ciclo con que cobra OpenAI.';
COMMENT ON COLUMN public.ai_usage_monthly.requests IS 'Llamadas al modelo en el mes (una consulta del chat puede hacer varias).';
COMMENT ON COLUMN public.ai_usage_monthly.input_tokens IS 'Tokens de entrada, incluidos los que el modelo ya tenía en caché.';
COMMENT ON COLUMN public.ai_usage_monthly.cached_input_tokens IS 'De los de entrada, los que salieron del caché de OpenAI (cuestan una décima parte).';
COMMENT ON COLUMN public.ai_usage_monthly.output_tokens IS 'Tokens de salida, incluidos los de razonamiento del modelo.';
COMMENT ON COLUMN public.ai_usage_monthly.cost_usd IS 'Costo estimado en dólares, con el precio publicado del modelo.';
COMMENT ON COLUMN public.ai_usage_monthly.updated_at IS 'Última vez que se sumó una llamada.';

CREATE INDEX IF NOT EXISTS idx_ai_usage_monthly_month ON public.ai_usage_monthly (month);

ALTER TABLE public.ai_usage_monthly ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Gasto de IA: lectura del CRM" ON public.ai_usage_monthly;
CREATE POLICY "Gasto de IA: lectura del CRM" ON public.ai_usage_monthly
    FOR SELECT TO authenticated
    USING (company_id = public.get_current_user_company_id() OR public.is_superadmin());

REVOKE ALL ON public.ai_usage_monthly FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ai_usage_monthly TO authenticated;
GRANT ALL ON public.ai_usage_monthly TO service_role;

-- El servidor suma cada llamada con esta función: un solo paso atómico, así dos consultas a la vez no se pisan
CREATE OR REPLACE FUNCTION public.record_ai_usage(
    p_company_id UUID,
    p_input_tokens BIGINT,
    p_cached_input_tokens BIGINT,
    p_output_tokens BIGINT,
    p_cost_usd NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.ai_usage_monthly (company_id, month, requests, input_tokens, cached_input_tokens, output_tokens, cost_usd)
    VALUES (p_company_id, date_trunc('month', NOW() AT TIME ZONE 'UTC')::date, 1,
            GREATEST(p_input_tokens, 0), GREATEST(p_cached_input_tokens, 0), GREATEST(p_output_tokens, 0), GREATEST(p_cost_usd, 0))
    ON CONFLICT (company_id, month) DO UPDATE SET
        requests = public.ai_usage_monthly.requests + 1,
        input_tokens = public.ai_usage_monthly.input_tokens + EXCLUDED.input_tokens,
        cached_input_tokens = public.ai_usage_monthly.cached_input_tokens + EXCLUDED.cached_input_tokens,
        output_tokens = public.ai_usage_monthly.output_tokens + EXCLUDED.output_tokens,
        cost_usd = public.ai_usage_monthly.cost_usd + EXCLUDED.cost_usd,
        updated_at = TIMEZONE('utc'::text, NOW());
END;
$$;

COMMENT ON FUNCTION public.record_ai_usage(UUID, BIGINT, BIGINT, BIGINT, NUMERIC) IS
    'Suma una llamada al modelo al gasto del mes del CRM. Solo la ejecuta el servidor (clave secreta): nadie con sesión puede descontarse el gasto.';

REVOKE ALL ON FUNCTION public.record_ai_usage(UUID, BIGINT, BIGINT, BIGINT, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_ai_usage(UUID, BIGINT, BIGINT, BIGINT, NUMERIC) TO service_role;
