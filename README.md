# Revela

CRM SaaS multi-tenant con inteligencia geográfica: captura leads, los ubica en un mapa por zona
(comuna, distrito…), mide qué se vende y dónde, y opera en varios países.

Proyecto de tesis de Ingeniería en Informática, Duoc UC (sección 003D).
Se pilotea con **Empresa Piloto**, empresa de servicios que opera en Chile y Perú.

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
| Base de datos | PostgreSQL + PostGIS en Supabase (esquema listo, aún sin conectar) |
| Servicios | Gemini (asistente), Google Places, Banco Central de Chile (tipo de cambio) |

## Cómo ejecutarlo

```bash
npm install
npm run dev
```

La aplicación queda en `http://localhost:5173`. Los datos son de ejemplo y viven en memoria: se
reinician al recargar la página.

Cuentas de demostración (solo local):

| Perfil | Email | Contraseña |
|---|---|---|
| Gerente | gerente@demo.revelacrm.com | dev-gerente-local |
| Usuario base | vendedor@demo.revelacrm.com | dev-base-local |
| Administrador | admin@revelacrm.com | dev-admin-solo-local |

Para el asistente de IA hace falta un archivo `.env.local` con `GEMINI_API_KEY`
(ver `.env.example`). Ese archivo nunca se sube al repositorio.

## Pruebas

```bash
npm run test:tenant   # aislamiento entre CRMs y reglas de negocio
npm run test:export   # exportación a Excel
npm run test:sql      # migraciones de la base de datos
npm run test:e2e      # punta a punta con Chrome (requiere npm run dev)
```

## Documentación

En [`docs/`](docs/): base de datos, multipaís, monedas, catálogo, contactos, agenda, exportación,
auditoría, usuarios, asistente de IA, seguridad y los diagramas de arquitectura, componentes y
estados.

## Estado

Interfaz y reglas de negocio completas y probadas. Falta conectar la base de datos (hoy los datos
están en memoria) y desplegar.
