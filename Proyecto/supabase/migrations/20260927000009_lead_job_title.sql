-- ============================================================================
-- CARGO DEL CONTACTO DEL LEAD
-- Saber con qué cargo se está hablando indica si la persona decide la compra o solo consulta.
-- Es un campo opcional y aditivo: no cambia ni renombra nada existente.
-- Requiere: 20260926000008_audit_log.sql
-- ============================================================================

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS job_title VARCHAR(120);

COMMENT ON COLUMN public.leads.job_title IS
    'Cargo del contacto dentro de su empresa (ej. Gerente de Operaciones). Opcional; sirve para saber si decide la compra.';

-- Un cargo en blanco se guarda como NULL, nunca como cadena vacía (convención de docs/BASE_DE_DATOS.md)
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_job_title_not_blank;
ALTER TABLE public.leads ADD CONSTRAINT leads_job_title_not_blank
    CHECK (job_title IS NULL OR LENGTH(BTRIM(job_title)) > 0);

UPDATE public.leads SET job_title = NULL WHERE job_title IS NOT NULL AND LENGTH(BTRIM(job_title)) = 0;
