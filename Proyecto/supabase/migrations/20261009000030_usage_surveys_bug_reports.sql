-- ============================================================================
-- 0030 · Uso de la plataforma, encuestas de satisfacción y reportes de errores
-- ============================================================================
-- Para que el administrador de la plataforma sepa si sus clientes usan Revela y cómo les va:
--
--   · login_events: cada ingreso de una persona a su CRM (uno por visita, no más de uno cada 30
--     minutos). Solo el administrador lo lee; lo escribe únicamente record_login(). Se borra a los 13
--     meses. Sirve para contar ingresos y marcar en rojo a quien dejó de entrar.
--   · satisfaction_surveys: la respuesta a "¿qué tan probable es que recomiendes Revela?" (0 a 10) y un
--     comentario opcional. Cada persona ve solo las suyas; el administrador ve todas.
--   · bug_reports: el reporte de un error que envía una persona desde el botón del encabezado. Cada
--     persona ve solo los suyos; el administrador los ve todos y los marca como vistos o resueltos.
--   · admin_usage_by_company() y admin_user_activity(): conteos para el panel del administrador. El
--     administrador no puede leer los leads de un CRM (RLS), así que estas funciones devuelven solo
--     números por CRM y por usuario, nunca un dato de un lead.
--
-- Ninguna guarda datos de los leads. Las encuestas y los reportes traen un aviso para no escribir datos de
-- clientes en el texto.
-- ============================================================================

-- ------------------------------------------------------------------ el usuario es del CRM indicado
CREATE OR REPLACE FUNCTION public.enforce_row_user_company()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = NEW.user_id AND p.company_id = NEW.company_id) THEN
        RAISE EXCEPTION 'Esa persona no pertenece a ese CRM' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_row_user_company() IS
    'Trigger de login_events, satisfaction_surveys y bug_reports: el usuario de la fila debe ser del CRM de la fila.';

REVOKE EXECUTE ON FUNCTION public.enforce_row_user_company() FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------ ingresos
CREATE TABLE IF NOT EXISTS public.login_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);

COMMENT ON TABLE public.login_events IS
    'Ingresos de las personas a su CRM (uno por visita, con al menos 30 minutos entre uno y otro). Solo quién y cuándo: nada de lo que hicieron. Lo escribe record_login() y lo lee el administrador; se borra a los 13 meses.';
COMMENT ON COLUMN public.login_events.company_id IS 'CRM al que ingresó la persona.';
COMMENT ON COLUMN public.login_events.user_id IS 'Persona que ingresó.';
COMMENT ON COLUMN public.login_events.created_at IS 'Cuándo ingresó.';

CREATE INDEX IF NOT EXISTS idx_login_events_user_created ON public.login_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_events_company_created ON public.login_events (company_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_login_events_same_company ON public.login_events;
CREATE TRIGGER trg_login_events_same_company
    BEFORE INSERT ON public.login_events
    FOR EACH ROW EXECUTE FUNCTION public.enforce_row_user_company();

ALTER TABLE public.login_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Ingresos: lectura del administrador" ON public.login_events;
CREATE POLICY "Ingresos: lectura del administrador" ON public.login_events
    FOR SELECT TO authenticated USING (public.is_superadmin());

REVOKE ALL ON public.login_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.login_events TO authenticated;
GRANT ALL ON public.login_events TO service_role;

-- La app la llama al entrar. El administrador no cuenta (no tiene CRM) y una visita dura al menos 30 minutos.
CREATE OR REPLACE FUNCTION public.record_login()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN;
    END IF;
    SELECT p.company_id INTO v_company
    FROM public.profiles p
    WHERE p.id = auth.uid() AND p.is_active AND p.role <> 'superadmin';
    IF v_company IS NULL THEN
        RETURN;
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.login_events e
        WHERE e.user_id = auth.uid() AND e.created_at > NOW() - INTERVAL '30 minutes'
    ) THEN
        RETURN;
    END IF;
    INSERT INTO public.login_events (company_id, user_id) VALUES (v_company, auth.uid());
END;
$$;

COMMENT ON FUNCTION public.record_login() IS
    'Anota que la persona con sesión ingresó a su CRM. Una por visita: si ya hay una en los últimos 30 minutos no agrega otra.';

REVOKE EXECUTE ON FUNCTION public.record_login() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_login() TO authenticated;

-- Los ingresos de más de 13 meses se borran solos
CREATE OR REPLACE FUNCTION public.purge_old_login_events(p_days INTEGER DEFAULT 400)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_borrados INTEGER;
BEGIN
    DELETE FROM public.login_events WHERE created_at < NOW() - make_interval(days => GREATEST(p_days, 30));
    GET DIAGNOSTICS v_borrados = ROW_COUNT;
    RETURN v_borrados;
