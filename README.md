# Revela

CRM SaaS multi-tenant con inteligencia geográfica: captura leads, los ubica en un mapa por zona
(comuna, distrito…), mide qué se vende y dónde, y opera en varios países.

Proyecto de tesis de Ingeniería en Informática, Duoc UC (sección 003D).
Se pilotea con **Empresa Piloto**, empresa de servicios que opera en Chile y Perú. La aplicación
trae una **cuenta de demostración** con datos ficticios, pensada para quien llega desde la landing.

## Qué hace

- **KPI y mapa:** leads ubicados por comuna o distrito, zonas coloreadas por dinero ganado o por
  cierres, y ranking de zonas y de productos.
- **Pipeline:** tablero por etapas, del lead nuevo hasta ganado o descartado.
- **Registro de contacto y agenda:** bitácora de cada interacción y calendario de seguimientos.
- **Gerencia:** empresas cliente, contactos, catálogo de productos y servicios, y usuarios del CRM.
- **Auditoría:** historial de cambios que solo se agrega, con reversión de un cambio.
- **Administración:** creación y suspensión de CRMs, y exportación a Excel.
- **Asistente de IA:** busca empresas y registra leads, sin poder borrar nada.

Cada empresa tiene su propio CRM y los datos nunca se mezclan: el aislamiento se valida en la
aplicación y, en producción, con RLS y triggers en la base de datos.

## Tecnologías

| Capa | Herramientas |
|---|---|
| Interfaz | React 19, TypeScript, Vite, Tailwind CSS v4 |
| Mapa | Leaflet, mapas base de Esri |
| Base de datos | PostgreSQL 17 + PostGIS en Supabase (toda la app conectada con `VITE_DATA_SOURCE=supabase`; la demo sigue en memoria) |
| Servicios | Gemini u OpenAI (asistente), Google Places, Banco Central de Chile (tipo de cambio) |

## Cómo ejecutarlo

```bash
npm install
npm run dev
```

La aplicación queda en `http://localhost:5173`. Por defecto los datos son de ejemplo y viven en
memoria: se reinician al recargar la página. Con `VITE_DATA_SOURCE=supabase` en `.env.local`, el
login y la administración de la plataforma usan la base real de Supabase (ver `docs/USUARIOS.md`);
en desarrollo, `?demo` en la URL vuelve a la demo.

Cuentas de demostración (solo local):

| Perfil | Email | Contraseña |
|---|---|---|
| Gerente | gerente@demo.revelacrm.com | demo1234 |
| Usuario base | vendedor@demo.revelacrm.com | demo1234 |

La cuenta de administrador de plataforma solo existe en desarrollo y no viaja en la aplicación
publicada: en producción vive en Supabase Auth.

Para el asistente de IA hace falta un archivo `.env.local` con `GEMINI_API_KEY`
(ver `.env.example`). Ese archivo nunca se sube al repositorio.

## Pruebas

```bash
npm run test:tenant   # aislamiento entre CRMs y reglas de negocio
npm run test:export   # exportación a Excel
npm run test:ai       # asistente de IA (OpenAI simulado)
npm run test:sql      # migraciones de la base de datos
npm run test:db       # reglas de la base real de Supabase (lo deshace todo al terminar)
npm run test:supabase # conexión con Supabase e invitaciones, con Supabase simulado
npm run test:e2e      # punta a punta con Chrome (requiere npm run dev)
```

## Documentación

En [`docs/`](docs/): base de datos, multipaís, monedas, catálogo, contactos, agenda, exportación,
auditoría, usuarios, asistente de IA, seguridad, cumplimiento de la Ley 21.719, pagos y los diagramas de arquitectura, componentes y
estados.

## Estado

Interfaz y reglas de negocio completas y probadas. Falta conectar la base de datos (hoy los datos
están en memoria) y desplegar.
