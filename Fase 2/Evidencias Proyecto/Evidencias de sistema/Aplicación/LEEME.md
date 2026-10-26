# Evidencias de sistema · Aplicación

El código de la aplicación **vive en la carpeta `Proyecto/` de este repositorio**, donde se puede instalar y ejecutar tal cual; no se
duplica aquí.

| Qué | Dónde |
|---|---|
| Interfaz (React + TypeScript) | [`src/`](../../../../Proyecto/src/) |
| API del servidor (asistente de IA, tipos de cambio, invitaciones) | [`server/`](../../../../Proyecto/server/) |
| Pruebas automáticas y scripts | [`scripts/`](../../../../Proyecto/scripts/) |
| Empaquetado: Docker | [`Dockerfile`](../../../../Proyecto/Dockerfile), [`docker-compose.yml`](../../../../Proyecto/docker-compose.yml) |
| Publicación (Vercel) | [`vercel.json`](../../../../Proyecto/vercel.json) |

**Aplicación publicada:** <https://revela-henna.vercel.app> · **demo pública, sin cuenta:** <https://revela-henna.vercel.app/?demo>

Cómo ejecutarla: [README](../../../../README.md) y [Manual técnico](../../Evidencias%20de%20documentación/Archivos%20.md/12-Manual-tecnico-y-despliegue.md).
## Capturas de la aplicación (26-10-2026)

Tomadas de la aplicación publicada, en su demo pública (datos ficticios), en [`Capturas de la aplicación/`](Capturas%20de%20la%20aplicaci%C3%B3n/):

| Captura | Qué muestra |
|---|---|
| `01_Inicio_de_sesion` | Inicio de sesión con la cuenta de la empresa |
| `02_KPI_y_filtros` | KPI de la gerencia y filtros por empresa, zona, estado y fecha |
| `03_Mapa_por_zonas` | Mapa con las zonas que tienen leads y el ranking de zonas por dinero ganado |
| `04_Productos_y_servicios_por_zona` | Qué se vende y dónde, por producto o servicio |
| `05_Pipeline` | Pipeline por etapas, del lead nuevo al cierre |
| `06_Registro_de_contacto_y_agenda` | Registro de cada contacto y agenda de seguimientos |
| `07` a `10` | Gerencia: empresas cliente, catálogo, usuarios del CRM y países y divisas |
| `11_Auditoria` | Historial de cambios (solo se agrega; los datos personales no se guardan) |
| `12_Captura_de_lead` | Formulario de captura con el origen y la base del dato (Ley 21.719) |
| `13_Vista_usuario_base` | Lo que ve un usuario base: solo Pipeline y Registro de contacto |
| `14_Landing` | Página informativa con el video del recorrido |

Capturas anteriores: [`docs/evidencia/`](../../../../Proyecto/docs/evidencia/).

## Prueba en Docker (26-10-2026)

La imagen se construyó y se levantó con Docker Desktop 29.9 en Windows, y se probó con `npm run test:docker`:

| Comprobación | Resultado |
|---|---|
| La imagen se construye (`docker compose build`) | ✓ en 49 s, 474 MB |
| El contenedor queda sano (`HEALTHCHECK` sobre `/api/ai/status`) | ✓ healthy |
| La página principal responde | ✓ HTTP 200 |
| La API de tipos de cambio responde | ✓ con tasas reales |
| La API del asistente responde sin claves en la imagen | ✓ HTTP 200 |
| Una ruta de la API que no existe da 404 | ✓ |
| La demo abre sin contraseña y muestra el CRM, sin errores de JavaScript | ✓ |

![Prueba de la imagen de Docker](Prueba%20en%20Docker/docker-prueba-26-10-2026.png)

![La demo servida desde el contenedor](Prueba%20en%20Docker/docker-demo-26-10-2026.png)
