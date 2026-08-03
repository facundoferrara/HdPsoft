# Documento de Diseño — Software de Tracking HDP 2026
### Cruz del Sur · Versión 3 · Julio 2026

---

> **Estado:** Validado. Listo para iniciar desarrollo.

---

## 1. Propósito

Sistema web para el seguimiento en tiempo real del Torneo Hojas de Plata 2026. Objetivos:

- Generar y gestionar los emparejamientos de cada ronda (pares + cuerpo de control)
- Digitalizar los resultados de las planillas de asalto
- Mostrar el estado de las arenas y el leaderboard en vivo durante el evento
- Generar estadísticas completas del evento para análisis post-torneo y premios especiales

---

## 2. Stack Tecnológico

| Capa | Tecnología |
|---|---|
| Frontend | React + Vite |
| Base de datos / Backend | Firebase (Firestore + Auth) |
| Hosting | hojasdeplata.com vía Donweb (DNS apuntando a Firebase Hosting) |
| Tiempo real | Firestore onSnapshot listeners |
| Configuración | Documento `/config/scoring` en Firestore — valores numéricos editables sin re-deploy |

Firebase fue elegido por su capacidad de actualización en tiempo real sin polling, su modelo serverless y su tier gratuito suficiente para la escala del evento.

---

## 3. Escala del Evento

- **Cap de inscripción:** 65 participantes
- **Asistencia estimada:** 50 participantes
- **Asaltos por ronda (50 participantes):** 25 asaltos
- **Arenas simultáneas:** 4
- **Asaltos por arena por ronda:** ~6–7
- **Rondas objetivo:** ~8 (ajuste dinámico por proyección a partir de ronda 2)
- **Población mínima para correr el evento:** 20 personas (4 asaltos iniciales simultáneos sin repetición)
- **Roles por asalto:** 5 personas (2 tiradores + 1 árbitro + 2 jueces de línea)

---

## 4. Vistas Principales

### `/admin`
Acceso restringido por contraseña simple. Operada por la Autoridad de Mesa (Ari).
Contiene tres paneles:
- **Scheduler de arena:** gestión visual de asaltos por ronda (ver sección 6)
- **Carga de resultados:** entrada de datos de planillas de asalto (ver sección 10)
- **Panel de infracciones:** tracker de amarillas en tiempo real (ver sección 7b)

### `/display`
Pública, sin autenticación. Diseñada para proyectarse en pantalla durante el evento.
Dos columnas en tiempo real:
- **Columna izquierda:** estado de las 4 arenas (asalto activo, tiradores, árbitro)
- **Columna derecha:** top 10 leaderboard con puntuación acumulada

### `/stats`
Pública. Panel de estadísticas completas del evento. Disponible durante y post-evento.

---

## 5. Modelo de Datos (Firestore)

**Nota de terminología:** las colecciones usan nombres técnicos en inglés (`matches`, `exchanges`). La UI usa siempre la terminología del reglamento: `matches` → *asalto*, `exchanges` → *intercambio*.

---

### `config/scoring`
Documento de configuración global. Leído al inicializar el frontend. Permite ajustar valores sin re-deploy — crítico para torneo de prueba.
```
{
  zone_values: {
    hand: 1,
    body: 2,
    head: 3,
    presa: 3
  },
  starting_points: 5,
  exchanges_to_win: 3,
  self_disarm_base: 3
}
```

### `config/event`
Estado global del evento. Escuchado via onSnapshot por `/display` y `/admin`.
```
{
  status: 'setup' | 'active' | 'break' | 'finished',
  break_ends_at: timestamp | null,  // null si es pausa manual indefinida
  target_end_time: '18:00'          // hora límite del evento, para proyección de rondas
}
```

### `fighters`
```
{
  id: string,
  name: string,
  club: string,             // campo crítico: sesgo de emparejamiento y asignación de cuerpo de control
  tier: 'tbd' | 'boffer' | 'nylon' | 'acero' | 'na',
  // tbd: inscripto, gear check pendiente
  // boffer/nylon/acero: acreditado, tier definido en gear check
  // na: inscripto pero no se presentó
  // el scheduler ignora tier 'tbd' y 'na' al generar emparejamientos
  weapon: string | null,    // arma propia aprobada en gear check; null = usa fallback de CDS
  role: 'referee' | 'judge' | 'both'  // preferencia declarada en inscripción
}
```

