-- ============================================================================
-- 0016 · Permisos de tablas para service_role (el servidor de Revela)
-- ============================================================================
-- El proyecto de Supabase no expone tablas automáticamente, y la 0012 concedió permisos
-- explícitos solo a `authenticated`. Faltó `service_role`: el rol de la clave secreta, que usa
-- únicamente el servidor (server/adminUsers.ts) para invitar usuarios. Sin esto el servidor no
-- podía leer el perfil de quien invita ni crear el del invitado ("permission denied for table
-- profiles"), y toda invitación se rechazaba.
--
-- service_role salta RLS por diseño; su protección es que la clave nunca sale del servidor
-- (invariante 7 de CLAUDE.md). `anon` sigue sin nada.
-- ============================================================================

GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Las tablas que se creen en el futuro nacen con el mismo permiso para el servidor
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO service_role;
