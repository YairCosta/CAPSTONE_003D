-- ============================================================================
-- 0019 · Revela ubica los leads por zona, nunca por coordenada (minimización de datos)
-- ============================================================================
-- Hasta ahora cada lead guardaba latitud y longitud, y el mapa lo dibujaba como un punto. El punto
-- no era la dirección real (la app lo ponía dentro de la comuna elegida), pero parecía exacto, se
-- guardaba en la base y, con un geocodificador real, habría sido la ubicación de una persona.
-- Para lo que hace Revela (qué se vende y en qué zona) basta la zona: la coordenada no aporta al
-- negocio y sí agrega riesgo (Ley 21.719, proporcionalidad; hallazgo H-12 del expediente).
--
-- Decisión: la coordenada deja de existir. El mapa muestra zonas con la cantidad de leads y, al
-- elegir una, la lista de sus leads. La dirección se conserva en la ficha del lead: se necesita
-- para el contacto comercial.
--
-- Este es el paso "la app deja de escribir y la base lo rechaza" del procedimiento de
-- docs/BASE_DE_DATOS.md (expandir → copiar → convivir → contraer). Las columnas latitude,
-- longitude y location se eliminan después, en una migración propia (contraer), cuando ninguna
-- versión de la app las lea.
--
-- ATENCIÓN (datos existentes): se borran las coordenadas de todos los leads y la caché de
-- geocodificación. No se pierde información del negocio: la zona (assigned_territory_id) queda.
-- ============================================================================

-- 1. Borrar las coordenadas guardadas. El bypass de privacidad deja pasar también los leads con
--    una solicitud del titular pendiente, que el trigger de privacidad bloquea para cualquier cambio.
DO $$
BEGIN
    PERFORM set_config('revela.privacy_bypass', 'on', TRUE);
    UPDATE public.leads
    SET latitude = NULL, longitude = NULL, location = NULL
    WHERE latitude IS NOT NULL OR longitude IS NOT NULL OR location IS NOT NULL;
    PERFORM set_config('revela.privacy_bypass', '', TRUE);
END;
$$;

-- 2. La base ya no acepta coordenadas de un lead
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_sin_coordenadas;
ALTER TABLE public.leads
    ADD CONSTRAINT leads_sin_coordenadas CHECK (latitude IS NULL AND longitude IS NULL AND location IS NULL);

COMMENT ON CONSTRAINT leads_sin_coordenadas ON public.leads IS
    'Minimización (Ley 21.719): un lead se ubica por zona (assigned_territory_id), nunca por coordenada. Las columnas quedan vacías hasta eliminarse.';
COMMENT ON COLUMN public.leads.latitude IS 'En desuso desde la 0019: siempre NULL. Se elimina en una migración posterior.';
COMMENT ON COLUMN public.leads.longitude IS 'En desuso desde la 0019: siempre NULL. Se elimina en una migración posterior.';
COMMENT ON COLUMN public.leads.location IS 'En desuso desde la 0019: siempre NULL. Se elimina en una migración posterior.';

-- 3. La caché de geocodificación guarda direcciones con su coordenada: se vacía y queda sin uso
DELETE FROM public.geocoding_cache;
COMMENT ON TABLE public.geocoding_cache IS
    'En desuso desde la 0019: Revela no geocodifica direcciones. Queda vacía hasta eliminarse.';

-- 4. La función que fijaba coordenadas deja de estar disponible para la app
REVOKE EXECUTE ON FUNCTION public.rpc_update_lead_coordinates(UUID, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, VARCHAR)
    FROM PUBLIC, anon, authenticated;
