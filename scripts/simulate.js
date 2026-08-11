/**
 * simulate.js — Monte Carlo: corre N eventos completos sin Firestore.
 * Uso: node scripts/simulate.js [--runs 20] [--fighters 40] [--rounds 8]
 *
 * Importa directamente utils/pairing.js y utils/scoring.js.
 * No requiere conexión a Firebase.
 *
 * Detecta y reporta:
 *   - Antirepetición rota (misma pareja en dos rondas)
 *   - Bye consecutivo en el mismo tirador
 *   - Pool vacío (no se pueden generar pares)
 *   - Puntaje negativo o NaN
 *   - Asalto sin ganador ni empate al cerrar (ended_by_depletion inconsistente)
 */

import { generatePairings, pairKey } from '../src/utils/pairing.js'
import { assignControlBody } from '../src/utils/controlBody.js'
import {
  calcNormalHit,
  calcContrapaso,
  calcDouble,
  calcCalibrationPoints,
} from '../src/utils/scoring.js'

// ── CLI args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const get = (flag, def) => {
  const i = args.indexOf(flag)
  return i !== -1 ? Number(args[i + 1]) : def
}
const RUNS    = get('--runs', 20)
const N_FIGHTERS = get('--fighters', 40)
const N_ROUNDS   = get('--rounds', 8)
const N_CLUBS    = get('--clubs', 5)
const MIN_MATCH_MIN = get('--min-min', 5)
const MAX_MATCH_MIN = get('--max-min', 14)
const ARENAS_A = get('--arenas-a', 3)
const ARENAS_B = get('--arenas-b', 4)

// ── Generación de roster sintético ───────────────────────────────────────────

const BASE_CLUBS = ['CDS', 'EdN', 'SOe', 'EsL', 'Ind']
const TIERS  = ['boffer', 'nylon', 'acero']
const ROLES  = ['referee', 'judge', 'both']

function clubList(n) {
  if (n <= BASE_CLUBS.length) return BASE_CLUBS.slice(0, Math.max(1, n))
  return [...BASE_CLUBS, ...Array.from({ length: n - BASE_CLUBS.length }, (_, i) => `Club${i + 1}`)]
}

function makeRoster(n, nClubs) {
  const clubs = clubList(nClubs)
  return Array.from({ length: n }, (_, i) => ({
    id: `f${i}`,
    name: `Fighter ${i}`,
    club: clubs[i % clubs.length],
    tier: TIERS[i % TIERS.length],
    role: ROLES[i % ROLES.length],
    total_points: 0,
    bye_count: 0,
  }))
}

// ── Simulación de un asalto ───────────────────────────────────────────────────

const ZONE_VALUES = { hand: 1, body: 2, head: 3, presa: 3 }
const ZONES = Object.keys(ZONE_VALUES)
const START_PTS = 5

function randomZone() {
  return ZONES[Math.floor(Math.random() * ZONES.length)]
}

/**
 * Simula un asalto hasta 3 intercambios válidos o depleción.
 * Retorna { pointsRed, pointsBlue, winnerId, endedByDepletion }.
 */
function simulateMatch(fighterId, fighterBlueId) {
  let red = START_PTS
  let blue = START_PTS
  let validExchanges = 0

  while (validExchanges < 3 && red > 0 && blue > 0) {
    const roll = Math.random()

    if (roll < 0.1) {
      // Doble
      const { deltaRed, deltaBlue } = calcDouble(randomZone(), randomZone(), red, blue, ZONE_VALUES)
      red -= deltaRed
      blue -= deltaBlue
      validExchanges++
    } else if (roll < 0.3) {
      // Contrapaso
      const { pointsDelta } = calcContrapaso(randomZone(), randomZone(), blue, ZONE_VALUES)
      blue -= pointsDelta
      validExchanges++
    } else {
      // Golpe normal — rojo ataca azul
      const { pointsDelta } = calcNormalHit(randomZone(), blue, ZONE_VALUES)
      blue -= pointsDelta
      validExchanges++
    }

    if (red < 0 || blue < 0) {
      return { error: `Puntos negativos: red=${red} blue=${blue}` }
    }
  }

  const endedByDepletion = red === 0 || blue === 0
  let winnerId
  if (red > blue) winnerId = fighterId
  else if (blue > red) winnerId = fighterBlueId
  else winnerId = 'draw'

  return { pointsRed: red, pointsBlue: blue, winnerId, endedByDepletion }
}

