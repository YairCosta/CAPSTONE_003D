# 6. Definition of Done

> Versión formal en Word, con plantilla de gestión de proyectos: [05_Definition_of_Done.docx](../Archivos%20Word/05_Definition_of_Done.docx)

Un cambio está **terminado** cuando cumple todo lo que sigue. Es la lista que se aplica antes de cada commit
(está escrita también en `CLAUDE.md`, "Al terminar un cambio").

## Para cualquier cambio

- [ ] Compila sin errores de tipos: `npx tsc -b`.
- [ ] Pasa el análisis estático: `npm run lint`.
- [ ] Pasan las pruebas que corresponden (ver [11-Plan-de-pruebas.md](11-Plan-de-pruebas.md)); si se tocó una regla de
      negocio, **se agregó una prueba** que la cubre.
- [ ] Si se ve en pantalla, se **verificó en el navegador** (y en modo claro y oscuro cuando cambia el diseño).
- [ ] La documentación de `docs/` refleja el comportamiento nuevo.
- [ ] El texto de la interfaz, los mensajes de error y los comentarios están en español.
- [ ] Accesibilidad básica: cada campo con `label`, botones de solo ícono con `aria-label`, errores explícitos.
- [ ] Fechas y montos con los ayudantes de `src/lib/`, nunca formateados a mano.

## Si toca la base de datos

- [ ] Se creó una **migración nueva** (nunca se edita una aplicada) con fecha y nombre descriptivo.
- [ ] Un cambio destructivo (renombrar, cambiar tipo, borrar) va en migraciones separadas.
- [ ] Toda tabla de datos tiene `company_id`, RLS, índice, `COMMENT ON` y un trigger que valida que sus referencias son
      del mismo CRM.
- [ ] `npm run test:sql` pasa (sintaxis, RLS, `COMMENT ON`, `search_path`).
- [ ] Se ensayó sin aplicar: `npm run test:db -- --con <migración>.sql`.
- [ ] Se aplicó (`npx supabase db push`), `npx supabase db lint --linked --level error` no encuentra errores y
      `npm run test:db` sigue en verde.

## Invariantes que ningún cambio puede debilitar

1. Los CRMs nunca se mezclan. 2. Un lead solo existe en un país habilitado del CRM. 3. El dinero se guarda en su moneda,
sin convertir. 4. Los roles y sus permisos. 5. El historial de auditoría solo se agrega y no guarda datos personales.
6. El asistente de IA nunca borra ni toca la configuración. 7. Los secretos no van en el repositorio. 8. Un lead se
ubica por zona, nunca por coordenada. 9. Un lead con solicitud del titular pendiente queda bloqueado. 10. Las
contraseñas solo las cambia su dueño.

## Antes de publicar

- [ ] `npm run build` y `npm run test:bundle` (la app publicada no trae datos de prueba ni claves).
- [ ] `npm run test:vercel` (la app y la API tal como quedarían en Vercel).
