-- ============================================================================
-- VARIOS CONTACTOS POR LEAD
-- En una empresa casi nunca se habla con una sola persona: quien pide la cotización
-- no siempre es quien firma. Cada lead pasa a tener una lista de personas.
--
-- Cambio en dos tiempos (ver docs/BASE_DE_DATOS.md → expandir → copiar → convivir → contraer):
--   AHORA (expandir + copiar): se crea lead_contacts y se copia el contacto que hoy vive
--   en la propia fila del lead, marcado como principal. Las columnas full_name, job_title,
--   email y phone de leads SIGUEN siendo la fuente de verdad del contacto principal.
--   MÁS ADELANTE (contraer): cuando la aplicación lea siempre desde lead_contacts,
--   otra migración podrá quitar esas columnas de leads. No se hace aquí a propósito.
--
-- Requiere: 20260927000009_lead_job_title.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.lead_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    full_name VARCHAR(200) NOT NULL,
    job_title VARCHAR(120),
    email VARCHAR(160),
    phone VARCHAR(40),
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,   -- el contacto de la ficha del lead
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    CONSTRAINT lead_contacts_full_name_not_blank CHECK (LENGTH(BTRIM(full_name)) > 0),
    CONSTRAINT lead_contacts_job_title_not_blank CHECK (job_title IS NULL OR LENGTH(BTRIM(job_title)) > 0)
);

COMMENT ON TABLE public.lead_contacts IS
    'Personas con las que se habla dentro de un lead. is_primary = TRUE marca el contacto de la ficha del lead.';
COMMENT ON COLUMN public.lead_contacts.is_primary IS
    'TRUE en el contacto principal del lead (hoy espejo de leads.full_name). Solo puede haber uno por lead.';

CREATE INDEX IF NOT EXISTS idx_lead_contacts_lead ON public.lead_contacts (company_id, lead_id);
-- Un solo contacto principal por lead
CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_contacts_primary ON public.lead_contacts (lead_id) WHERE is_primary;

ALTER TABLE public.lead_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Contactos: lectura del propio CRM" ON public.lead_contacts;
CREATE POLICY "Contactos: lectura del propio CRM" ON public.lead_contacts
    FOR SELECT USING (company_id = public.get_current_user_company_id());

DROP POLICY IF EXISTS "Contactos: escritura del propio CRM" ON public.lead_contacts;
CREATE POLICY "Contactos: escritura del propio CRM" ON public.lead_contacts
    FOR ALL USING (company_id = public.get_current_user_company_id())
    WITH CHECK (company_id = public.get_current_user_company_id());

-- El lead referenciado tiene que ser del mismo CRM: un contacto nunca cruza de tenant
CREATE OR REPLACE FUNCTION public.lead_contacts_same_company()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.leads l
        WHERE l.id = NEW.lead_id AND l.company_id = NEW.company_id
    ) THEN
        RAISE EXCEPTION 'El lead % no pertenece al CRM %', NEW.lead_id, NEW.company_id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lead_contacts_same_company ON public.lead_contacts;
CREATE TRIGGER trg_lead_contacts_same_company
    BEFORE INSERT OR UPDATE ON public.lead_contacts
    FOR EACH ROW EXECUTE FUNCTION public.lead_contacts_same_company();

DROP TRIGGER IF EXISTS trg_lead_contacts_updated_at ON public.lead_contacts;
CREATE TRIGGER trg_lead_contacts_updated_at
    BEFORE UPDATE ON public.lead_contacts
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Copiar el contacto que hoy vive en la fila del lead. Idempotente: no duplica si ya existe.
INSERT INTO public.lead_contacts (company_id, lead_id, full_name, job_title, email, phone, is_primary)
SELECT l.company_id, l.id, l.full_name, l.job_title, l.email, l.phone, TRUE
FROM public.leads l
WHERE NOT EXISTS (
    SELECT 1 FROM public.lead_contacts c WHERE c.lead_id = l.id AND c.is_primary
);

-- Con quién se habló en cada contacto registrado (bitácora)
ALTER TABLE public.lead_activities ADD COLUMN IF NOT EXISTS contact_name VARCHAR(200);

COMMENT ON COLUMN public.lead_activities.contact_name IS
    'Nombre de la persona con la que se habló. Se guarda el nombre y no el id para que la bitácora no cambie si el contacto se edita o se borra.';
