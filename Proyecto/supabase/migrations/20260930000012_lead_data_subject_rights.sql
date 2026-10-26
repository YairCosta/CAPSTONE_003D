-- ============================================================================
-- 0012 · Derechos del titular (Ley 19.628 modificada por la Ley 21.719)
-- ============================================================================
-- Lleva a la base las reglas que hasta ahora vivían solo en la aplicación
-- (src/lib/privacy.ts y src/lib/tenantGuards.ts). La base es la garantía real:
--
--   1. Origen del dato y base para guardarlo, por lead.
--   2. Solicitudes del titular: las registra cualquier perfil, solo gerencia las resuelve.
--   3. Bloqueo (art. 8 ter): con una solicitud pendiente, el lead no se edita ni admite
--      nuevos contactos.
--   4. Supresión (art. 7) como anonimización: borra datos personales en el lead, sus
--      contactos, su bitácora y la caché de geocodificación; conserva la operación.
--   5. Prospectos sin contactar en 30 días: se anonimizan solos (pg_cron).
--   6. La auditoría nunca guarda valores personales (opción A, docs/AUDITORIA.md).
--   7. Permisos explícitos: el proyecto no expone tablas automáticamente, así que
--      se concede acceso solo a usuarios con sesión (authenticated), nunca a anon.
--
-- Todo es aditivo: columnas opcionales, tabla nueva y triggers. Los leads existentes
-- quedan con base "sin registro" (NULL): no se inventa evidencia con fecha anterior.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Origen, base y estado de privacidad del lead
-- ---------------------------------------------------------------------------
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS data_origin VARCHAR(20);
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS consent_status VARCHAR(20);
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS consent_at TIMESTAMPTZ;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS no_contact BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS anonymized_at TIMESTAMPTZ;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS anonymized_reason VARCHAR(20);

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_data_origin_valid;
ALTER TABLE public.leads ADD CONSTRAINT leads_data_origin_valid
    CHECK (data_origin IS NULL OR data_origin IN ('form', 'call', 'event', 'referral', 'public', 'ai'));

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_consent_status_valid;
ALTER TABLE public.leads ADD CONSTRAINT leads_consent_status_valid
    CHECK (consent_status IS NULL OR consent_status IN ('inquiry', 'granted', 'not_requested', 'refused', 'withdrawn'));

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_anonymized_reason_valid;
ALTER TABLE public.leads ADD CONSTRAINT leads_anonymized_reason_valid
    CHECK (anonymized_reason IS NULL OR anonymized_reason IN ('request', 'retention'));

-- Anonimizado y motivo van siempre juntos
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_anonymized_consistent;
ALTER TABLE public.leads ADD CONSTRAINT leads_anonymized_consistent
    CHECK ((anonymized_at IS NULL) = (anonymized_reason IS NULL));

-- Busca rápido los prospectos que pueden vencer
CREATE INDEX IF NOT EXISTS idx_leads_pending_prospects
    ON public.leads (company_id, consent_at)
    WHERE consent_status = 'not_requested' AND anonymized_at IS NULL;

COMMENT ON COLUMN public.leads.data_origin IS
    'De dónde salió el dato: form, call, event, referral, public o ai (asistente). NULL = sin registro (lead anterior a 0012).';
COMMENT ON COLUMN public.leads.consent_status IS
    'Base para guardar el dato: inquiry (nos contactó o cotizó), granted (autorizó), not_requested (prospecto, se pregunta en el primer contacto), refused o withdrawn.';
COMMENT ON COLUMN public.leads.consent_at IS 'Cuándo se registró la base o la respuesta del titular. Desde aquí corre el plazo del prospecto.';
COMMENT ON COLUMN public.leads.no_contact IS 'El titular se opuso a ser contactado (art. 8): fuera de agenda, contacto y asistente.';
COMMENT ON COLUMN public.leads.anonymized_at IS 'Cuándo se borraron sus datos personales (art. 7). Una vez fijado, no vuelve atrás.';
COMMENT ON COLUMN public.leads.anonymized_reason IS 'request = a pedido del titular; retention = prospecto sin contactar dentro del plazo.';

-- ---------------------------------------------------------------------------
-- 2. Solicitudes del titular
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lead_privacy_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    reason VARCHAR(20) NOT NULL CHECK (reason IN ('erasure', 'no_consent', 'wrong_data', 'other')),
    detail TEXT,
    requested_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    requested_by_name VARCHAR(200) NOT NULL,
    requested_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    decided_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    decided_by_name VARCHAR(200),
    decided_at TIMESTAMPTZ,
    decision_note TEXT,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    CONSTRAINT lead_privacy_requests_other_needs_detail
        CHECK (reason <> 'other' OR LENGTH(BTRIM(COALESCE(detail, ''))) > 0),
    CONSTRAINT lead_privacy_requests_decision_consistent
        CHECK ((status = 'pending') = (decided_at IS NULL))
);