END;
$$;

COMMENT ON FUNCTION public.purge_old_login_events(INTEGER) IS
    'Borra los ingresos más antiguos que el plazo (13 meses por defecto). La ejecuta pg_cron cada día.';

REVOKE ALL ON FUNCTION public.purge_old_login_events(INTEGER) FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'revela-borrar-ingresos-antiguos';
    PERFORM cron.schedule('revela-borrar-ingresos-antiguos', '30 3 * * *', 'SELECT public.purge_old_login_events(400);');
END;
$$;

-- ------------------------------------------------------------------ encuestas de satisfacción
CREATE TABLE IF NOT EXISTS public.satisfaction_surveys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    score SMALLINT NOT NULL CHECK (score BETWEEN 0 AND 10),
    comment TEXT CHECK (comment IS NULL OR char_length(comment) <= 1000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);

COMMENT ON TABLE public.satisfaction_surveys IS
    'Respuestas a la encuesta de satisfacción (¿qué tan probable es que recomiendes Revela?, de 0 a 10) y su comentario opcional. Cada persona ve las suyas; el administrador ve todas; la gerencia no ve las de su equipo.';
COMMENT ON COLUMN public.satisfaction_surveys.company_id IS 'CRM de la persona que respondió.';
COMMENT ON COLUMN public.satisfaction_surveys.user_id IS 'Persona que respondió.';
COMMENT ON COLUMN public.satisfaction_surveys.score IS 'Probabilidad de recomendar Revela, de 0 (nada probable) a 10 (muy probable).';
COMMENT ON COLUMN public.satisfaction_surveys.comment IS 'Comentario opcional, de hasta 1.000 caracteres. La app pide no escribir datos de clientes.';
COMMENT ON COLUMN public.satisfaction_surveys.created_at IS 'Cuándo respondió.';

CREATE INDEX IF NOT EXISTS idx_satisfaction_surveys_user_created ON public.satisfaction_surveys (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_satisfaction_surveys_company_created ON public.satisfaction_surveys (company_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.limit_survey_frequency()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.satisfaction_surveys s
        WHERE s.user_id = NEW.user_id AND s.created_at > NOW() - INTERVAL '1 day'
    ) THEN
        RAISE EXCEPTION 'Ya respondiste la encuesta hoy. ¡Gracias!';
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.limit_survey_frequency() IS
    'Trigger de satisfaction_surveys: una respuesta por persona al día (evita el envío repetido).';

REVOKE EXECUTE ON FUNCTION public.limit_survey_frequency() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_satisfaction_surveys_same_company ON public.satisfaction_surveys;
CREATE TRIGGER trg_satisfaction_surveys_same_company
    BEFORE INSERT ON public.satisfaction_surveys
    FOR EACH ROW EXECUTE FUNCTION public.enforce_row_user_company();

DROP TRIGGER IF EXISTS trg_satisfaction_surveys_frequency ON public.satisfaction_surveys;
CREATE TRIGGER trg_satisfaction_surveys_frequency
    BEFORE INSERT ON public.satisfaction_surveys
    FOR EACH ROW EXECUTE FUNCTION public.limit_survey_frequency();

ALTER TABLE public.satisfaction_surveys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Encuestas: lectura propia o del administrador" ON public.satisfaction_surveys;
CREATE POLICY "Encuestas: lectura propia o del administrador" ON public.satisfaction_surveys
    FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR public.is_superadmin());

DROP POLICY IF EXISTS "Encuestas: cada persona responde por sí misma" ON public.satisfaction_surveys;
CREATE POLICY "Encuestas: cada persona responde por sí misma" ON public.satisfaction_surveys
    FOR INSERT TO authenticated
    WITH CHECK (
        user_id = auth.uid()
        AND company_id = public.get_current_user_company_id()
        AND public.get_current_user_role() IN ('manager', 'agent')
    );

REVOKE ALL ON public.satisfaction_surveys FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.satisfaction_surveys TO authenticated;
GRANT ALL ON public.satisfaction_surveys TO service_role;

-- ------------------------------------------------------------------ reportes de errores
CREATE TABLE IF NOT EXISTS public.bug_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    description TEXT NOT NULL CHECK (char_length(btrim(description)) BETWEEN 10 AND 2000),
    page VARCHAR(40),
    user_agent VARCHAR(300),
    status VARCHAR(20) NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'seen', 'resolved')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
    resolved_at TIMESTAMPTZ
);

COMMENT ON TABLE public.bug_reports IS
    'Errores que las personas reportan desde el botón del encabezado. Cada persona ve los suyos; el administrador ve todos y los marca como vistos o resueltos.';