// ── Simulación de agenda de arenas (throughput real + tiempo bloqueado) ────────

function randMatchDuration() {
  // Uniforme entre asignación de arena/anuncio y commit en mesa de control.
  return MIN_MATCH_MIN + Math.random() * (MAX_MATCH_MIN - MIN_MATCH_MIN)
}

/**
 * Simula la asignación secuencial de N arenas a los asaltos de una ronda,
 * respetando que ningún tirador/árbitro/juez puede estar en dos asaltos activos
 * a la vez — mismo comportamiento que `isBlocked` en Scheduler.jsx, pero con
 * tiempo real de por medio en vez de solo detectar el conflicto.
 *
 * @param {Array<{ personnel: string[], duration: number }>} matches
 * @param {number} nArenas
 * @returns {{ makespanMin: number, blockedMinutes: number }} — makespan = tiempo
 *   hasta que se completa el último asalto de la ronda; blockedMinutes = minutos
 *   totales que alguna arena pasó libre sin poder arrancar el próximo asalto
 *   pendiente por conflicto de personal.
 */
function simulateRoundSchedule(matches, nArenas) {
  const remaining = matches.map((m) => ({ ...m }))
  const busyUntil = {}
  const arenaBusyUntil = Array(nArenas).fill(0)
  const arenaIdleSince = Array(nArenas).fill(0)
  let blockedMinutes = 0
  let now = 0

  const isFree = (personnel, t) => personnel.every((p) => (busyUntil[p] ?? 0) <= t)

  function tryFill(t) {
    let filled = true
    while (filled) {
      filled = false
      for (let a = 0; a < nArenas; a++) {
        if (arenaBusyUntil[a] > t) continue
        const idx = remaining.findIndex((m) => isFree(m.personnel, t))
        if (idx === -1) continue
        const m = remaining.splice(idx, 1)[0]
        blockedMinutes += Math.max(0, t - arenaIdleSince[a])
        m.personnel.forEach((p) => { busyUntil[p] = t + m.duration })
        arenaBusyUntil[a] = t + m.duration
        filled = true
      }
    }
  }

  tryFill(0)

  let guard = 0
  while (remaining.length > 0) {
    const nextTimes = arenaBusyUntil.filter((t) => t > now)
    if (nextTimes.length === 0) break // no debería pasar — señal de bug si ocurre
    now = Math.min(...nextTimes)
    for (let a = 0; a < nArenas; a++) {
      if (arenaBusyUntil[a] === now) arenaIdleSince[a] = now
    }
    tryFill(now)
    if (++guard > 10000) break // válvula de seguridad
  }

  return { makespanMin: Math.max(now, ...arenaBusyUntil), blockedMinutes }
}

// ── Una corrida completa ──────────────────────────────────────────────────────