-- Una sola solicitud pendiente por lead
CREATE UNIQUE INDEX IF NOT EXISTS uq_lead_privacy_requests_pending
    ON public.lead_privacy_requests (lead_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_lead_privacy_requests_company
    ON public.lead_privacy_requests (company_id, status, requested_at DESC);

COMMENT ON TABLE public.lead_privacy_requests IS
    'Solicitudes del titular sobre sus datos (supresión, oposición, datos erróneos). Cualquier perfil del CRM las registra; solo gerencia las resuelve con resolve_lead_privacy_request(). Mientras están pendientes, el lead queda bloqueado (art. 8 ter). No se editan ni se borran: se resuelven.';

ALTER TABLE public.lead_privacy_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Solicitudes: lectura del propio CRM" ON public.lead_privacy_requests;
CREATE POLICY "Solicitudes: lectura del propio CRM" ON public.lead_privacy_requests
    FOR SELECT USING (company_id = public.get_current_user_company_id());

-- Se registran pendientes y a nombre de quien las registra. Resolver no pasa por aquí.
DROP POLICY IF EXISTS "Solicitudes: registro del propio CRM" ON public.lead_privacy_requests;
CREATE POLICY "Solicitudes: registro del propio CRM" ON public.lead_privacy_requests
    FOR INSERT WITH CHECK (
        company_id = public.get_current_user_company_id()
        AND requested_by = auth.uid()
        AND status = 'pending'
    );

-- Quién la registró y a qué CRM pertenece los fija la base, no el cliente
CREATE OR REPLACE FUNCTION public.lead_privacy_requests_before_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_lead public.leads%ROWTYPE;
BEGIN
    SELECT * INTO v_lead FROM public.leads WHERE id = NEW.lead_id;
    IF NOT FOUND OR v_lead.company_id <> NEW.company_id THEN
        RAISE EXCEPTION 'El lead no pertenece a este CRM.' USING ERRCODE = '42501';
    END IF;
    IF v_lead.anonymized_at IS NOT NULL THEN
        RAISE EXCEPTION 'Los datos de este titular ya fueron eliminados.' USING ERRCODE = '23514';
    END IF;
    SELECT p.full_name INTO NEW.requested_by_name FROM public.profiles p WHERE p.id = NEW.requested_by;
    NEW.requested_by_name := COALESCE(NEW.requested_by_name, 'Sin identificar');
    NEW.requested_at := TIMEZONE('utc'::text, NOW());
    NEW.status := 'pending';
    NEW.decided_by := NULL;
    NEW.decided_by_name := NULL;
    NEW.decided_at := NULL;
    NEW.decision_note := NULL;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lead_privacy_requests_before_insert ON public.lead_privacy_requests;
CREATE TRIGGER trg_lead_privacy_requests_before_insert
    BEFORE INSERT ON public.lead_privacy_requests
    FOR EACH ROW EXECUTE FUNCTION public.lead_privacy_requests_before_insert();

DROP TRIGGER IF EXISTS trg_lead_privacy_requests_updated_at ON public.lead_privacy_requests;
CREATE TRIGGER trg_lead_privacy_requests_updated_at
    BEFORE UPDATE ON public.lead_privacy_requests
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Bloqueo y no re-identificación (reglas de la base, no solo de la app)
-- ---------------------------------------------------------------------------
-- Las funciones de este archivo que SÍ pueden tocar un lead bloqueado o anonimizado
-- activan esta marca solo durante su transacción. Un cliente de la API no puede fijarla:
-- set_config no está expuesto por PostgREST.
CREATE OR REPLACE FUNCTION public.privacy_bypass_active()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT COALESCE(current_setting('revela.privacy_bypass', TRUE), '') = 'on';
$$;

CREATE OR REPLACE FUNCTION public.lead_is_blocked(p_lead_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.lead_privacy_requests r
        WHERE r.lead_id = p_lead_id AND r.status = 'pending'
    );
$$;

CREATE OR REPLACE FUNCTION public.leads_enforce_privacy()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF public.privacy_bypass_active() THEN
        RETURN NEW;
    END IF;

    -- Art. 8 ter: con una solicitud pendiente, el lead no se toca
    IF public.lead_is_blocked(OLD.id) THEN
        RAISE EXCEPTION 'Lead bloqueado: hay una solicitud del titular pendiente de resolver.' USING ERRCODE = '42501';
    END IF;

    -- La anonimización solo la fijan las funciones de este archivo
    IF NEW.anonymized_at IS DISTINCT FROM OLD.anonymized_at
        OR NEW.anonymized_reason IS DISTINCT FROM OLD.anonymized_reason THEN
        RAISE EXCEPTION 'La anonimización no se edita directamente.' USING ERRCODE = '42501';
    END IF;

    -- Un titular anonimizado no se re-identifica ni vuelve a quedar contactable
    IF OLD.anonymized_at IS NOT NULL AND (
        NEW.full_name IS DISTINCT FROM OLD.full_name
        OR NEW.email IS DISTINCT FROM OLD.email
        OR NEW.phone IS DISTINCT FROM OLD.phone
        OR NEW.job_title IS DISTINCT FROM OLD.job_title
        OR NEW.notes IS DISTINCT FROM OLD.notes
        OR NEW.raw_address IS DISTINCT FROM OLD.raw_address
        OR NEW.normalized_address IS DISTINCT FROM OLD.normalized_address
        OR NEW.latitude IS DISTINCT FROM OLD.latitude
        OR NEW.longitude IS DISTINCT FROM OLD.longitude
        OR NEW.consent_status IS DISTINCT FROM OLD.consent_status
        OR NEW.no_contact IS DISTINCT FROM OLD.no_contact
    ) THEN
        RAISE EXCEPTION 'Los datos de este titular fueron eliminados y no se pueden volver a cargar.' USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_enforce_privacy ON public.leads;
CREATE TRIGGER trg_leads_enforce_privacy
    BEFORE UPDATE ON public.leads
    FOR EACH ROW EXECUTE FUNCTION public.leads_enforce_privacy();

-- Un lead nuevo nunca nace anonimizado
CREATE OR REPLACE FUNCTION public.leads_block_anonymized_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.anonymized_at IS NOT NULL OR NEW.anonymized_reason IS NOT NULL THEN
        RAISE EXCEPTION 'Un lead nuevo no puede venir anonimizado.' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_block_anonymized_insert ON public.leads;
CREATE TRIGGER trg_leads_block_anonymized_insert
    BEFORE INSERT ON public.leads
    FOR EACH ROW EXECUTE FUNCTION public.leads_block_anonymized_insert();

-- Los contactos de un lead bloqueado o anonimizado tampoco se tocan
CREATE OR REPLACE FUNCTION public.lead_contacts_enforce_privacy()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_lead_id UUID := CASE WHEN TG_OP = 'DELETE' THEN OLD.lead_id ELSE NEW.lead_id END;
BEGIN
    IF public.privacy_bypass_active() THEN
        RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;
    IF public.lead_is_blocked(v_lead_id)
        OR EXISTS (SELECT 1 FROM public.leads l WHERE l.id = v_lead_id AND l.anonymized_at IS NOT NULL) THEN
        RAISE EXCEPTION 'Este lead no admite cambios en sus contactos (bloqueado o anonimizado).' USING ERRCODE = '42501';
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS trg_lead_contacts_enforce_privacy ON public.lead_contacts;
CREATE TRIGGER trg_lead_contacts_enforce_privacy
    BEFORE INSERT OR UPDATE OR DELETE ON public.lead_contacts
    FOR EACH ROW EXECUTE FUNCTION public.lead_contacts_enforce_privacy();

-- No se registra contacto con quien se opuso, no autoriza, revocó, está bloqueado o fue anonimizado
CREATE OR REPLACE FUNCTION public.lead_activities_require_contactable()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_lead public.leads%ROWTYPE;
BEGIN
    SELECT * INTO v_lead FROM public.leads WHERE id = NEW.lead_id;
    IF v_lead.no_contact
        OR v_lead.anonymized_at IS NOT NULL
        OR v_lead.consent_status IN ('refused', 'withdrawn')
        OR public.lead_is_blocked(NEW.lead_id) THEN
        RAISE EXCEPTION 'No se puede registrar contacto con este titular: ejerció sus derechos sobre sus datos.' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lead_activities_require_contactable ON public.lead_activities;
CREATE TRIGGER trg_lead_activities_require_contactable
    BEFORE INSERT ON public.lead_activities
    FOR EACH ROW EXECUTE FUNCTION public.lead_activities_require_contactable();

-- ---------------------------------------------------------------------------
-- 4. Anonimización: única vía para borrar datos personales
-- ---------------------------------------------------------------------------
-- Interna: no se concede a ningún rol de la API. La llaman resolve_lead_privacy_request()
-- y anonymize_expired_prospects(). Es la excepción documentada a "la bitácora no se edita".
CREATE OR REPLACE FUNCTION public.anonymize_lead_internal(p_lead_id UUID, p_reason VARCHAR)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_hash VARCHAR(64);
BEGIN
    IF p_reason NOT IN ('request', 'retention') THEN
        RAISE EXCEPTION 'Motivo de anonimización no válido.';
    END IF;

    PERFORM set_config('revela.privacy_bypass', 'on', TRUE);

    SELECT address_hash INTO v_hash FROM public.leads WHERE id = p_lead_id AND anonymized_at IS NULL;
    IF NOT FOUND THEN
        PERFORM set_config('revela.privacy_bypass', '', TRUE);
        RETURN; -- ya anonimizado o inexistente: nada que hacer
    END IF;

    UPDATE public.leads SET
        full_name = 'Titular eliminado',
        job_title = NULL,
        email = NULL,
        phone = NULL,
        notes = NULL,
        raw_address = 'Dirección eliminada',
        normalized_address = NULL,
        address_hash = NULL,
        latitude = NULL,
        longitude = NULL,
        location = NULL,
        no_contact = TRUE,
        consent_status = 'withdrawn',
        consent_at = TIMEZONE('utc'::text, NOW()),
        anonymized_at = TIMEZONE('utc'::text, NOW()),
        anonymized_reason = p_reason
    WHERE id = p_lead_id;
    -- Se conservan zona, etapa, monto, moneda e ítems: la operación comercial sigue cuadrando

    DELETE FROM public.lead_contacts WHERE lead_id = p_lead_id AND NOT is_primary;
    UPDATE public.lead_contacts SET full_name = 'Titular eliminado', job_title = NULL, email = NULL, phone = NULL
    WHERE lead_id = p_lead_id AND is_primary;

    UPDATE public.lead_activities
    SET contact_name = NULL, summary = 'Contenido eliminado junto con los datos del titular'
    WHERE lead_id = p_lead_id;

    -- La caché de geocodificación guarda la dirección: se borra si ningún otro lead la usa
    IF v_hash IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.leads WHERE address_hash = v_hash) THEN
        DELETE FROM public.geocoding_cache WHERE address_hash = v_hash;
    END IF;

    PERFORM set_config('revela.privacy_bypass', '', TRUE);