### `rounds`
```
{
  id: string,
  round_number: number,
  status: 'pending' | 'active' | 'complete',
  started_at: timestamp | null,   // seteado al activar el primer asalto de la ronda
  completed_at: timestamp | null  // seteado al cerrar el último asalto de la ronda
}
```

### `matches`
```
{
  id: string,
  round_id: string,
  sequence_number: number,  // número global y secuencial del asalto en el torneo (1, 2, 3…)
  match_number: number,     // orden de generación dentro de la ronda

  // Tiradores (rojo/azul asignados al azar al generar el emparejamiento)
  fighter_red_id: string,
  fighter_blue_id: string,

  // Cuerpo de control (pre-asignado, rerollable)
  referee_id: string,
  judge_1_id: string,
  judge_2_id: string,

  // Tier del asalto y arma acordada
  match_tier: 'boffer' | 'nylon' | 'acero',   // = min(tier_red, tier_blue); determina equipo habilitado
  weapon: { name: string },                    // ej: 'sable', 'espada larga', 'messer'

  // Arena y estado
  arena: 1 | 2 | 3 | 4 | null,    // null = no asignado aún; asignación manual por Ari
  status: 'pending' | 'active' | 'complete' | 'cancelled',

  // Resultado
  final_score_red: number | null,
  final_score_blue: number | null,
  winner_id: string | 'draw' | null,  // fighter_id del ganador, 'draw', o null si no completado
  ended_early: boolean,
  ended_by_depletion: boolean,

  // Flags de advertencia (no bloquean, solo informan)
  same_club_warning: boolean,       // algún par tirador-árbitro/juez del mismo club
  rerolled: boolean                 // el cuerpo de control fue rerolleado al menos una vez
}
```

### `exchanges` (subcolección de `matches`)
```
{
  id: string,
  exchange_number: number,
  valid: boolean,
  invalidity_reason: 'inconclusive' | 'foul' | 'double_foul' | null,

  first_hit: {
    fighter: 'red' | 'blue',
    zone: 'hand' | 'body' | 'head' | 'presa',
    side: 'left' | 'right' | 'center'
  } | null,

  // null = no hubo contrapaso; objeto = hubo contrapaso, con zona y lado del golpe de respuesta
  contrapaso: null | {
    zone: 'hand' | 'body' | 'head' | 'presa',
    side: 'left' | 'right' | 'center'
  },

  is_double: boolean,
  double_red: { zone: string, side: string } | null,
  double_blue: { zone: string, side: string } | null,

  penalties: [
    {
      fighter: 'red' | 'blue',
      type: 'warning' | 'yellow' | 'red',
      reason: string
    }
  ],

  points_delta_red: number,   // delta neto del intercambio para rojo (puede ser negativo)
  points_delta_blue: number,  // delta neto del intercambio para azul (puede ser negativo)
  points_rescued: number      // puntos que el contrapaso evitó transferir; 0 si no hubo contrapaso
}
```

### `leaderboard` (colección desnormalizada)
Actualizada automáticamente al cerrar cada asalto o registrar un bye.
```
{
  fighter_id: string,
  name: string,
  club: string,
  total_points: number,     // hasta 2 decimales; nunca truncar al acumular
  rounds_played: number,
  matches_complete: number,
  bye_count: number         // cantidad de byes recibidos en el torneo; 0 en arranque
}
```

### `byes`
Registra los byes del torneo. Un bye no genera un asalto — es un evento independiente.
```
{
  id: string,
  fighter_id: string,
  round_id: string,
  calibration_points: number  // valor con hasta 2 decimales
}
```
Al registrar un bye: se escribe en `byes`, se incrementa `leaderboard.bye_count` del tirador, y se acumula `calibration_points` en `leaderboard.total_points`.

---

## 5b. Carga de Roster y Gear Check

### Carga pre-evento — Import desde Google Forms

La inscripción se gestiona vía Google Forms. Las respuestas se exportan como TSV/JSON y se importan a Firestore desde una vista de admin antes del evento. Campos importados:

- Nombre
- Club
- Rol preferido (árbitro / juez de línea / ambos)
- Tier declarado (referencial — se confirma en gear check)

Al importar, todos los tiradores arrancan con `tier: 'tbd'`.

### Vista de gear check — Día del evento

Vista en `/admin` para acreditación. Se opera escuela por escuela al inicio del evento.

**Por tirador:**
- Confirmar asistencia (`tbd` → tier habilitado, o `na` si no se presentó)
- Registrar arma propia aprobada (si trajo); `null` si usa fallback de CDS

**Por club (pool de armas compartidas):**
- Registrar qué armas simétricas trae la escuela disponibles para el día
- Esta información es referencial para Ari al momento de acordar armas en cada asalto

El scheduler solo considera tiradores con tier `boffer`, `nylon` o `acero` al generar emparejamientos. Los `tbd` y `na` son invisibles para la generación de rondas.

---

## 6. Generación de Ronda y Scheduler Visual

### Lógica de generación

**Ronda 1:**
- Emparejamiento aleatorio entre todos los participantes activos
- Sesgo anti-mismo-club (opción C — ver sección 7)
- Rojo/Azul asignado al azar por par
- Garantía de arranque: los primeros 4 asaltos generados usan 20 personas distintas para poder largar las 4 arenas simultáneamente

**Rondas siguientes (suizo):**
- Pool ordenado de peor a mejor score acumulado
- Emparejar por diferencia mínima de puntaje acumulado
- Antirepetición: restricción dura — nunca repetir una pareja (ver sección 7)
- Sesgo anti-mismo-club (opción C — ver sección 7)
- Rojo/Azul asignado al azar por par

**Asignación de cuerpo de control (todas las rondas):**
- Pre-asignada por el sistema al generar la ronda
- Distribución equitativa de roles en la ronda
- Preferencia por candidatos de distinto club que cualquiera de los tiradores; si no hay suficientes disponibles, asignar con `same_club_warning: true`
- Rerollable individualmente desde el dashboard

**Calibración (número impar de participantes activos):**
- El tirador sin pareja recibe puntuación de calibración = promedio de puntos de tiradores que completaron asaltos normales en esa ronda
- Excluye: ceros por tarjeta roja, otros calibrados en la misma ronda
- El valor puede contener hasta 2 decimales
- Se registra en la colección `byes`; el tirador queda disponible para el cuerpo de control durante esa ronda

### Dashboard de Ari — Scheduler visual

Panel de rectángulos, uno por asalto de la ronda. Cada rectángulo muestra:
- Nombres de los 2 tiradores, con club y tier individual
- **Tier del asalto** (`match_tier`) — badge prominente; = tier menor de los dos tiradores
- Árbitro y jueces asignados
- Indicador de advertencia de mismo club (si aplica)
- Botón de reroll de árbitro/jueces

**Estados de los rectángulos:**

| Color | Significado |
|---|---|
| Gris | Disponible — todos los integrantes libres |
| Naranja | Bloqueado — algún integrante en asalto activo |
| Cian | En curso — asignado a una arena |
| Verde | Completado |
| Rojo | Anulado |

**Interacciones:**
- Ari arrastra un rectángulo gris a una de las 4 arenas → asalto se activa
- Si el asalto asignado tiene `same_club_warning` → advertencia visual, no bloqueo
- Botón reroll → sistema selecciona árbitro/jueces disponibles en ese momento con preferencia anti-mismo-club
- Ari carga resultado y cierra el asalto → las 5 personas se liberan → rectángulos naranjas recalculan disponibilidad en tiempo real

**Comportamiento de asaltos fuera de orden:**
- Si el asalto N no puede correrse, Ari simplemente asigna el asalto N+1
- El asalto N permanece pendiente (gris u naranja) y puede asignarse después
- La ronda no se regenera

### Restricción de arranque

Los primeros 4 asaltos de cualquier ronda deben usar 20 personas distintas. Esto garantiza que las 4 arenas puedan largarse simultáneamente sin conflictos de disponibilidad.

---

## 6b. Estados del Evento y Flujo de Descanso

### Estados globales

| Estado | Descripción |
|---|---|
| `setup` | Gear check activo, antes de la Ronda 1 |
| `active` | Ronda en curso |
| `break` | Descanso programado o pausa manual |
| `finished` | Evento cerrado |

