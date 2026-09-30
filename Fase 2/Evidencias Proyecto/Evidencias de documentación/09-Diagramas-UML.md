# 9. Diagramas UML

Los cuatro diagramas mínimos del instructivo, escritos en Mermaid (se ven en GitHub y se editan como texto).

## 9.1 Casos de uso

```mermaid
flowchart LR
    V(["Usuario base<br/>(vendedor)"])
    G(["Gerente"])
    A(["Administrador<br/>de la plataforma"])
    T(["Titular de datos"])
    S(["Sistema<br/>(tareas automáticas)"])

    subgraph Revela
        direction TB
        CU1(["Capturar lead"])
        CU2(["Avanzar un lead en el pipeline"])
        CU3(["Registrar contacto y seguimiento"])
        CU4(["Ver KPI y mapa por zonas"])
        CU5(["Usar el asistente de IA"])
        CU6(["Registrar solicitud del titular"])
        CU7(["Administrar catálogo y empresas cliente"])
        CU8(["Administrar usuarios del CRM"])
        CU9(["Elegir países y divisas"])
        CU10(["Resolver solicitud del titular"])
        CU11(["Ver auditoría y revertir un cambio"])
        CU12(["Cargar la clave de OpenAI y fijar el presupuesto"])
        CU13(["Crear y suspender CRMs"])
        CU14(["Exportar los datos de un CRM"])
        CU15(["Ver uso y soporte (solo números)"])
        CU16(["Anonimizar prospectos vencidos (30 días)"])
    end

    V --> CU1 & CU2 & CU3 & CU4 & CU5 & CU6
    G --> CU1 & CU2 & CU3 & CU4 & CU5 & CU6
    G --> CU7 & CU8 & CU9 & CU10 & CU11 & CU12
    A --> CU13 & CU14 & CU15
    T -.->|"pide acceso, rectificación,<br/>supresión u oposición"| CU6
    S --> CU16
```

*Versión anterior del diagrama (cuando el producto se llamaba GeoCRM):* [`docs/diagrama-casos-de-uso-geocrm.png`](../../../docs/diagrama-casos-de-uso-geocrm.png).

## 9.2 Diagrama de clases (dominio principal)

Clases del dominio tal como están en `src/types/crm.ts`.

```mermaid
classDiagram
    class Company {
        +id
        +name
        +plan
        +homeCountry
        +isActive
    }
    class AppUser {
        +id
        +companyId
        +fullName
        +email
        +role
        +isActive
    }
    class Lead {
        +id
        +companyId
        +countryCode
        +fullName
        +commercialStatus
        +estimatedDealValue
        +currency
        +assignedTerritoryId
        +dataOrigin
        +consentStatus
        +noContact
        +anonymizedAt
    }
    class ClientAccount {
        +id
        +companyId
        +name
        +countryCode
    }
    class LeadContact {
        +id
        +fullName
        +jobTitle
        +isPrimary
    }
    class LeadActivity {
        +id
        +channel
        +outcome
        +summary
        +nextFollowUpDate
    }
    class CatalogItem {
        +id
        +itemType
        +name
        +billingType
        +prices
    }
    class LeadItem {
        +catalogItemId
        +quantity
        +unitPrice
    }
    class PrivacyRequest {
        +reason
        +status
        +decidedBy
    }
    class StageConfig {
        +stage
        +label
        +winProbability
        +slaDays
    }
    class AuditEntry {
        +action
        +entity
        +actorId
        +changes
        +revertedAt
    }

    Company "1" --> "*" AppUser
    Company "1" --> "*" Lead
    Company "1" --> "*" ClientAccount
    Company "1" --> "*" CatalogItem
    Company "1" --> "*" StageConfig
    Company "1" --> "*" AuditEntry
    ClientAccount "1" --> "*" Lead
    Lead "1" --> "*" LeadContact
    Lead "1" --> "*" LeadActivity
    Lead "1" --> "*" LeadItem
    Lead "1" --> "0..1" PrivacyRequest
    CatalogItem "1" --> "*" LeadItem
    AppUser "1" --> "*" AuditEntry : autor
```

## 9.3 Secuencia de la funcionalidad principal: capturar un lead y verlo en el mapa

```mermaid
sequenceDiagram
    actor U as Usuario base
    participant UI as Interfaz (React)
    participant G as Guards (src/lib/tenantGuards.ts)
    participant DB as Supabase (RLS + triggers)
    participant AU as Auditoría

    U->>UI: Completa el formulario (país, zona, origen y base del dato)
    UI->>G: Validar el lead
    G-->>UI: Mismo CRM, país habilitado, zona de ese país, base del dato presente
    alt Reglas incumplidas
        UI-->>U: Muestra el error explícito
    else Válido
        UI->>DB: Guardar el lead con la sesión de la persona
        DB->>DB: RLS y trigger confirman que todo es del mismo CRM
        DB->>DB: change_log anota quién cambió qué columnas (sin valores)
        DB-->>UI: Lead guardado
        UI->>AU: Registrar la entrada de auditoría (sin datos personales)
        UI->>UI: Recalcula los KPI de la zona
        UI-->>U: El lead aparece en el pipeline y la zona sube en el mapa
    end
```

## 9.4 Secuencia: el asistente de IA guarda un lead

```mermaid
sequenceDiagram
    actor U as Gerente o vendedor
    participant W as Chat (navegador)
    participant API as /api/ai/chat
    participant SB as Supabase (Auth, Vault, presupuesto)
    participant O as OpenAI

    U->>W: "Busca talleres en San Bernardo y guarda el primero"
    W->>API: POST + Bearer (token de sesión)
    API->>SB: Verificar la sesión y el perfil activo
    API->>API: Tope de 60 consultas cada 10 minutos por persona
    API->>SB: Leer la clave de OpenAI de ese CRM (Vault)
    API->>SB: Leer el gasto del mes
    alt Sin clave, o presupuesto agotado, o no se pudo verificar
        API-->>W: Mensaje claro (400, 402 o 503) y no se llama a OpenAI
    else Puede consultar
        API->>O: Conversación + herramientas (function calling)
        O-->>API: Pide guardar el lead (tool call)
        API->>SB: Anotar el costo real de la llamada
        API-->>W: tool_calls
        W->>W: Ejecuta la herramienta con los guards del CRM (nunca directo al estado)
        W->>API: Resultado de la herramienta
        API->>O: Continúa la conversación
        O-->>API: Respuesta final
        API-->>W: Texto + gasto actualizado
        W-->>U: "Guardé el lead" (queda en la auditoría)
    end
```

## 9.5 Diagrama de componentes

![Componentes de Revela](../../../docs/diagramas/componentes-revela.png)

Descripción de cada componente en [07-Arquitectura.md](07-Arquitectura.md) §7.2.