COMMENT ON COLUMN public.bug_reports.company_id IS 'CRM de la persona que reporta.';
COMMENT ON COLUMN public.bug_reports.user_id IS 'Persona que reporta.';
COMMENT ON COLUMN public.bug_reports.description IS 'Qué pasó, con sus palabras (de 10 a 2.000 caracteres). La app pide no escribir datos de clientes.';
COMMENT ON COLUMN public.bug_reports.page IS 'Pestaña de la app en que estaba (kpi, kanban, contact…). Nunca la dirección completa.';
COMMENT ON COLUMN public.bug_reports.user_agent IS 'Navegador y sistema de quien reporta, para reproducir el error.';
COMMENT ON COLUMN public.bug_reports.status IS 'new (sin revisar), seen (visto) o resolved (resuelto).';
COMMENT ON COLUMN public.bug_reports.created_at IS 'Cuándo se envió.';
COMMENT ON COLUMN public.bug_reports.resolved_at IS 'Cuándo se marcó como resuelto (lo fija la base).';

CREATE INDEX IF NOT EXISTS idx_bug_reports_status_created ON public.bug_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bug_reports_company_created ON public.bug_reports (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bug_reports_user_created ON public.bug_reports (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.limit_bug_report_frequency()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF (SELECT count(*) FROM public.bug_reports b WHERE b.user_id = NEW.user_id AND b.created_at > NOW() - INTERVAL '1 hour') >= 10 THEN
        RAISE EXCEPTION 'Enviaste varios reportes seguidos. Espera un rato antes de mandar otro.';
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.limit_bug_report_frequency() IS
    'Trigger de bug_reports: hasta 10 reportes por persona por hora (evita el envío en masa).';

REVOKE EXECUTE ON FUNCTION public.limit_bug_report_frequency() FROM PUBLIC, anon, authenticated;

-- Al marcarlo como resuelto la base anota cuándo; si se reabre, lo borra
CREATE OR REPLACE FUNCTION public.set_bug_report_resolution()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.resolved_at := CASE WHEN NEW.status = 'resolved' THEN COALESCE(OLD.resolved_at, NOW()) ELSE NULL END;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_bug_report_resolution() IS
    'Trigger de bug_reports: fija resolved_at al pasar a resuelto y lo borra si se reabre.';

REVOKE EXECUTE ON FUNCTION public.set_bug_report_resolution() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_bug_reports_same_company ON public.bug_reports;
CREATE TRIGGER trg_bug_reports_same_company
    BEFORE INSERT ON public.bug_reports
    FOR EACH ROW EXECUTE FUNCTION public.enforce_row_user_company();

DROP TRIGGER IF EXISTS trg_bug_reports_frequency ON public.bug_reports;
CREATE TRIGGER trg_bug_reports_frequency
    BEFORE INSERT ON public.bug_reports
    FOR EACH ROW EXECUTE FUNCTION public.limit_bug_report_frequency();

DROP TRIGGER IF EXISTS trg_bug_reports_resolution ON public.bug_reports;
CREATE TRIGGER trg_bug_reports_resolution
    BEFORE UPDATE OF status ON public.bug_reports
    FOR EACH ROW EXECUTE FUNCTION public.set_bug_report_resolution();

-- Quién cambió el estado de un reporte, como en el resto de las tablas (0022)
DROP TRIGGER IF EXISTS trg_bug_reports_change_log ON public.bug_reports;
CREATE TRIGGER trg_bug_reports_change_log
    AFTER INSERT OR UPDATE OR DELETE ON public.bug_reports
    FOR EACH ROW EXECUTE FUNCTION public.log_row_change();

ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Reportes: lectura propia o del administrador" ON public.bug_reports;
CREATE POLICY "Reportes: lectura propia o del administrador" ON public.bug_reports
    FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR public.is_superadmin());

DROP POLICY IF EXISTS "Reportes: cada persona reporta por sí misma" ON public.bug_reports;
CREATE POLICY "Reportes: cada persona reporta por sí misma" ON public.bug_reports
    FOR INSERT TO authenticated
    WITH CHECK (
        user_id = auth.uid()
        AND company_id = public.get_current_user_company_id()
        AND public.get_current_user_role() IN ('manager', 'agent')
        AND status = 'new'
    );

DROP POLICY IF EXISTS "Reportes: el administrador los marca" ON public.bug_reports;
CREATE POLICY "Reportes: el administrador los marca" ON public.bug_reports
    FOR UPDATE TO authenticated
    USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

REVOKE ALL ON public.bug_reports FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.bug_reports TO authenticated;
GRANT UPDATE (status) ON public.bug_reports TO authenticated;
GRANT ALL ON public.bug_reports TO service_role;

-- ------------------------------------------------------------------ conteos para el administrador
-- Leads por CRM. "Estancado": un lead que sigue abierto (ni ganado ni perdido) y no tuvo ningún movimiento
-- (edición, contacto registrado ni actividad) en los últimos p_stagnant_days días.
CREATE OR REPLACE FUNCTION public.admin_usage_by_company(p_days INTEGER DEFAULT 30, p_stagnant_days INTEGER DEFAULT 14)
RETURNS TABLE (
    crm_id UUID,
    leads_total BIGINT,
    leads_created BIGINT,
    leads_active BIGINT,
    leads_won BIGINT,
    leads_lost BIGINT,
    leads_stagnant BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_days INTEGER := LEAST(GREATEST(COALESCE(p_days, 30), 1), 365);
    v_stagnant INTEGER := LEAST(GREATEST(COALESCE(p_stagnant_days, 14), 1), 365);
BEGIN
    IF NOT public.is_superadmin() THEN
        RAISE EXCEPTION 'Solo el administrador de la plataforma ve el uso de los CRMs' USING ERRCODE = '42501';
    END IF;
    RETURN QUERY
    SELECT c.id,
           COALESCE(s.total, 0), COALESCE(s.creados, 0), COALESCE(s.abiertos, 0),
           COALESCE(s.ganados, 0), COALESCE(s.perdidos, 0), COALESCE(s.estancados, 0)
    FROM public.companies c
    LEFT JOIN (
        SELECT l.company_id AS crm,
               count(*) AS total,
               count(*) FILTER (WHERE l.created_at >= NOW() - make_interval(days => v_days)) AS creados,
               count(*) FILTER (WHERE l.commercial_status NOT IN ('won', 'lost')) AS abiertos,
               count(*) FILTER (WHERE l.commercial_status = 'won') AS ganados,
               count(*) FILTER (WHERE l.commercial_status = 'lost') AS perdidos,
               count(*) FILTER (
                   WHERE l.commercial_status NOT IN ('won', 'lost')
                     AND GREATEST(l.updated_at, COALESCE(l.last_contacted_at, l.created_at), COALESCE(a.ultima, l.created_at))
                         < NOW() - make_interval(days => v_stagnant)
               ) AS estancados
        FROM public.leads l
        LEFT JOIN LATERAL (SELECT MAX(x.created_at) AS ultima FROM public.lead_activities x WHERE x.lead_id = l.id) a ON TRUE
        GROUP BY l.company_id
    ) s ON s.crm = c.id
    ORDER BY c.name;
END;
$$;

COMMENT ON FUNCTION public.admin_usage_by_company(INTEGER, INTEGER) IS
    'Para el administrador: por CRM, los leads creados en los últimos p_days días y cuántos hay abiertos, ganados, perdidos y estancados. Solo números: nunca un dato de un lead.';

REVOKE EXECUTE ON FUNCTION public.admin_usage_by_company(INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_usage_by_company(INTEGER, INTEGER) TO authenticated;

-- Ingresos por persona. El último ingreso también mira el último inicio de sesión que anotó Supabase Auth,
-- así quien ingresó antes de que existiera login_events no aparece como "nunca ingresó".
CREATE OR REPLACE FUNCTION public.admin_user_activity(p_days INTEGER DEFAULT 30)
RETURNS TABLE (
    person_id UUID,
    logins_period BIGINT,
    logins_total BIGINT,
    last_login_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_days INTEGER := LEAST(GREATEST(COALESCE(p_days, 30), 1), 365);
BEGIN
    IF NOT public.is_superadmin() THEN
        RAISE EXCEPTION 'Solo el administrador de la plataforma ve los ingresos de los usuarios' USING ERRCODE = '42501';
    END IF;
    RETURN QUERY
    SELECT p.id,
           COALESCE(e.periodo, 0),
           COALESCE(e.total, 0),
           GREATEST(e.ultimo, u.last_sign_in_at)
    FROM public.profiles p
    LEFT JOIN auth.users u ON u.id = p.id
    LEFT JOIN (
        SELECT le.user_id AS persona,
               count(*) FILTER (WHERE le.created_at >= NOW() - make_interval(days => v_days)) AS periodo,
               count(*) AS total,
               MAX(le.created_at) AS ultimo
        FROM public.login_events le
        GROUP BY le.user_id
    ) e ON e.persona = p.id
    WHERE p.role <> 'superadmin'
    ORDER BY p.created_at;
END;
$$;

COMMENT ON FUNCTION public.admin_user_activity(INTEGER) IS
    'Para el administrador: por persona, sus ingresos en los últimos p_days días, en total y la fecha del último. Solo números y fechas.';

REVOKE EXECUTE ON FUNCTION public.admin_user_activity(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_user_activity(INTEGER) TO authenticated;
