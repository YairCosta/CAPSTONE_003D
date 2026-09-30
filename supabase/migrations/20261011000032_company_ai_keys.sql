-- ============================================================================
-- 0032 · Clave de OpenAI de cada CRM
-- ============================================================================
-- El asistente de IA se paga con la cuenta de OpenAI de quien lo usa: cada CRM trae SU clave, la gerencia la
-- pega en la configuración del chat y Revela nunca usa la de otro CRM ni una propia de la plataforma. Así el
-- gasto es de su dueño y el presupuesto mensual (0031) controla su propia plata.
--
--   · La clave se guarda cifrada en Supabase Vault (vault.secrets): ni las copias de seguridad ni una persona con
--     acceso a las tablas de Revela la ven en claro, y la pantalla no la vuelve a mostrar (solo sus últimos 4 caracteres).
--   · company_ai_keys guarda solo el puntero al secreto y esos 4 caracteres. Nadie con sesión la lee ni la escribe:
--     todo pasa por el servidor (clave secreta de Supabase) con las funciones de abajo.
--   · set_company_ai_key / clear_company_ai_key exigen que quien cambia sea gerente activo de ese CRM y dejan el
--     cambio en change_log con su nombre (el trigger log_row_change no sirve: el servidor no tiene sesión de persona).
--   · get_company_ai_key devuelve la clave descifrada y solo la ejecuta el servidor, para llamar a OpenAI.
-- ============================================================================

-- ------------------------------------------------------------------ puntero al secreto
CREATE TABLE IF NOT EXISTS public.company_ai_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
    secret_id UUID NOT NULL,
    key_last4 TEXT NOT NULL CHECK (char_length(key_last4) = 4),
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);

COMMENT ON TABLE public.company_ai_keys IS
    'Clave de OpenAI de cada CRM para el asistente de IA. La clave vive cifrada en Supabase Vault; aquí solo el puntero y sus últimos 4 caracteres. Nadie con sesión la lee ni la escribe: solo el servidor, con las funciones set/clear/get_company_ai_key.';
COMMENT ON COLUMN public.company_ai_keys.company_id IS 'CRM dueño de la clave (una por CRM).';
COMMENT ON COLUMN public.company_ai_keys.secret_id IS 'Identificador del secreto en vault.secrets. No es la clave: sin acceso a Vault no sirve.';
COMMENT ON COLUMN public.company_ai_keys.key_last4 IS 'Últimos 4 caracteres de la clave, para que la gerencia reconozca cuál está cargada.';
COMMENT ON COLUMN public.company_ai_keys.updated_by IS 'Quien la cargó o la cambió por última vez (la gerencia del CRM).';
COMMENT ON COLUMN public.company_ai_keys.updated_at IS 'Cuándo se cargó o se cambió por última vez.';

-- Quien carga la clave debe ser del mismo CRM (los CRMs nunca se mezclan); la función de 0031 sirve igual
COMMENT ON FUNCTION public.enforce_ai_settings_updater_company() IS
    'Trigger de company_ai_settings y company_ai_keys: quien cambió el presupuesto o la clave debe ser del CRM de la fila.';

DROP TRIGGER IF EXISTS trg_company_ai_keys_same_company ON public.company_ai_keys;
CREATE TRIGGER trg_company_ai_keys_same_company
    BEFORE INSERT OR UPDATE ON public.company_ai_keys
    FOR EACH ROW EXECUTE FUNCTION public.enforce_ai_settings_updater_company();

CREATE INDEX IF NOT EXISTS idx_company_ai_keys_updated_by ON public.company_ai_keys (updated_by);

-- Al quitar la clave (o al borrar el CRM, que la borra en cascada) el secreto se borra de Vault: no quedan claves huérfanas
CREATE OR REPLACE FUNCTION public.drop_ai_key_secret()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    DELETE FROM vault.secrets WHERE id = OLD.secret_id;
    RETURN OLD;
END;
$$;

COMMENT ON FUNCTION public.drop_ai_key_secret() IS
    'Trigger de company_ai_keys: al borrar la fila (se quitó la clave o se borró el CRM) borra también el secreto de Vault.';

REVOKE EXECUTE ON FUNCTION public.drop_ai_key_secret() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_company_ai_keys_drop_secret ON public.company_ai_keys;
CREATE TRIGGER trg_company_ai_keys_drop_secret
    AFTER DELETE ON public.company_ai_keys
    FOR EACH ROW EXECUTE FUNCTION public.drop_ai_key_secret();

-- Sin políticas para las personas con sesión: ninguna lee ni escribe esta tabla (el estado de la clave se consulta por el servidor)
ALTER TABLE public.company_ai_keys ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.company_ai_keys FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.company_ai_keys TO service_role;

