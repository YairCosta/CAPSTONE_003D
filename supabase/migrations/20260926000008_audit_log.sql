-- ============================================================================
-- AUDITORÍA: HISTORIAL DE CAMBIOS DE CADA CRM
-- Registra quién hizo qué, cuándo y qué cambió exactamente. Es un historial de solo agregar:
-- nadie puede editarlo ni borrarlo, ni siquiera gerencia. Revertir un cambio agrega una entrada nueva.
-- Requiere: 20260925000007_data_quality_conventions.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    actor_name VARCHAR(200) NOT NULL,                 -- se guarda el nombre aunque el usuario se elimine
    actor_role VARCHAR(20) NOT NULL CHECK (actor_role IN ('superadmin', 'manager', 'agent')),
    action VARCHAR(20) NOT NULL CHECK (
        action IN ('create', 'update', 'delete', 'activate', 'deactivate', 'stage', 'locate', 'contact', 'export', 'revert')
    ),
    entity VARCHAR(20) NOT NULL CHECK (
        entity IN ('lead', 'account', 'catalog', 'activity', 'stage', 'company', 'user', 'export')
    ),
    entity_id VARCHAR(100) NOT NULL,
    entity_label VARCHAR(200) NOT NULL,               -- nombre legible del dato afectado
    summary TEXT NOT NULL,
    changes JSONB NOT NULL DEFAULT '[]'::jsonb,       -- [{ field, label, before, after }]
    revert_snapshot JSONB,                            -- estado anterior completo; NULL = no reversible
    reverted_at TIMESTAMPTZ,
    reverted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_log_company_created ON public.audit_log (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON public.audit_log (company_id, entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON public.audit_log (company_id, actor_id);
-- Pendientes de revertir (lo que el gerente ve con el filtro "Solo reversibles")
CREATE INDEX IF NOT EXISTS idx_audit_log_revertible ON public.audit_log (company_id, created_at DESC)
    WHERE revert_snapshot IS NOT NULL AND reverted_at IS NULL;

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Lectura: gerencia ve el historial de su CRM; el usuario base no entra a este módulo
DROP POLICY IF EXISTS "Auditoría: lectura gerencia" ON public.audit_log;
CREATE POLICY "Auditoría: lectura gerencia" ON public.audit_log
    FOR SELECT USING (
        company_id = public.get_current_user_company_id()
        AND (public.get_current_user_role() = 'manager' OR public.is_superadmin())
    );

-- Escritura: cualquier usuario del CRM genera registros (al capturar, mover o editar), siempre a su nombre
DROP POLICY IF EXISTS "Auditoría: registro" ON public.audit_log;
CREATE POLICY "Auditoría: registro" ON public.audit_log
    FOR INSERT WITH CHECK (company_id = public.get_current_user_company_id() AND actor_id = auth.uid());

-- No hay políticas de UPDATE ni DELETE: el historial no se edita ni se borra.
-- Marcar una entrada como revertida pasa por esta función, que solo permite ese cambio y una sola vez.
CREATE OR REPLACE FUNCTION public.mark_audit_entry_reverted(p_entry_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company UUID;
BEGIN
    IF public.get_current_user_role() IS DISTINCT FROM 'manager' THEN
        RAISE EXCEPTION 'Solo gerencia puede revertir cambios' USING ERRCODE = '42501';
    END IF;

    SELECT company_id INTO v_company FROM public.audit_log WHERE id = p_entry_id;
    IF v_company IS DISTINCT FROM public.get_current_user_company_id() THEN
        RAISE EXCEPTION 'El cambio pertenece a otro CRM' USING ERRCODE = '42501';
    END IF;

    UPDATE public.audit_log
    SET reverted_at = TIMEZONE('utc'::text, NOW()), reverted_by = auth.uid()
    WHERE id = p_entry_id AND reverted_at IS NULL AND revert_snapshot IS NOT NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ese cambio no se puede revertir o ya fue revertido' USING ERRCODE = '23514';
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_audit_entry_reverted(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_audit_entry_reverted(UUID) TO authenticated, service_role;

COMMENT ON TABLE public.audit_log IS 'Historial de cambios de cada CRM: quién, qué, cuándo y qué cambió. Solo se agrega: no se edita ni se borra.';
COMMENT ON COLUMN public.audit_log.actor_name IS 'Nombre de la persona tal como estaba al hacer el cambio, aunque después se elimine su usuario.';
COMMENT ON COLUMN public.audit_log.changes IS 'Lista de campos modificados con su valor anterior y el nuevo, ya formateados para mostrar.';
COMMENT ON COLUMN public.audit_log.revert_snapshot IS 'Estado anterior completo del dato. NULL = el cambio no se puede deshacer (ej. una creación).';
COMMENT ON COLUMN public.audit_log.reverted_at IS 'Cuándo se deshizo este cambio. La reversión agrega además su propia entrada al historial.';