### Popup de descanso

Al cerrar el último asalto de una ronda, el sistema muestra automáticamente un popup en `/admin`:

- Opciones: **5 min** / **10 min**
- Al seleccionar: `event_status → 'break'`, `break_ends_at` seteado
- El `/display` muestra countdown en pantalla grande hasta `break_ends_at`
- Al terminar el countdown: `event_status → 'active'`, Ari puede generar la siguiente ronda

### Botón de pausa manual

Siempre visible en `/admin`, fijo al fondo de la pantalla. Cambia `event_status → 'break'` con `break_ends_at: null`. El `/display` muestra **"Pausa"** sin countdown. Ari levanta la pausa manualmente.

Cubre emergencias y demoras logísticas sin exponer desorganización a la sala.

### Proyección de rondas

Visible en `/admin` a partir de la Ronda 2:

```
Duración ronda 1: X min
Duración ronda 2: Y min
Promedio: Z min por ronda
Pausa entre rondas: 5 o 10 min (según última elección)
Rondas posibles antes de las 18hs: N
```

Cálculo: `(18:00 - hora_actual) / (promedio_ronda + pausa)` redondeado hacia abajo.

---

## 7. Lógica de Emparejamiento — Especificación Completa

### Emparejamiento de tiradores (suizo)

```
ORDEN DEL POOL: peor a mejor score acumulado

PRIORIDADES:
  1. Diferencia mínima de puntaje acumulado
  2. Antirepetición: RESTRICCIÓN DURA — nunca repetir una pareja
     Si no hay emparejamiento válido sin repetir → el tirador sin pareja recibe bye
  3. Sesgo anti-mismo-club: OPCIÓN C (dos pasadas)
     Primera pasada: emparejar óptimamente por puntaje, ignorando clubs
     Segunda pasada: para cada par mismo-club, intentar un swap con el par
       adyacente en el ranking que no rompa antirepetición ni genere un par
       peor en diferencia de puntaje. Si no existe swap válido, se deja el par.

ROJO/AZUL: asignado al azar al generar cada par
```

### Selección de tirador para bye

El pool se itera de peor a mejor para construir pares. El tirador que queda sin pareja al final es el mejor del ranking — el bye cae naturalmente hacia el tope de la tabla.

```
CRITERIOS EN ORDEN:
  1. El tirador sin pareja al iterar de peor a mejor es el mejor del ranking.
     Si ese tirador ya recibió un bye, se busca en los últimos puestos del pool
     (mejor score) si hay otro candidato con bye_count === 0 con quien hacer swap.
  2. Si todos los candidatos del tope ya recibieron al menos un bye,
     el bye cae en el mejor del ranking sin distinción.
```

### Asignación de cuerpo de control

```
PRIORIDADES:
  1. Persona no involucrada en asalto activo en ese momento
  2. Distribución equitativa de roles en la ronda (árbitro / juez)
  3. Preferencia por candidatos de distinto club que cualquiera de los tiradores
     Si no hay suficientes candidatos disponibles de distinto club:
       → asignar same_club_warning: true, sin bloquear

REROLL (manual por Ari):
  1. Persona libre en ese momento
  2. Preferencia anti-mismo-club
  → Advertencia visual si se asigna mismo club, nunca bloqueo
```

---

## 7b. Panel de Infracciones — `/admin`

Vista en tiempo real dentro del panel de administración. No pública.

**Top 5 infractores del torneo (en vivo):**
- Nombre del tirador
- Club
- Total de amarillas acumuladas en el torneo
- Indicador visual si está a una amarilla de la roja en su asalto actual

**Propósito operativo:** permite a Ari intervenir proactivamente — asignar árbitros más experimentados a una arena antes de que escale, o alertar a un tirador antes de que reciba la roja.

**Datos adicionales del panel:**
- Tipo de infracción más frecuente del evento
- Asaltos terminados por tarjeta roja

**Nota:** todos los asaltos terminados por tarjeta roja se registran íntegramente en las estadísticas, incluyendo el intercambio en que ocurrió la infracción.

---

## 8. Lógica de Puntuación (Frontend)

