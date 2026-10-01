# 13. Innovación

La asignatura exige una solución innovadora. Esta sección responde las tres preguntas del instructivo. Se evita
comparar con productos concretos o citar cifras de mercado que no se hayan verificado: lo que sigue describe lo que
Revela hace y cómo se comprueba.

## ¿Qué problema resuelve?

Las empresas B2B que venden en varios países de América Latina no saben **dónde** cierran sus negocios ni **qué**
productos se venden en cada zona, y gestionar los datos personales de sus leads con planillas es incompatible con la
Ley 21.719 (vigente desde el 01-12-2026). Ver [Acta de inicio](../Archivos%20Word/00_Acta_de_Inicio_del_Proyecto.docx).

## ¿Qué hace diferente a la solución?

| Aporte | Qué hace | Cómo se comprueba |
|---|---|---|
| **Geografía oficial por país, sin ubicar a nadie** | Cada lead se ubica en su zona oficial (comuna en Chile, distrito en Perú, municipio en México…; 14.489 zonas de 19 países). El mapa muestra zonas con su cantidad de leads, **nunca la ubicación exacta**; la base de datos no tiene columnas para guardar coordenadas | Migraciones 0019–0028; `test:db` |
| **Privacidad operativa, no solo declarada** | El origen y la base de cada dato son obligatorios; un lead con solicitud del titular pendiente queda **bloqueado en los guards y en la base**; se anonimiza a pedido o a los 30 días si era un prospecto que nadie contactó; existe un portal fiscalizador de solo lectura | `docs/LEY_21719.md`, `docs/cumplimiento/`, `test:tenant`, `test:db` |
| **Multiempresa con aislamiento probado con ataques** | Las empresas comparten la plataforma sin verla entre sí; la regla está en la base (RLS y triggers) y se prueba atacándola desde dentro | `test:db` (257), prueba de ataques |
| **Multipaís y multimoneda sin falsear cifras** | Cada lead se negocia en su moneda y se guarda **sin convertir**; la conversión ocurre solo para mostrar y sumar | `docs/MONEDAS.md` |
| **Asistente de IA con límites duros** | Busca empresas y registra leads por lenguaje natural, pero **no puede borrar nada ni tocar la configuración**; cada empresa usa su propia clave de OpenAI (cifrada) y un presupuesto mensual que el servidor hace cumplir | `docs/ASISTENTE_IA.md`, `test:ai` (48) |
| **Auditoría inalterable que no guarda datos personales** | Todo cambio queda registrado con quién, qué y cuándo; se puede revertir lo de negocio, pero el historial nunca almacena un nombre o un correo | `docs/AUDITORIA.md` |

## ¿Qué valor agrega?

- **Para la gerencia:** responde "¿dónde vendemos más?" en una pantalla y mide qué producto rinde en cada zona.
- **Para el equipo comercial:** captura rápida y un asistente que ahorra la búsqueda manual de empresas.
- **Para la empresa:** reduce el riesgo legal al tener los derechos del titular resueltos dentro de la herramienta, y el
  costo de la IA queda acotado y en su propia cuenta.
- **Para quien opera la plataforma:** puede atender a varios clientes sin ver los datos de sus leads; solo números.

## Qué no es innovación (para ser claros)

El pipeline, el registro de contactos y la exportación a Excel son funciones habituales de un CRM. La diferencia está en
la combinación descrita arriba: geografía oficial sin ubicación exacta, privacidad que la herramienta hace cumplir y
aislamiento verificado con ataques.
