-- ============================================================================
-- 0015 · Gerencia administra a su equipo y el administrador deja rastro en la auditoría
-- ============================================================================
-- Etapa 2 de la conexión de la app (docs/BASE_DE_DATOS.md §6, docs/USUARIOS.md).
--
-- 1. Perfiles: hasta ahora solo el administrador de la plataforma escribía `profiles`. El gerente
--    ahora edita a los usuarios de SU CRM (nombre, perfil base/gerente, activo), como ya hacía la
--    app en memoria. Crear usuarios sigue pasando por la invitación del servidor, porque la cuenta
--    de Auth tiene que existir antes que el perfil.
--    Un trigger cuida lo que una política no alcanza a ver columna por columna:
--      · el email no cambia (es la identidad de la cuenta en Auth);
--      · nadie mueve a un usuario de CRM, salvo el administrador;
--      · nadie se cambia su propio perfil ni se desactiva (así un CRM nunca queda sin gerencia).
--
-- 2. Auditoría: el administrador no tenía CRM propio, así que la política de inserción le impedía
--    registrar sus acciones (crear un CRM, invitar usuarios, cambiar el plan) en el historial del
--    CRM afectado. Ahora puede, siempre a su nombre. Además, la base fija quién firma cada entrada
--    (nombre y rol del perfil real), la fecha y que nazca sin revertir: la app ya no puede
--    atribuirle un cambio a otra persona ni fecharlo en el pasado.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Gerencia: edición de los usuarios de su propio CRM
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Perfiles: gestión gerente" ON public.profiles;
CREATE POLICY "Perfiles: gestión gerente" ON public.profiles
    FOR UPDATE TO authenticated
    USING (
        public.get_current_user_role() = 'manager'
        AND company_id = public.get_current_user_company_id()
        AND role IN ('agent', 'manager')
    )
    WITH CHECK (
        company_id = public.get_current_user_company_id()
        AND role IN ('agent', 'manager')
    );

COMMENT ON POLICY "Perfiles: gestión gerente" ON public.profiles IS
    'El gerente edita nombre, perfil (base o gerente) y activación de los usuarios de su propio CRM. Nunca administradores ni usuarios de otro CRM.';

CREATE OR REPLACE FUNCTION public.profiles_guard_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    -- Sin sesión de usuario (servidor con la clave secreta, SQL del dueño): sin restricciones extra
    IF auth.uid() IS NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.email IS DISTINCT FROM OLD.email
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'El email de un usuario no se cambia: es la identidad de su cuenta.';
    END IF;

    IF NEW.id = auth.uid()
       AND (NEW.role IS DISTINCT FROM OLD.role
            OR NEW.is_active IS DISTINCT FROM OLD.is_active
            OR NEW.company_id IS DISTINCT FROM OLD.company_id) THEN
        RAISE EXCEPTION 'No puedes cambiar tu propio perfil ni desactivarte.';
    END IF;

    IF NEW.company_id IS DISTINCT FROM OLD.company_id AND NOT public.is_superadmin() THEN
        RAISE EXCEPTION 'Solo el administrador de la plataforma mueve un usuario a otro CRM.';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_guard_update ON public.profiles;
CREATE TRIGGER trg_profiles_guard_update
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_update();

COMMENT ON FUNCTION public.profiles_guard_update() IS
    'Reglas por columna al editar un perfil desde una sesión: email fijo, sin mover de CRM (salvo el administrador) y sin cambiarse el perfil propio.';

-- ----------------------------------------------------------------------------
-- 2. Auditoría: el administrador registra sus acciones y la base fija quién firma
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Auditoría: registro plataforma" ON public.audit_log;
CREATE POLICY "Auditoría: registro plataforma" ON public.audit_log
    FOR INSERT TO authenticated
    WITH CHECK (public.is_superadmin() AND actor_id = auth.uid());

COMMENT ON POLICY "Auditoría: registro plataforma" ON public.audit_log IS
    'El administrador de la plataforma deja en el historial del CRM afectado lo que hizo (crear, activar, plan, usuarios). No puede leer ese historial: es de la gerencia del CRM.';

CREATE OR REPLACE FUNCTION public.audit_log_set_actor()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_name VARCHAR(200);
    v_role VARCHAR(20);
BEGIN
    -- Tareas del sistema (pg_cron) firman con su propio nombre
    IF auth.uid() IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT p.full_name, p.role INTO v_name, v_role
    FROM public.profiles p
    WHERE p.id = auth.uid();

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tu usuario no tiene perfil en Revela: no puede registrar cambios.';
    END IF;

    NEW.actor_id := auth.uid();
    NEW.actor_name := v_name;
    NEW.actor_role := v_role;
    NEW.created_at := TIMEZONE('utc'::text, NOW());
    -- Marcar una entrada como revertida es solo de mark_audit_entry_reverted()
    NEW.reverted_at := NULL;
    NEW.reverted_by := NULL;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_log_set_actor ON public.audit_log;
CREATE TRIGGER trg_audit_log_set_actor
    BEFORE INSERT ON public.audit_log
    FOR EACH ROW EXECUTE FUNCTION public.audit_log_set_actor();

COMMENT ON FUNCTION public.audit_log_set_actor() IS
    'Firma cada entrada del historial con el nombre y rol reales de quien tiene la sesión, con la hora de la base y sin revertir.';

-- ----------------------------------------------------------------------------
-- 3. Permisos: las funciones de trigger no se exponen como RPC (criterio de la 0014)
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.profiles_guard_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_log_set_actor() FROM PUBLIC, anon, authenticated;