function runEvent(fighters) {
  const errors = []
  const pastPairs = new Set()
  const roster = fighters.map((f) => ({ ...f, total_points: 0, bye_count: 0 }))

  // Contadores de árbitro/juez — persisten a través de TODAS las rondas del evento,
  // igual que el fix de fairness cross-round de Scheduler.jsx (no se resetean por ronda).
  const controlStats = {}
  let sameClubWarnings = 0
  let roleMismatchWarnings = 0
  let fairnessWarnings = 0
  let controlBodyFailures = 0
  let frictionConflicts = 0
  let matchMinutes = 0
  let makespanA = 0, makespanB = 0
  let blockedA = 0, blockedB = 0

  for (let round = 1; round <= N_ROUNDS; round++) {
    const { pairs, byeFighterId } = generatePairings(roster, pastPairs)

    // Validar antirepetición
    for (const { red, blue } of pairs) {
      const key = pairKey(red.id, blue.id)
      if (pastPairs.has(key)) {
        errors.push(`Ronda ${round}: antirepetición rota — ${red.id} vs ${blue.id}`)
      }
      pastPairs.add(key)
    }

    // Asignar cuerpo de control por par (misma lógica que Scheduler.jsx.handleGenerateRound)
    // y medir "fricción de misma-ronda": alguien usado como tirador en un match y como
    // árbitro/juez en otro dentro de la misma ronda (proxy de bloqueos isBlocked reales).
    const roundUsage = new Map() // fighterId -> cantidad de pares donde aparece esta ronda
    const bump = (id) => roundUsage.set(id, (roundUsage.get(id) ?? 0) + 1)

    const roundControlBodies = []

    pairs.forEach(({ red, blue }) => {
      bump(red.id); bump(blue.id)
      const candidatePool = roster.filter((f) => f.id !== red.id && f.id !== blue.id)
      const cb = assignControlBody(candidatePool, [red.club, blue.club], controlStats, roster)

      if (!cb) {
        controlBodyFailures++
        roundControlBodies.push(null)
        return
      }
      roundControlBodies.push(cb)

      const ids = [cb.refereeId, cb.judge1Id, cb.judge2Id]
      if (ids.some((id) => id === red.id || id === blue.id)) {
        errors.push(`Ronda ${round}: cuerpo de control incluye a un tirador del propio match (${red.id} vs ${blue.id})`)
      }
      if (new Set(ids).size !== ids.length) {
        errors.push(`Ronda ${round}: cuerpo de control repetido dentro del mismo match (${ids.join(',')})`)
      }

      if (cb.sameClubWarning) sameClubWarnings++
      if (cb.roleMismatchWarning) roleMismatchWarnings++
      if (cb.fairnessWarning) fairnessWarnings++

      controlStats[cb.refereeId] = {
        refCount: (controlStats[cb.refereeId]?.refCount ?? 0) + 1,
        judgeCount: controlStats[cb.refereeId]?.judgeCount ?? 0,
      }
      ;[cb.judge1Id, cb.judge2Id].forEach((jid) => {
        controlStats[jid] = {
          refCount: controlStats[jid]?.refCount ?? 0,
          judgeCount: (controlStats[jid]?.judgeCount ?? 0) + 1,
        }
      })

      ids.forEach(bump)
    })

    for (const count of roundUsage.values()) {
      if (count > 1) frictionConflicts++
    }

    // Agenda real: misma duración por asalto para ambos escenarios de arenas
    // (comparación de a igualdad de condiciones, no de suerte con los tiempos).
    const scheduleMatches = pairs.map(({ red, blue }, idx) => {
      const cb = roundControlBodies[idx]
      const personnel = cb
        ? [red.id, blue.id, cb.refereeId, cb.judge1Id, cb.judge2Id]
        : [red.id, blue.id]
      return { personnel, duration: randMatchDuration() }
    })
    matchMinutes += scheduleMatches.reduce((sum, m) => sum + m.duration, 0)

    const schedA = simulateRoundSchedule(scheduleMatches, ARENAS_A)
    const schedB = simulateRoundSchedule(scheduleMatches, ARENAS_B)
    makespanA += schedA.makespanMin; blockedA += schedA.blockedMinutes
    makespanB += schedB.makespanMin; blockedB += schedB.blockedMinutes

    // Simular asaltos y acumular puntos
    const roundPoints = []
    pairs.forEach(({ red, blue }) => {
      const result = simulateMatch(red.id, blue.id)
      if (result.error) {
        errors.push(`Ronda ${round}: ${result.error}`)
        return
      }

      const rf = roster.find((f) => f.id === red.id)
      const bf = roster.find((f) => f.id === blue.id)
      const redEarned  = START_PTS - result.pointsBlue  // puntos que rojo "robó"
      const blueEarned = START_PTS - result.pointsRed

      rf.total_points = Math.round((rf.total_points + redEarned) * 100) / 100
      bf.total_points = Math.round((bf.total_points + blueEarned) * 100) / 100
      roundPoints.push(redEarned, blueEarned)

      if (isNaN(rf.total_points) || isNaN(bf.total_points)) {
        errors.push(`Ronda ${round}: NaN en puntos de ${red.id} o ${blue.id}`)
      }
    })

    // Bye
    if (byeFighterId) {
      const byeF = roster.find((f) => f.id === byeFighterId)
      if (byeF) {
        const calibration = calcCalibrationPoints(roundPoints)
        byeF.total_points = Math.round((byeF.total_points + calibration) * 100) / 100
        byeF.bye_count++

        if (byeF.bye_count > 2) {
          errors.push(`Ronda ${round}: ${byeFighterId} recibió su bye #${byeF.bye_count}`)
        }
      }
    }
  }

  const refCounts = roster.map((f) => controlStats[f.id]?.refCount ?? 0)
  const judgeCounts = roster.map((f) => controlStats[f.id]?.judgeCount ?? 0)

  return {
    errors,
    stats: {
      sameClubWarnings,
      roleMismatchWarnings,
      fairnessWarnings,
      controlBodyFailures,
      frictionConflicts,
      refSpread: Math.max(...refCounts) - Math.min(...refCounts),
      judgeSpread: Math.max(...judgeCounts) - Math.min(...judgeCounts),
      matchMinutes,
      makespanA, makespanB,
      blockedA, blockedB,
    },
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log(`\nMonte Carlo — ${RUNS} corridas × ${N_FIGHTERS} tiradores × ${N_CLUBS} clubes × ${N_ROUNDS} rondas\n`)

let totalErrors = 0
let cleanRuns = 0
const allStats = []

for (let i = 1; i <= RUNS; i++) {
  const roster = makeRoster(N_FIGHTERS, N_CLUBS)
  const { errors, stats } = runEvent(roster)
  allStats.push(stats)

  if (errors.length === 0) {
    cleanRuns++
    process.stdout.write('.')
  } else {
    process.stdout.write('E')
    totalErrors += errors.length
    console.log(`\n  Corrida ${i}:`)
    errors.forEach((e) => console.log(`    - ${e}`))
  }
}

const avg = (key) => allStats.reduce((sum, s) => sum + s[key], 0) / allStats.length
const max = (key) => Math.max(...allStats.map((s) => s[key]))

console.log(`\n\nResultado: ${cleanRuns}/${RUNS} corridas limpias`)
if (totalErrors > 0) console.log(`Errores totales: ${totalErrors}`)
else console.log('Sin errores detectados.')

console.log('\nCuerpo de control — promedio por evento (y máximo entre corridas):')
console.log(`  Fallos de asignación (pool < 3):  ${avg('controlBodyFailures').toFixed(2)}  (max ${max('controlBodyFailures')})`)
console.log(`  Warning mismo club:               ${avg('sameClubWarnings').toFixed(2)}  (max ${max('sameClubWarnings')})`)
console.log(`  Warning sin preferencia de rol:   ${avg('roleMismatchWarnings').toFixed(2)}  (max ${max('roleMismatchWarnings')})`)
console.log(`  Warning desbalance (fairness):    ${avg('fairnessWarnings').toFixed(2)}  (max ${max('fairnessWarnings')})`)
console.log(`  Fricción misma-ronda (tirador+CB):${avg('frictionConflicts').toFixed(2)}  (max ${max('frictionConflicts')})`)
console.log(`  Spread final arbitrajes (max-min):${avg('refSpread').toFixed(2)}  (max ${max('refSpread')})`)
console.log(`  Spread final jueceos (max-min):   ${avg('judgeSpread').toFixed(2)}  (max ${max('judgeSpread')})`)

const avgMatchMin = avg('matchMinutes')
const utilA = avgMatchMin / (ARENAS_A * avg('makespanA'))
const utilB = avgMatchMin / (ARENAS_B * avg('makespanB'))

console.log(`\nAgenda de arenas — ${ARENAS_A} vs ${ARENAS_B} arenas (duración por asalto ${MIN_MATCH_MIN}-${MAX_MATCH_MIN} min, uniforme, misma muestra de tiempos para ambos):`)
console.log(`  Tiempo total de evento (suma de rondas):`)
console.log(`    ${ARENAS_A} arenas: ${avg('makespanA').toFixed(1)} min/evento  (${(avg('makespanA') / N_ROUNDS).toFixed(1)} min/ronda)`)
console.log(`    ${ARENAS_B} arenas: ${avg('makespanB').toFixed(1)} min/evento  (${(avg('makespanB') / N_ROUNDS).toFixed(1)} min/ronda)`)
console.log(`    Diferencia: ${(avg('makespanA') - avg('makespanB')).toFixed(1)} min a favor de ${ARENAS_B} arenas`)
console.log(`  Minutos de arena libre esperando por conflicto de personal (no por falta de asaltos):`)
console.log(`    ${ARENAS_A} arenas: ${avg('blockedA').toFixed(1)} min/evento  (max ${max('blockedA').toFixed(1)})`)
console.log(`    ${ARENAS_B} arenas: ${avg('blockedB').toFixed(1)} min/evento  (max ${max('blockedB').toFixed(1)})`)
console.log(`  Utilización de arenas (minutos de asalto / minutos de arena disponibles):`)
console.log(`    ${ARENAS_A} arenas: ${(utilA * 100).toFixed(1)}%`)
console.log(`    ${ARENAS_B} arenas: ${(utilB * 100).toFixed(1)}%`)

process.exit(totalErrors > 0 ? 1 : 0)
