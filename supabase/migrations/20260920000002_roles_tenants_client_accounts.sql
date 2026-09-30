-- ============================================================================
-- PERFILES DE USUARIO, ESTADO DE TENANTS Y EMPRESAS CLIENTE
--   agent      = usuario base (captura leads y registra contactos)
--   manager    = gerente (todo lo del usuario base + KPI, empresas cliente, contactos, cola de geocodificación)
--   superadmin = administrador de la plataforma (crea CRMs, activa/desactiva tenants y usuarios)
-- ============================================================================

-- 1. Estado activo/inactivo de tenants y usuarios
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email VARCHAR(255);

-- 2. Roles: se unifica 'admin' en 'manager' y el superadmin no pertenece a ningún tenant
UPDATE public.profiles SET role = 'manager' WHERE role = 'admin';
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_role_check CHECK (role IN ('superadmin', 'manager', 'agent'));
ALTER TABLE public.profiles ALTER COLUMN company_id DROP NOT NULL;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_company_required;
ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_company_required CHECK (role = 'superadmin' OR company_id IS NOT NULL);

-- 3. Empresas cliente (contenedores de leads) dentro de cada tenant
CREATE TABLE IF NOT EXISTS public.client_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    tax_id VARCHAR(50),
    industry VARCHAR(120),
    contact_name VARCHAR(200),
    email VARCHAR(255),
    phone VARCHAR(50),
    address TEXT,
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE (company_id, name)
);
CREATE INDEX IF NOT EXISTS idx_client_accounts_company ON public.client_accounts (company_id);

ALTER TABLE public.leads
    ADD COLUMN IF NOT EXISTS client_account_id UUID REFERENCES public.client_accounts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_leads_client_account ON public.leads (client_account_id);

ALTER TABLE public.client_accounts ENABLE ROW LEVEL SECURITY;

-- 4. Funciones de contexto de sesión (usuario y tenant deben estar activos)
CREATE OR REPLACE FUNCTION public.get_current_user_company_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT p.company_id
    FROM public.profiles p
    JOIN public.companies c ON c.id = p.company_id
    WHERE p.id = auth.uid() AND p.is_active AND c.is_active;
$$;

CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT p.role
    FROM public.profiles p
    LEFT JOIN public.companies c ON c.id = p.company_id
    WHERE p.id = auth.uid()
      AND p.is_active
      AND (p.role = 'superadmin' OR c.is_active);
$$;

CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(public.get_current_user_role() = 'superadmin', FALSE);
$$;

-- 5. Políticas RLS
-- Tenants: cada usuario ve el suyo; el superadmin crea, edita y activa/desactiva todos
DROP POLICY IF EXISTS "Aislamiento de empresas" ON public.companies;
CREATE POLICY "Empresas: lectura propia" ON public.companies
    FOR SELECT USING (id = public.get_current_user_company_id() OR public.is_superadmin());
CREATE POLICY "Empresas: gestión superadmin" ON public.companies
    FOR ALL USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

-- Perfiles: lectura dentro del tenant; solo el superadmin crea y activa/desactiva usuarios
DROP POLICY IF EXISTS "Aislamiento de perfiles" ON public.profiles;
CREATE POLICY "Perfiles: lectura" ON public.profiles
    FOR SELECT USING (
        id = auth.uid()
        OR company_id = public.get_current_user_company_id()
        OR public.is_superadmin()
    );
CREATE POLICY "Perfiles: gestión superadmin" ON public.profiles
    FOR ALL USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

-- Leads: todos los usuarios activos del tenant leen, crean y mueven etapas; solo gerencia elimina
DROP POLICY IF EXISTS "Eliminación de leads (DELETE)" ON public.leads;
CREATE POLICY "Eliminación de leads (DELETE)" ON public.leads
    FOR DELETE USING (
        company_id = public.get_current_user_company_id()
        AND public.get_current_user_role() = 'manager'
    );

-- Empresas cliente: el usuario base puede crearlas al capturar; gerencia edita y activa/desactiva
CREATE POLICY "Empresas cliente: lectura" ON public.client_accounts
    FOR SELECT USING (company_id = public.get_current_user_company_id());
CREATE POLICY "Empresas cliente: creación" ON public.client_accounts
    FOR INSERT WITH CHECK (company_id = public.get_current_user_company_id());
CREATE POLICY "Empresas cliente: edición gerencia" ON public.client_accounts
    FOR UPDATE USING (
        company_id = public.get_current_user_company_id()
        AND public.get_current_user_role() = 'manager'
    );
