-- ============================================================================
-- 0024 · Vaciar las copias de contorno de cada CRM (el contorno ya se lee del catálogo, 0023)
-- ============================================================================
-- Paso "contraer" de la 0023: desde ahí la vista territories_geojson, la distribución por zona y la
-- exportación leen el contorno de zone_catalog. Las copias que cada CRM guardaba en territories.polygon
-- ya no se usan: se vacían para liberar espacio. Solo las de zonas que están en el catálogo (su
-- contorno sigue disponible). La columna se elimina en una migración posterior.
-- ============================================================================

UPDATE public.territories t
SET polygon = NULL
FROM public.zone_catalog z
WHERE z.country_code = t.country_code
  AND z.code = t.code
  AND t.polygon IS NOT NULL;