END;
$$;

REVOKE ALL ON FUNCTION public.anonymize_lead_internal(UUID, VARCHAR) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.anonymize_lead_internal(UUID, VARCHAR) FROM anon, authenticated;

-- Resolver una solicitud: solo gerencia del mismo CRM
CREATE OR REPLACE FUNCTION public.resolve_lead_privacy_request(p_request_id UUID, p_approve BOOLEAN, p_note TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_request public.lead_privacy_requests%ROWTYPE;
    v_name VARCHAR(200);
BEGIN
    SELECT * INTO v_request FROM public.lead_privacy_requests WHERE id = p_request_id FOR UPDATE;
    IF NOT FOUND OR v_request.company_id IS DISTINCT FROM public.get_current_user_company_id() THEN
        RAISE EXCEPTION 'La solicitud no pertenece a este CRM.' USING ERRCODE = '42501';
    END IF;
    IF public.get_current_user_role() IS DISTINCT FROM 'manager' THEN
        RAISE EXCEPTION 'Solo gerencia resuelve las solicitudes del titular.' USING ERRCODE = '42501';
    END IF;
    IF v_request.status <> 'pending' THEN
        RAISE EXCEPTION 'La solicitud ya fue resuelta.' USING ERRCODE = '23514';
    END IF;

    SELECT full_name INTO v_name FROM public.profiles WHERE id = auth.uid();

    UPDATE public.lead_privacy_requests SET
        status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
        decided_by = auth.uid(),
        decided_by_name = COALESCE(v_name, 'Sin identificar'),
        decided_at = TIMEZONE('utc'::text, NOW()),
        decision_note = NULLIF(BTRIM(COALESCE(p_note, '')), '')
    WHERE id = p_request_id;

    IF p_approve THEN
        PERFORM public.anonymize_lead_internal(v_request.lead_id, 'request');
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_lead_privacy_request(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_lead_privacy_request(UUID, BOOLEAN, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Prospectos sin contactar: se anonimizan solos
-- ---------------------------------------------------------------------------
-- El plazo es una política de Revela, no de la ley. Debe coincidir con
-- PROSPECT_RETENTION_DAYS en src/lib/privacy.ts.
CREATE OR REPLACE FUNCTION public.anonymize_expired_prospects(p_days INTEGER DEFAULT 30)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_lead RECORD;
    v_total INTEGER := 0;
BEGIN
    FOR v_lead IN
        SELECT l.id, l.company_id
        FROM public.leads l
        WHERE l.consent_status = 'not_requested'
          AND l.anonymized_at IS NULL
          AND COALESCE(l.consent_at, l.created_at) <= TIMEZONE('utc'::text, NOW()) - make_interval(days => p_days)
          AND NOT public.lead_is_blocked(l.id)
    LOOP
        PERFORM public.anonymize_lead_internal(v_lead.id, 'retention');
        -- Queda en el historial del CRM, sin datos personales
        INSERT INTO public.audit_log (company_id, actor_id, actor_name, actor_role, action, entity, entity_id, entity_label, summary)
        SELECT v_lead.company_id, NULL, 'Revela (tarea automática)', 'manager', 'update', 'lead', v_lead.id::TEXT,
               COALESCE(NULLIF(BTRIM(ca.name), ''), 'Persona natural · ref. ' || RIGHT(v_lead.id::TEXT, 4)),
               'Datos personales eliminados automáticamente: prospecto sin contactar en ' || p_days || ' días'
        FROM public.leads l
        LEFT JOIN public.client_accounts ca ON ca.id = l.client_account_id
        WHERE l.id = v_lead.id;
        v_total := v_total + 1;
    END LOOP;
    RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.anonymize_expired_prospects(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.anonymize_expired_prospects(INTEGER) FROM anon, authenticated;

-- Tarea diaria (03:15 UTC). pg_cron viene incluido en Supabase y se activa en pg_catalog.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

DO $$
BEGIN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'revela-anonimizar-prospectos';
    PERFORM cron.schedule('revela-anonimizar-prospectos', '15 3 * * *', 'SELECT public.anonymize_expired_prospects(30);');
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Auditoría sin valores personales (opción A)
-- ---------------------------------------------------------------------------
-- La app ya no los envía; la base lo garantiza igual. Quita del estado para revertir los
-- campos que identifican a una persona y deja "modificado" en los cambios personales.
CREATE OR REPLACE FUNCTION public.audit_log_strip_personal_data()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_personal TEXT[] := ARRAY[
        'fullName', 'full_name', 'jobTitle', 'job_title', 'email', 'phone', 'notes',
        'rawAddress', 'raw_address', 'normalizedAddress', 'normalized_address',
        'latitude', 'longitude', 'contacts', 'contactName', 'contact_name'
    ];
    v_key TEXT;
BEGIN
    IF NEW.revert_snapshot IS NOT NULL THEN
        FOREACH v_key IN ARRAY v_personal LOOP
            NEW.revert_snapshot := NEW.revert_snapshot - v_key;
        END LOOP;
    END IF;

    SELECT COALESCE(jsonb_agg(
        CASE WHEN (c ->> 'field') = ANY (v_personal)
            THEN jsonb_build_object('field', c ->> 'field', 'label', c ->> 'label', 'before', NULL, 'after', NULL, 'redacted', TRUE)
            ELSE c
        END
    ), '[]'::jsonb)
    INTO NEW.changes
    FROM jsonb_array_elements(COALESCE(NEW.changes, '[]'::jsonb)) AS c;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_log_strip_personal_data ON public.audit_log;
CREATE TRIGGER trg_audit_log_strip_personal_data
    BEFORE INSERT ON public.audit_log
    FOR EACH ROW EXECUTE FUNCTION public.audit_log_strip_personal_data();

COMMENT ON COLUMN public.audit_log.revert_snapshot IS
    'Estado anterior SIN datos personales (los quita trg_audit_log_strip_personal_data). NULL = no reversible. Revertir restaura el negocio y deja los datos personales como están.';

-- ---------------------------------------------------------------------------
-- 7. Permisos explícitos para la API
-- ---------------------------------------------------------------------------
-- El proyecto no expone tablas nuevas automáticamente. Solo usuarios con sesión acceden,
-- y siempre a través de RLS. Los visitantes sin sesión (anon) no leen ni escriben nada.
-- Regla para migraciones futuras: toda tabla nueva agrega su GRANT aquí o en su archivo.
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;

-- El historial y las solicitudes solo se agregan; la bitácora, igual
REVOKE UPDATE, DELETE ON public.audit_log FROM authenticated;
REVOKE UPDATE, DELETE ON public.lead_activities FROM authenticated;
REVOKE UPDATE, DELETE ON public.lead_privacy_requests FROM authenticated;
