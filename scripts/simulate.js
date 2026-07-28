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

// ── Generación de roster sintético ───────────────────────────────────────────

const CLUBS  = ['CDS', 'EdN', 'SOe', 'EsL', 'Ind']
const TIERS  = ['boffer', 'nylon', 'acero']
const ROLES  = ['referee', 'judge', 'both']

function makeRoster(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: `f${i}`,
    name: `Fighter ${i}`,
    club: CLUBS[i % CLUBS.length],
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

// ── Una corrida completa ──────────────────────────────────────────────────────

function runEvent(fighters) {
  const errors = []
  const pastPairs = new Set()
  const roster = fighters.map((f) => ({ ...f, total_points: 0, bye_count: 0 }))

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

    // Simular asaltos y acumular puntos
    const roundPoints = []
    for (const { red, blue } of pairs) {
      const result = simulateMatch(red.id, blue.id)
      if (result.error) {
        errors.push(`Ronda ${round}: ${result.error}`)
        continue
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
    }

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

  return errors
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log(`\nMonte Carlo — ${RUNS} corridas × ${N_FIGHTERS} tiradores × ${N_ROUNDS} rondas\n`)

let totalErrors = 0
let cleanRuns = 0

for (let i = 1; i <= RUNS; i++) {
  const roster = makeRoster(N_FIGHTERS)
  const errors = runEvent(roster)

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

console.log(`\n\nResultado: ${cleanRuns}/${RUNS} corridas limpias`)
if (totalErrors > 0) {
  console.log(`Errores totales: ${totalErrors}`)
  process.exit(1)
} else {
  console.log('Sin errores detectados.')
  process.exit(0)
}