-- ------------------------------------------------------------------ cargar o cambiar la clave
CREATE OR REPLACE FUNCTION public.set_company_ai_key(
    p_company_id UUID,
    p_user_id UUID,
    p_api_key TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rol TEXT;
    v_secreto UUID;
    v_id UUID;
    v_existia BOOLEAN;
BEGIN
    SELECT p.role::text INTO v_rol
    FROM public.profiles p
    WHERE p.id = p_user_id AND p.company_id = p_company_id AND p.is_active;
    IF v_rol IS DISTINCT FROM 'manager' THEN
        RAISE EXCEPTION 'Solo la gerencia del CRM puede cambiar la clave de OpenAI del asistente' USING ERRCODE = '42501';
    END IF;
    -- El mensaje nunca repite lo que se mandó: es una clave
    IF p_api_key IS NULL OR p_api_key !~ '^sk-[A-Za-z0-9_-]{20,250}$' THEN
        RAISE EXCEPTION 'La clave de OpenAI no tiene el formato esperado (empieza con sk-)' USING ERRCODE = '22023';
    END IF;

    SELECT k.secret_id INTO v_secreto FROM public.company_ai_keys k WHERE k.company_id = p_company_id;
    v_existia := FOUND;

    IF v_existia THEN
        PERFORM vault.update_secret(v_secreto, p_api_key, 'openai_key:' || p_company_id::text, 'Clave de OpenAI del CRM');
    ELSE
        v_secreto := vault.create_secret(p_api_key, 'openai_key:' || p_company_id::text, 'Clave de OpenAI del CRM');
    END IF;

    INSERT INTO public.company_ai_keys (company_id, secret_id, key_last4, updated_by, updated_at)
    VALUES (p_company_id, v_secreto, right(p_api_key, 4), p_user_id, TIMEZONE('utc'::text, NOW()))
    ON CONFLICT (company_id) DO UPDATE SET
        secret_id = EXCLUDED.secret_id,
        key_last4 = EXCLUDED.key_last4,
        updated_by = EXCLUDED.updated_by,
        updated_at = EXCLUDED.updated_at
    RETURNING id INTO v_id;

    -- Solo nombres de columnas, nunca valores (igual que log_row_change)
    INSERT INTO public.change_log (company_id, table_name, row_id, operation, changed_columns, actor_id, actor_role)
    VALUES (p_company_id, 'company_ai_keys', v_id::text,
            CASE WHEN v_existia THEN 'UPDATE' ELSE 'INSERT' END,
            CASE WHEN v_existia THEN ARRAY['api_key'] ELSE '{}'::text[] END,
            p_user_id, v_rol);
    RETURN right(p_api_key, 4);
END;
$$;

COMMENT ON FUNCTION public.set_company_ai_key(UUID, UUID, TEXT) IS
    'Carga o cambia la clave de OpenAI de un CRM (cifrada en Vault). Solo la ejecuta el servidor, a nombre de una persona que debe ser gerente activo de ese CRM; el cambio queda en change_log sin el valor.';

REVOKE ALL ON FUNCTION public.set_company_ai_key(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_company_ai_key(UUID, UUID, TEXT) TO service_role;

-- ------------------------------------------------------------------ quitar la clave
CREATE OR REPLACE FUNCTION public.clear_company_ai_key(
    p_company_id UUID,
    p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rol TEXT;
    v_id UUID;
BEGIN
    SELECT p.role::text INTO v_rol
    FROM public.profiles p
    WHERE p.id = p_user_id AND p.company_id = p_company_id AND p.is_active;
    IF v_rol IS DISTINCT FROM 'manager' THEN
        RAISE EXCEPTION 'Solo la gerencia del CRM puede quitar la clave de OpenAI del asistente' USING ERRCODE = '42501';
    END IF;

    DELETE FROM public.company_ai_keys WHERE company_id = p_company_id RETURNING id INTO v_id;
    IF v_id IS NULL THEN
        RETURN FALSE;
    END IF;

    INSERT INTO public.change_log (company_id, table_name, row_id, operation, changed_columns, actor_id, actor_role)
    VALUES (p_company_id, 'company_ai_keys', v_id::text, 'DELETE', '{}'::text[], p_user_id, v_rol);
    RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.clear_company_ai_key(UUID, UUID) IS
    'Quita la clave de OpenAI de un CRM y borra su secreto de Vault. Solo la ejecuta el servidor, a nombre de un gerente activo de ese CRM; queda en change_log.';

REVOKE ALL ON FUNCTION public.clear_company_ai_key(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_company_ai_key(UUID, UUID) TO service_role;

-- ------------------------------------------------------------------ leer la clave (solo para llamar a OpenAI)
CREATE OR REPLACE FUNCTION public.get_company_ai_key(p_company_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT ds.decrypted_secret
    FROM public.company_ai_keys k
    JOIN vault.decrypted_secrets ds ON ds.id = k.secret_id
    WHERE k.company_id = p_company_id;
$$;

COMMENT ON FUNCTION public.get_company_ai_key(UUID) IS
    'Devuelve la clave de OpenAI descifrada de un CRM, o NULL si no tiene. Solo la ejecuta el servidor (clave secreta) para llamar a OpenAI a nombre de ese CRM: nunca se manda al navegador.';

REVOKE ALL ON FUNCTION public.get_company_ai_key(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_company_ai_key(UUID) TO service_role;
