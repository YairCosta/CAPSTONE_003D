# 11. Plan de pruebas y evidencias

Las pruebas son **automáticas**, se escriben junto con el cambio y se corren antes de cada publicación (ver
[Definition of Done](../Archivos%20Word/05_Definition_of_Done.docx)). Resultado de la última corrida completa: **30-09-2026, todo en verde**.

## 11.1 Suites y qué prueban

| Tipo | Comando | Qué cubre | Pruebas | Necesita |
|---|---|---|---|---|
| **Unitarias** (lógica de negocio) | `npm run test:tenant` | Guards de aislamiento entre empresas, permisos por rol, países, monedas, auditoría, derechos del titular | 78 | Nada |
| Unitarias | `npm run test:export` | Exportación de los datos de una empresa a Excel | 7 | Nada |
| Unitarias + contrato | `npm run test:ai` | Asistente de IA con OpenAI **simulado**: herramientas, presupuesto, claves por empresa, que la clave nunca salga ni se registre | 48 | Nada |
| **Integración** (capa de datos) | `npm run test:supabase` | Conexión con Supabase **simulado**: lectura, escritura por diferencias, invitaciones, errores | 56 | Nada |
| Integración (base de datos) | `npm run test:sql` | Sintaxis de las 32 migraciones, RLS en toda tabla con `company_id`, `COMMENT ON`, `search_path` | 101 | Nada |
| **Integración y seguridad contra la base real** | `npm run test:db` | Funciones, triggers y RLS de la base de Supabase, **incluidos ataques desde dentro** (usuario base, gerente de otro CRM, sin sesión). Corre dentro de una transacción que lo deshace todo | 257 | Acceso al proyecto de Supabase |
| **Sistema / punta a punta** | `npm run test:e2e` | Flujos completos en Chrome: acceso, aislamiento entre CRMs, pipeline, catálogo, privacidad, asistente, administración | 148 | Chrome y `npm run dev` |
| **Seguridad de lo publicado** | `npm run test:bundle` | La app compilada no trae CRMs de prueba, cuentas de desarrollo ni claves de `.env.local` | 8 | `npm run build` |
| Seguridad y despliegue | `npm run test:vercel` | La app y la API tal como quedarían en Vercel: rutas, sesión obligatoria, CSP sin violaciones | 24 | Chrome |
| **Rendimiento** | `npm run test:rendimiento` | Carga de la app (LCP, peso del JavaScript) y latencia de la API | 6 mediciones | Chrome y la app en marcha |

**Total: 727 comprobaciones automáticas** (más 6 mediciones de rendimiento).

## 11.2 Evidencia

- Salida real de las suites: [`docs/evidencia/pruebas-automaticas.txt`](../../../../docs/evidencia/pruebas-automaticas.txt) y su captura
  [`pruebas-automaticas.png`](../../../../docs/evidencia/pruebas-automaticas.png), generadas con `node scripts/generar-evidencia.mjs`.
- Capturas de la aplicación en ejecución: [`docs/evidencia/`](../../../../docs/evidencia/).
- Medición de rendimiento del 30-09-2026 (línea base):

| Medición | Resultado | Umbral |
|---|---|---|
| LCP (mediana de 5 cargas en frío) | 204 ms | ≤ 2.500 ms |
| Carga de la página (`load`) | 69,8 ms | ≤ 4.000 ms |
| JavaScript de la primera pantalla | 961,3 KB en 17 archivos | ≤ 1.100 KB |
| JavaScript comprimido (gzip) | 277,8 KB | ≤ 350 KB |
| API · mediana de 50 peticiones | 0,6 ms | ≤ 100 ms |
| API · percentil 95 | 0,9 ms | ≤ 300 ms |

## 11.3 Pruebas de seguridad destacadas

- **Ataques simulados contra la base real** (`scripts/sql/prueba-ataques-remota.sql`): una cuenta sin invitación intenta
  ver datos ajenos o crear empresas cliente; un usuario base intenta retroceder un lead, cambiar un monto, inflar el valor
  de un lead que no capturó, borrar leads, leer el historial de cambios, subirse a gerente, editar zonas o resolver
  solicitudes del titular; la gerencia intenta renombrar zonas oficiales. En la revisión del 27-09-2026 esta prueba pasó
  de **12 fallas a 0 de 37**. Ver `docs/SEGURIDAD.md` §5.
- **Pruebas de mutación hechas a mano** sobre las pruebas de seguridad del asistente (30-09-2026): se rompió a propósito la
  protección (dejar la clave en el registro, devolverla en una respuesta, dejar que cualquiera la cambie) y las pruebas
  lo detectaron las tres veces. Ver `docs/SEGURIDAD.md` §7.
- **Búsqueda de secretos** en todo el historial antes de publicar este repositorio.

## 11.4 Cómo se corre todo

```bash
npm ci
npx tsc -b && npm run lint
npm run test:tenant && npm run test:export && npm run test:ai && npm run test:supabase && npm run test:sql
npm run build && npm run test:bundle && npm run test:vercel
npm run dev            # en otra terminal, para el e2e
npm run test:e2e
APP_URL=http://localhost:5173 npm run test:rendimiento
```

`npm run test:db` necesita acceso al proyecto de Supabase (`npx supabase login` y `link`), por lo que no se puede correr
sin esas credenciales; su resultado queda en la evidencia.

## 11.5 Qué no cubren las pruebas

- No se mide la **cobertura de código** (no hay herramienta de cobertura configurada).
- No hay pruebas unitarias de los componentes visuales: se cubren con el e2e y con la lógica pura de `src/lib/`.
- No hay prueba de **carga con muchos usuarios simultáneos** ni pruebas de penetración externas.
- La imagen Docker no se construyó en el equipo de desarrollo (no tiene Docker): se probó el servidor que contiene.
