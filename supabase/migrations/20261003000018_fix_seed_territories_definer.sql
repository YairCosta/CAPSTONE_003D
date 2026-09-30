-- ============================================================================
-- 0018 · Corrige la 0017: crear un CRM fallaba al copiar sus zonas
-- ============================================================================
-- Los triggers que copian las zonas (companies_seed_territories y
-- company_countries_seed_territories) corrían con los permisos de quien crea el CRM, y la 0017
-- le quitó a `authenticated` el permiso de ejecutar seed_company_territories() (es interna).
-- Resultado: "permission denied for function seed_company_territories" al crear un CRM desde la
-- app. Lo detectó `npm run test:db` antes de usarse.
--
-- Los triggers pasan a SECURITY DEFINER: corren como el dueño de la base, que sí puede ejecutar
-- la función interna. Siguen sin poder llamarse por la API (la 0017 les quitó EXECUTE).
-- ============================================================================

ALTER FUNCTION public.companies_seed_territories() SECURITY DEFINER;
ALTER FUNCTION public.company_countries_seed_territories() SECURITY DEFINER;
