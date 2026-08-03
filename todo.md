# HDP 2026 — Dev Backlog

## Estado actual
- [x] Scaffold React + Vite
- [x] Firebase staging conectado (hojasdeplatastagaing)
- [x] Routing /admin · /display · /stats
- [x] Componentes display: ArenaStatus, Leaderboard, BreakCountdown
- [x] Hooks: useConfig, useEventStatus, useLeaderboard
- [x] utils/scoring.js — lógica de puntuación completa (funciones puras)
- [x] utils/pairing.js — emparejamiento suizo con antirepetición y opción C

---

## Próximo

### Seed script
- [ ] `scripts/seed.js` — popula Firestore con config + fighters de prueba
  - config/scoring, config/event
  - ~20 fighters, 4–5 clubs, tiers mixtos

### Monte Carlo / Stress test
- [ ] `scripts/simulate.js` — simula N eventos completos sin Firestore
  - Input: roster de 40 esgrimistas, 8 rondas, asaltos aleatorios
  - Corre 20 veces, detecta: bye inválido, antirepetición rota, pool vacío, loops
  - Output: resumen por corrida + flag de errores
  - Importa directamente utils/pairing.js y utils/scoring.js

### Admin — Scheduler visual
- [ ] Scheduler.jsx — grid de rectángulos por asalto
  - Estados: gris / naranja / cian / verde / rojo
  - Drag & drop a arena (react-dnd o dnd-kit)
  - Botón reroll de árbitro/jueces
  - Badge match_tier prominente
  - Warning visual de mismo club (no bloqueo)
- [ ] Generación de ronda desde el panel (llama a pairing.js)
- [ ] Restricción de arranque: primeros 4 asaltos = 20 personas distintas

### Admin — Carga de resultados
- [ ] ResultsForm.jsx — wizard por intercambio
  - ¿Válido? → motivo si no
  - ¿Doble? → zona + lado × 2
  - ¿Contrapaso? → zona + lado
  - ¿Penalizaciones? → quién + tipo + motivo
  - Preview detallado antes de confirmar (score final + detalle por intercambio)
  - Sin edición post-confirmación
- [ ] Diagrama corporal para selección de zona/lado (SVG clickeable)

### Admin — Gear Check
- [ ] GearCheck.jsx — vista de acreditación por escuela
  - tbd → tier habilitado o na
  - Registrar arma propia

### Admin — Infracciones
- [ ] InfractionsPanel.jsx — top 5 infractores en vivo
  - Indicador: a una amarilla de la roja

### Admin — Proyección de rondas
- [ ] RoundProjection.jsx — cálculo de rondas posibles antes de las 18hs

### Admin — Roster import
- [ ] Vista de import TSV/JSON desde Google Forms
- [ ] Parser de campos: nombre, club, rol, tier declarado

### Display
- [ ] Nombres reales en ArenaStatus (resolver fighter_id → name)
- [ ] Tipografía más grande, verificar legibilidad desde lejos

### Stats
- [ ] Panel de estadísticas por tirador
- [ ] Stats globales del evento (zona más atacada, tasa contrapaso, etc.)
- [ ] Cálculo de premios especiales

### Firebase / Infra
- [ ] Firestore Security Rules para producción
- [ ] firebase.json + .firebaserc para deploy a Firebase Hosting
- [ ] Proyecto de producción en cuenta institucional CDS (~5 días antes del evento)

### Leaderboard write
- [ ] Función de cierre de asalto: escribe resultado + actualiza leaderboard atomicamente
- [ ] Registro de bye en colección byes + actualiza leaderboard

---

## Notas técnicas
- La autenticación de /admin es por contraseña simple en el frontend (env var VITE_ADMIN_PASSWORD)
  No se usa Firebase Auth — el bookkeeping centralizado en un solo operador hace innecesario un sistema de auth completo
- Monte Carlo debe correr en Node puro (sin Firestore) — importar utils directamente
- El chunk size warning de Vite se resuelve con dynamic import() por ruta cuando las páginas estén completas
- Firestore en test mode hasta tener las reglas definidas
- southamerica-west1 en staging y producción