Computada en el cliente al cargar cada intercambio, antes de escribir a Firestore. Los valores se leen de `/config/scoring`.

```
VALORES DE ZONA (desde config):
  hand  → 1
  body  → 2
  head  → 3
  presa → 3

GOLPE NORMAL:
  transferencia_neta = valor_zona
  valor_efectivo = min(transferencia_neta, puntos_actuales_receptor)

CONTRAPASO:
  transferencia_neta = max(0, valor_golpe − valor_contrapaso)
  valor_efectivo = min(transferencia_neta, puntos_actuales_receptor)
  points_rescued = valor_golpe − transferencia_neta
  Rango [0, valor_golpe]: no puede generar transferencia inversa
  ni superar el valor del golpe original.

DOBLE:
  valor_efectivo_red = min(zone_value_red, puntos_red)
  valor_efectivo_blue = min(zone_value_blue, puntos_blue)
  Sin transferencia entre tiradores.
  points_rescued = 0

AMARILLA (efecto retroactivo sobre el intercambio):
  Las acciones válidas del infractor se anulan.
  Las acciones del oponente (incluyendo contrapaso sobre el infractor) se mantienen.
  Si ambos reciben amarilla: intercambio inválido (invalidity_reason: 'double_foul').

CAÍDA PROPIA:
  Intercambio inconcluso (valid: false, invalidity_reason: 'inconclusive').
  Advertencia al que cayó. Sin transferencia de puntos.

DESARME AUTOINFLIGIDO:
  transferencia = max(valor_golpe_previo_en_intercambio, self_disarm_base)
  Si no hubo golpe previo: transferencia = self_disarm_base (3)

PRESA MUTUA:
  valor_efectivo_red = min(2, puntos_red)
  valor_efectivo_blue = min(2, puntos_blue)
  Sin transferencia. Puede reducir a 0 y terminar el asalto.

PISO:
  Puntos nunca bajan de 0.
  Si puntos llegan a 0: ended_by_depletion = true
  Si ocurre antes del tercer intercambio válido: ended_early = true también

FIN DE ASALTO:
  3 intercambios válidos completados, O
  cualquier esgrimista llega a 0 puntos

DECIMALES:
  total_points en leaderboard: hasta 2 decimales, nunca truncar al acumular.
  calibration_points en byes: hasta 2 decimales.
```

---

## 9. Catálogo de Motivos de Penalización

**Infracciones contra el oponente (amarilla directa):**
- `illegal_zone` — Golpe a zona ilegal
- `illegal_technique` — Golpe con superficie ilegal (pomo, gavilán, puño, etc.)
- `knockdown` — Derribo
- `excessive_force` — Fuerza excesiva
- `contempt` — Desacato

**Infracciones autoinfligidas (advertencia → amarilla):**
- `expose_back` — Exponer espalda/nuca
- `out_of_arena` — Fuera de arena
- `self_fall` — Caída propia (intercambio inconcluso + advertencia)
- `self_disarm` — Desarme autoinfligido (transferencia = max(valor_golpe_previo, 3))

---

## 10. Flujo del Admin — Carga de Resultado

El bookkeeping es centralizado: la Autoridad de Mesa es el único punto de entrada al sistema. Los árbitros entregan planilla en papel; Ari la carga y cierra el asalto.

**Flujo operativo:**
1. Árbitro + jueces terminan el asalto → llevan planilla a mesa → hacen fila si hace falta
2. Ari asigna próximo asalto al árbitro (reroll si es necesario) → árbitro vuelve a cancha
3. Ari carga la planilla en `/admin`:
   - Seleccionar asalto (ya estará marcado como activo en el scheduler)
   - Para cada intercambio:
     - ¿Fue válido? Si no → marcar motivo (inconcluso / falta / doble_falta)
     - Si válido:
       - ¿Doble? → zona + lado de cada uno
       - Si no doble → quién golpeó primero + zona + lado
       - ¿Hubo contrapaso? → zona + lado
     - ¿Hubo penalizaciones? → a quién + tipo + motivo
     - Si `self_disarm` → el sistema consulta si hubo golpe previo para calcular transferencia
   - Preview de puntos antes de confirmar (ver sección 13)
4. Ari confirma → escribe a Firestore → leaderboard y display se actualizan en tiempo real → las 5 personas del asalto se liberan en el scheduler

