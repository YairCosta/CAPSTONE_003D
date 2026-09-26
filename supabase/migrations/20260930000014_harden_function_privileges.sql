-- ============================================================================
-- 0014 · Permisos de las funciones (revisión de seguridad de Supabase)
-- ============================================================================
-- `supabase db advisors` sobre la base real (25-09-2026) avisó:
--   · 21 funciones SECURITY DEFINER ejecutables por visitantes sin sesión (anon).
--     PostgreSQL da EXECUTE a PUBLIC por defecto; la 0012 cerró las tablas a anon,
--     no las funciones.
--   · set_updated_at() sin search_path fijo.
--
-- Criterio:
--   · Nadie sin sesión ejecuta funciones de la aplicación.
--   · Los usuarios con sesión (authenticated) conservan EXECUTE: las políticas RLS y los
--     triggers llaman funciones como get_current_user_company_id() y lead_is_blocked()
--     con los permisos de quien consulta. Quitárselas rompería todo el acceso.
--   · Las funciones de trigger no necesitan EXECUTE para dispararse (PostgreSQL solo lo
--     revisa al crear el trigger), así que se retiran también de authenticated: no hay
--     razón para que queden expuestas como RPC.
--   · Las internas de la 0012 (anonimización) siguen solo para el dueño y pg_cron.
-- ============================================================================

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, service_role;

-- Funciones de trigger: se disparan igual, pero ya no se pueden llamar por la API
DO $$
DECLARE
    v_fn RECORD;
BEGIN
    FOR v_fn IN
        SELECT p.oid::regprocedure AS firma
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.prorettype = 'trigger'::regtype
    LOOP
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', v_fn.firma);
    END LOOP;
END;
$$;

-- Internas: solo el dueño (y pg_cron, que corre como dueño)
REVOKE EXECUTE ON FUNCTION public.anonymize_lead_internal(UUID, VARCHAR) FROM authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.anonymize_expired_prospects(INTEGER) FROM authenticated;

-- Las funciones que se creen en el futuro nacen cerradas; cada migración concede lo suyo
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;

-- search_path fijo: evita que un objeto con el mismo nombre en otro esquema la suplante
ALTER FUNCTION public.set_updated_at() SET search_path = public;
