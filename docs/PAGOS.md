# Cómo se contrata y se paga Revela

Diseño del alta de clientes y del cobro. Todavía no está implementado: este documento define cómo
se hará y por qué, para que el día que se construya no haya que improvisar.

La regla que manda sobre todas las demás: **Revela nunca ve la contraseña de un cliente ni los
datos de su tarjeta.** Las dos cosas las maneja un tercero especializado.

---

## 1. El recorrido del cliente

```
Landing (revelacrm.com)
   │
   ├── "Probar la demo"  ──►  revela-henna.vercel.app/?demo: datos ficticios, sin registro ni contraseña,
   │                           nada sale del navegador y se borra al recargar
   │
   └── "Contratar"
         │
         1. Registro: nombre de la empresa, RUT, email y CONTRASEÑA que elige la persona
         │            (la crea Supabase Auth; Revela solo recibe "usuario creado")
         2. Se crea su CRM en estado "prueba", con 14 días de plazo
         3. Entra y lo usa de inmediato, con sus propios datos
         │
         4. Paga desde la app: se le manda al checkout del proveedor de pago
         5. El proveedor avisa a Revela por un webhook: "la suscripción quedó activa"
         6. Su CRM pasa a "activo"
```

**Por qué en este orden.** Tu idea era pedir el pago primero y entregar el acceso después. Es mejor
al revés, por tres razones:

1. **El cliente prueba antes de pagar**, que es lo esperable en un software por suscripción.
2. **Tú no creas cuentas a mano**, así que nunca conoces ni escribes la contraseña de nadie.
3. **Si no paga, el CRM se suspende solo** y sus datos se conservan. No hay que borrar nada ni
   hacer devoluciones.

## 2. Estados de la suscripción

| Estado | Qué puede hacer el cliente | Cómo se llega |
|---|---|---|
| **Prueba** | Todo, por 14 días | Al registrarse |
| **Activa** | Todo | El proveedor confirma el pago |
| **Vencida** | Solo leer y exportar sus datos, por 15 días | Un cobro falló |
| **Suspendida** | No entra; sus datos se conservan | Pasaron los 15 días de gracia |
| **Cerrada** | Sus datos se eliminan tras el plazo pactado | El cliente cancela |

Estos estados se apoyan en lo que ya existe: el campo `isActive` del CRM y el plan Nacional o
Internacional. Falta agregar la tabla de suscripciones y la de pagos.

## 3. Qué proveedor de pago conviene

| Proveedor | Cubre | Ventaja | Desventaja |
|---|---|---|---|
| **Flow** | Chile | Junta Webpay, transferencia y otros en una sola integración; documentación clara; suscripciones incluidas | Solo Chile, y cobra comisión sobre Webpay |
| **Transbank Webpay Plus** | Chile | La pasarela que la gente reconoce; comisión más baja | Integración más burocrática; el cobro recurrente es aparte |
| **Mercado Pago** | Chile y Perú | Sirve para los dos países y es fácil de integrar | Imagen más de comercio que de software empresarial |
| **Khipu** | Chile | Transferencia bancaria con comisión baja | No sirve para cobro automático mensual |
| **Stripe** | Internacional | El mejor manejo de suscripciones; ideal si se cobra en dólares | Menos natural para una empresa chica que factura en Chile |

**Recomendación:** empezar con **Flow** para el piloto en Chile, porque resuelve el cobro mensual
sin construirlo, y dejar **Stripe** para cuando haya clientes fuera de Chile. Como Revela ya maneja
varias monedas, el salto no obliga a rehacer nada.

Aparte va la **boleta o factura electrónica** ante el SII, que se puede resolver después con un
servicio de facturación.

## 4. Qué se guarda y qué no

**Nunca se guarda:**
- el número de tarjeta, su fecha de vencimiento ni el código de seguridad. Guardar eso obliga a
  cumplir la norma PCI DSS, que ninguna empresa pequeña quiere asumir;
- la contraseña del cliente, ni siquiera de forma temporal;
- comprobantes con datos de tarjeta completos.

**Sí se guarda**, en tablas nuevas:

| Tabla | Contenido |
|---|---|
| `subscriptions` | CRM, plan, estado, fecha de renovación e identificador del proveedor |
| `payments` | Monto, moneda, fecha, estado e identificador de la transacción |

Del medio de pago solo se guarda lo que el proveedor devuelve para mostrarlo: el tipo de tarjeta y
los últimos cuatro dígitos.

## 5. El webhook: la parte delicada

Cuando alguien paga, el proveedor le avisa a Revela con una llamada a un `/api/pagos/webhook`, que
en producción será una **Edge Function de Supabase**. Tres cuidados obligatorios:

1. **Verificar la firma** del mensaje. Sin eso, cualquiera podría avisar "ya pagué" y activarse un
   CRM gratis.
2. **Aguantar mensajes repetidos.** Los proveedores reintentan; el mismo pago no puede activar dos
   meses.
3. **No confiar en el monto que llega**: se consulta la transacción contra la API del proveedor
   antes de activar.

Además, el resultado de un pago **nunca** se decide en el navegador: que la pantalla diga "pago
exitoso" no activa nada; solo lo hace el webhook.

## 6. Relación con la Ley 21.719

- Revela es **encargado de tratamiento** de los datos de los clientes de sus clientes. El contrato
  de encargo se firma al contratar y se guarda como parte del alta.
- Que la contraseña la cree el propio cliente en Supabase Auth cumple el **principio de seguridad**
  y el **deber de confidencialidad**: la plataforma no puede leerla.
- Al cerrar una cuenta hay que respetar el **derecho de cancelación**: exportación de sus datos
  primero, borrado después, con un plazo escrito en el contrato.
- El proveedor de pago es otro encargado, y sus datos de facturación también son datos personales.

Ver [`LEY_21719.md`](LEY_21719.md).

## 7. Qué falta construir

1. Registro público de empresas, con creación del CRM y del primer gerente.
2. Supabase Auth en lugar del login de demostración.
3. Tablas `subscriptions` y `payments`, con RLS y su migración.
4. Integración con Flow: checkout y webhook en una Edge Function.
5. Pantalla de suscripción en la app: plan, estado, historial de pagos y cambio de plan.
6. Aviso de vencimiento y suspensión automática.
7. Facturación electrónica ante el SII.