**Ventaja de bookkeeping centralizado:**
- La planilla física es el documento de auditoría
- Ari actúa como segunda revisión antes de que el dato entre al sistema
- No depende del WiFi ni la batería de los árbitros
- El cierre del asalto actúa como throttle natural — escalonamiento orgánico de las arenas

---

## 11. Estadísticas a Recolectar

### Por tirador
- Puntos totales acumulados
- Puntos robados (ofensivos)
- Puntos perdidos (defensivos)
- Frecuencia de golpes por zona (mano / cuerpo / cabeza / presa)
- Frecuencia de golpes por lado (izquierda / centro / derecha)
- Tasa de contrapaso (veces que contrapaséo / veces que fue golpeado primero)
- Tasa de contrapaso exitoso (contrapaso con `points_rescued > 0`)
- Puntos totales rescatados por contrapaso (suma de `points_rescued`)
- Golpes limpios a la cabeza: intercambios donde `first_hit.zone === 'head'`, `is_double === false`, `contrapaso === null`, `penalties` vacío y `valid === true`
- Cantidad de dobles
- Cantidad de tarjetas y advertencias, por motivo
- Asaltos terminados por depleción (`ended_by_depletion`)
- Asaltos terminados anticipadamente (`ended_early`)
- Roles de cuerpo de control ejercidos (árbitro / juez de línea)
- Victorias / derrotas / empates (`winner_id`)

### Por asalto / ronda
- Puntos totales en juego vs puntos efectivamente disputados
- Erosión de pool por dobles
- Distribución de zonas atacadas
- Arma y `match_tier` del asalto

### Globales del evento
- Zona más atacada
- Lado más atacado
- Tasa global de contrapaso
- Tirador con más / menos dobles
- Tirador con mejor tasa defensiva
- Tirador con más golpes limpios a la cabeza
- Tirador con más puntos rescatados por contrapaso
- Club con mejor desempeño agregado
- Infracción más frecuente
- Correlación entre score en desventaja e infracciones (detección de patrones actitudinales)

---

## 12. Premios Especiales

Los premios especiales se calculan a partir de los datos del evento y se anuncian únicamente después de concluido el torneo del sábado. No se comunican ni insinúan durante la competencia, para no influenciar la esgrima.

| Premio | Criterio técnico |
|---|---|
| Mejor Arbitraje | Voto de pares (paper ballot — fuera del sistema) |
| Sprezzatura | Voto de pares por excelencia técnica (paper ballot — fuera del sistema) |
| Golpe limpio a la cabeza | Más intercambios con `first_hit.zone='head'`, `is_double=false`, `contrapaso=null`, `penalties=[]`, `valid=true` |
| Más puntos rescatados | Mayor suma de `points_rescued` en el torneo |
| Más victorias con espada larga | Mayor cantidad de asaltos donde `winner_id === fighter_id` y `weapon.name === 'espada larga'` (requerimiento de sponsor) |

---

## 13. Consideraciones de UX

- El admin opera en MacBook Pro con mouse — diseño desktop-first
- El scheduler visual debe ser claro a golpe de vista — colores consistentes, nombres legibles
- Los diagramas corporales para selección de zona deben ser grandes y precisos con mouse
- **Preview de carga detallado:** antes de confirmar, mostrar el score final Y el detalle intercambio por intercambio — zona, contrapaso, penalizaciones y delta de puntos. Los 4 presentes en mesa (árbitro + 2 jueces + Ari) verifican en pantalla antes de confirmar. Es el último checkpoint antes de que el dato entre a Firestore.
- Posibilidad de editar el último intercambio cargado (por errores inmediatos de carga, antes de confirmar el asalto)
- **Sin edición post-confirmación.** Una vez confirmado el asalto, el dato es inmutable en Firestore. La planilla física es el documento de auditoría. El preview detallado con los 4 presentes en mesa es el último checkpoint antes de confirmar.
- El `/display` debe ser legible desde lejos — tipografía grande, alto contraste
- La UI usa siempre *asalto* e *intercambio* — nunca los nombres técnicos de las colecciones

---

*Documento de diseño · HDP 2026 · CDS × Claude · Julio 2026*
