/**
 * populate-rounds.js — Genera 5 rondas completas con resultados aleatorios.
 * Uso: node scripts/populate-rounds.js
 *
 * Limpia matches/rounds/byes/leaderboard existentes antes de poblar,
 * preserva fighters y config.
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '../.env')
const envVars = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => l.split('=').map((s) => s.trim()))
)

import { initializeApp } from 'firebase/app'
import {
  getFirestore, collection, doc, getDocs, setDoc, addDoc,
  writeBatch, serverTimestamp, increment, deleteDoc,
} from 'firebase/firestore'

import { generatePairings, pairKey } from '../src/utils/pairing.js'
import { assignControlBody } from '../src/utils/controlBody.js'

const app = initializeApp({
  apiKey: envVars.VITE_FIREBASE_API_KEY,
  authDomain: envVars.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: envVars.VITE_FIREBASE_PROJECT_ID,
  storageBucket: envVars.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: envVars.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: envVars.VITE_FIREBASE_APP_ID,
})
const db = getFirestore(app)

const ZONES = ['hand', 'body', 'head']
const ZONE_VALUES = { hand: 1, body: 2, head: 3 }
const STARTING_PTS = 5
const WEAPONS = ['espada y broquel', 'espada larga', 'espada sola', 'sable y broquel']
const ROUNDS_TO_GENERATE = 5

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)] }
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min }

function generateRandomBlock() {
  const roll = Math.random()

  if (roll < 0.05) {
    return { type: 'presa' }
  }

  if (roll < 0.2) {
    return { type: 'double', redZone: pick(ZONES), blueZone: pick(ZONES) }
  }

  const attacker = Math.random() < 0.5 ? 'red' : 'blue'
  const hitZone = pick(ZONES)
  const hasContrapaso = Math.random() < 0.25
  return {
    type: 'normal',
    attacker,
    hitZone,
    contrapasoZone: hasContrapaso ? pick(ZONES) : null,
  }
}

function computeMatchResult(blocks) {
  const exchanges = []
  let scoreRed = STARTING_PTS, scoreBlue = STARTING_PTS
  let defenseLossRed = 0, defenseLossBlue = 0
  let cleanHeadRed = 0, cleanHeadBlue = 0
  let contraRescuedRed = 0, contraRescuedBlue = 0
  let contraCountRed = 0, contraCountBlue = 0
  let handHitsRed = 0, handHitsBlue = 0
  let doubleHitCount = 0
  let n = 1

  for (const block of blocks) {
    let deltaRed = 0, deltaBlue = 0, pointsRescued = 0

    if (block.type === 'presa') {
      deltaRed = -Math.min(2, scoreRed)
      deltaBlue = -Math.min(2, scoreBlue)
      defenseLossRed += 2
      defenseLossBlue += 2
      exchanges.push({
        exchange_number: n++, valid: true, is_double: false, is_presa_mutua: true,
        first_hit: null, contrapaso: null, double_red: null, double_blue: null,
        penalties: [], points_delta_red: deltaRed, points_delta_blue: deltaBlue, points_rescued: 0,
      })
    } else if (block.type === 'double') {
      const rawRed = ZONE_VALUES[block.redZone]
      const rawBlue = ZONE_VALUES[block.blueZone]
      deltaRed = -Math.min(rawRed, scoreRed)
      deltaBlue = -Math.min(rawBlue, scoreBlue)
      defenseLossRed += rawRed
      defenseLossBlue += rawBlue
      doubleHitCount++
      if (block.blueZone === 'hand') handHitsRed++
      if (block.redZone === 'hand') handHitsBlue++
      exchanges.push({
        exchange_number: n++, valid: true, is_double: true, is_presa_mutua: false,
        first_hit: null, contrapaso: null,
        double_red: { zone: block.redZone }, double_blue: { zone: block.blueZone },
        penalties: [], points_delta_red: deltaRed, points_delta_blue: deltaBlue, points_rescued: 0,
      })
    } else {
      const { attacker, hitZone, contrapasoZone } = block
      const victim = attacker === 'red' ? 'blue' : 'red'
      const victimScore = victim === 'red' ? scoreRed : scoreBlue
      const rawHit = ZONE_VALUES[hitZone]
      let loss = Math.min(rawHit, victimScore)

      if (hitZone === 'hand') {
        if (attacker === 'red') handHitsRed++; else handHitsBlue++
      }

      if (victim === 'red') defenseLossRed += rawHit; else defenseLossBlue += rawHit

      if (hitZone === 'head' && !contrapasoZone) {
        if (attacker === 'red') cleanHeadRed++; else cleanHeadBlue++
      }

      if (contrapasoZone) {
        const rawContra = ZONE_VALUES[contrapasoZone]
        pointsRescued = Math.min(rawContra, loss)
        loss -= pointsRescued
        if (victim === 'red') { contraRescuedRed += pointsRescued; contraCountRed++ } else { contraRescuedBlue += pointsRescued; contraCountBlue++ }
        if (attacker === 'red') defenseLossRed += rawContra; else defenseLossBlue += rawContra
        if (contrapasoZone === 'hand') {
          if (victim === 'red') handHitsRed++; else handHitsBlue++
        }
      }

      if (attacker === 'red') {
        deltaRed = loss; deltaBlue = -loss
      } else {
        deltaBlue = loss; deltaRed = -loss
      }

      exchanges.push({
        exchange_number: n++, valid: true, is_double: false, is_presa_mutua: false,
        first_hit: { fighter: attacker, zone: hitZone },
        contrapaso: contrapasoZone ? { zone: contrapasoZone } : null,
        double_red: null, double_blue: null,
        penalties: [], points_delta_red: deltaRed, points_delta_blue: deltaBlue, points_rescued: pointsRescued,
      })
    }

    scoreRed = Math.max(0, scoreRed + deltaRed)
    scoreBlue = Math.max(0, scoreBlue + deltaBlue)
  }

  defenseLossRed = Math.min(STARTING_PTS, defenseLossRed)
  defenseLossBlue = Math.min(STARTING_PTS, defenseLossBlue)

  let winnerId = 'draw'
  if (scoreRed > scoreBlue) winnerId = 'red'
  else if (scoreBlue > scoreRed) winnerId = 'blue'

  return {
    exchanges, finalScoreRed: scoreRed, finalScoreBlue: scoreBlue, winnerId,
    defenseLossRed, defenseLossBlue,
    cleanHeadRed, cleanHeadBlue,
    contraRescuedRed, contraRescuedBlue,
    contraCountRed, contraCountBlue,
    handHitsRed, handHitsBlue,
    doubleHitCount,
  }
}

async function run() {
  // Cancel existing active/pending matches & rounds (rules allow status updates)
  console.log('=== Cancelando matches/rounds existentes ===')
  const matchesSnap = await getDocs(collection(db, 'matches'))
  for (const d of matchesSnap.docs) {
    if (['pending', 'active'].includes(d.data().status)) {
      await setDoc(d.ref, { status: 'cancelled' }, { merge: true })
    }
  }
  const roundsSnap = await getDocs(collection(db, 'rounds'))
  let maxRound = 0
  for (const d of roundsSnap.docs) {
    const rn = d.data().round_number ?? 0
    if (rn > maxRound) maxRound = rn
    if (d.data().status === 'active') {
      await setDoc(d.ref, { status: 'complete', completed_at: serverTimestamp() }, { merge: true })
    }
  }
  console.log(`  ${matchesSnap.size} matches, ${roundsSnap.size} rounds procesados (max round: ${maxRound})`)

  console.log('\n=== Leyendo fighters ===')
  const fightersSnap = await getDocs(collection(db, 'fighters'))
  const fighters = fightersSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
  const activeFighters = fighters.filter((f) => f.tier !== 'tbd' && f.tier !== 'na')
  const eligible = fighters.filter((f) => f.tier !== 'tbd')
  console.log(`  ${fighters.length} fighters, ${activeFighters.length} activos, ${eligible.length} elegibles CB`)

  // Reset leaderboard (delete then recreate — rules allow both)
  console.log('\n=== Reseteando leaderboard ===')
  const lbSnap = await getDocs(collection(db, 'leaderboard'))
  for (const d of lbSnap.docs) await deleteDoc(d.ref)
  for (const f of fighters) {
    await setDoc(doc(db, 'leaderboard', f.id), {
      fighter_id: f.id, name: f.name, club: f.club,
      total_points: 0, rounds_played: 0, matches_complete: 0, bye_count: 0,
      points_lost_defense: 0, clean_head_hits: 0, points_rescued_contrapaso: 0,
      wins_espada_larga: 0, matches_won: 0, matches_lost: 0, matches_drawn: 0,
      hand_hits_landed: 0, double_hit_count: 0, contrapaso_count: 0,
    })
  }

  const pastPairs = new Set()
  for (const d of matchesSnap.docs) {
    const data = d.data()
    if (data.fighter_red_id && data.fighter_blue_id) {
      pastPairs.add(pairKey(data.fighter_red_id, data.fighter_blue_id))
    }
  }
  const leaderMap = Object.fromEntries(activeFighters.map((f) => [f.id, { total_points: 0, bye_count: 0 }]))
  const roleStats = {}
  for (const f of eligible) roleStats[f.id] = { refCount: 0, judgeCount: 0 }

  const roundOffset = maxRound
  for (let round = 1; round <= ROUNDS_TO_GENERATE; round++) {
    console.log(`\n=== Ronda ${round} ===`)

    const enriched = activeFighters.map((f) => ({
      ...f,
      total_points: leaderMap[f.id]?.total_points ?? 0,
      bye_count: leaderMap[f.id]?.bye_count ?? 0,
    }))

    const { pairs, byeFighterId } = generatePairings(enriched, pastPairs)
    console.log(`  ${pairs.length} asaltos${byeFighterId ? `, bye: ${fighters.find(f=>f.id===byeFighterId)?.name}` : ''}`)

    // Create round doc
    const roundRef = await addDoc(collection(db, 'rounds'), {
      round_number: roundOffset + round, status: 'active', started_at: serverTimestamp(),
    })

    let matchNum = 1
    for (const { red, blue } of pairs) {
      pastPairs.add(pairKey(red.id, blue.id))
      const weapon = pick(WEAPONS)

      // Assign control body
      const fighterIds = [red.id, blue.id]
      const fighterClubs = [red.club, blue.club]
      const pool = eligible.filter((f) => !fighterIds.includes(f.id))
      const cb = assignControlBody(pool, fighterClubs, roleStats, eligible)

      if (cb) {
        roleStats[cb.refereeId] = {
          refCount: (roleStats[cb.refereeId]?.refCount ?? 0) + 1,
          judgeCount: roleStats[cb.refereeId]?.judgeCount ?? 0,
        }
        ;[cb.judge1Id, cb.judge2Id].forEach((jid) => {
          roleStats[jid] = {
            refCount: roleStats[jid]?.refCount ?? 0,
            judgeCount: (roleStats[jid]?.judgeCount ?? 0) + 1,
          }
        })
      }

      // Generate random 3-block result
      const blocks = [generateRandomBlock(), generateRandomBlock(), generateRandomBlock()]
      const result = computeMatchResult(blocks)

      const winnerId = result.winnerId === 'red' ? red.id
        : result.winnerId === 'blue' ? blue.id : 'draw'

      const isEspadaLarga = weapon.toLowerCase().includes('espada larga')

      // Create match as pending (rules require status='pending' on create)
      let matchRef
      try {
      matchRef = await addDoc(collection(db, 'matches'), {
        round_id: roundRef.id,
        match_number: matchNum++,
        match_tier: red.tier <= blue.tier ? red.tier : blue.tier,
        fighter_red_id: red.id,
        fighter_blue_id: blue.id,
        referee_id: cb?.refereeId ?? null,
        judge_1_id: cb?.judge1Id ?? null,
        judge_2_id: cb?.judge2Id ?? null,
        same_club_warning: cb?.sameClubWarning ?? false,
        status: 'pending',
        weapon: { name: weapon },
      })
      } catch(e) { console.error('  FAIL create match:', e.message); throw e }
      try {
      // Activate (rules: activationKeys)
      await setDoc(matchRef, { status: 'active', arena: rand(1, 3), activated_at: serverTimestamp() }, { merge: true })
      } catch(e) { console.error('  FAIL activate:', e.message); throw e }
      try {
      // Complete (rules: completionKeys)
      await setDoc(matchRef, {
        status: 'complete',
        final_score_red: result.finalScoreRed,
        final_score_blue: result.finalScoreBlue,
        winner_id: winnerId,
        ended_early: false,
        ended_by_depletion: result.finalScoreRed === 0 || result.finalScoreBlue === 0,
      }, { merge: true })
      } catch(e) { console.error('  FAIL complete:', e.message); throw e }

      // Write exchanges
      try {
      for (const ex of result.exchanges) {
        await addDoc(collection(db, 'matches', matchRef.id, 'exchanges'), ex)
      }
      } catch(e) { console.error('  FAIL exchanges:', e.message); throw e }

      // Update leaderboard
      const wldRed = winnerId === red.id ? 'matches_won' : winnerId === 'draw' ? 'matches_drawn' : 'matches_lost'
      const wldBlue = winnerId === blue.id ? 'matches_won' : winnerId === 'draw' ? 'matches_drawn' : 'matches_lost'
      const espadaLargaRed = isEspadaLarga && winnerId === red.id ? 1 : 0
      const espadaLargaBlue = isEspadaLarga && winnerId === blue.id ? 1 : 0

      const batch = writeBatch(db)
      batch.update(doc(db, 'leaderboard', red.id), {
        total_points: increment(Math.round(result.finalScoreRed * 100) / 100),
        matches_complete: increment(1),
        [wldRed]: increment(1),
        points_lost_defense: increment(result.defenseLossRed),
        clean_head_hits: increment(result.cleanHeadRed),
        points_rescued_contrapaso: increment(result.contraRescuedRed),
        contrapaso_count: increment(result.contraCountRed),
        hand_hits_landed: increment(result.handHitsRed),
        double_hit_count: increment(result.doubleHitCount),
        wins_espada_larga: increment(espadaLargaRed),
      })
      batch.update(doc(db, 'leaderboard', blue.id), {
        total_points: increment(Math.round(result.finalScoreBlue * 100) / 100),
        matches_complete: increment(1),
        [wldBlue]: increment(1),
        points_lost_defense: increment(result.defenseLossBlue),
        clean_head_hits: increment(result.cleanHeadBlue),
        points_rescued_contrapaso: increment(result.contraRescuedBlue),
        contrapaso_count: increment(result.contraCountBlue),
        hand_hits_landed: increment(result.handHitsBlue),
        double_hit_count: increment(result.doubleHitCount),
        wins_espada_larga: increment(espadaLargaBlue),
      })
      await batch.commit().catch(e => { console.error('  FAIL leaderboard:', e.message); throw e })

      // Track for pairing
      leaderMap[red.id] = {
        total_points: (leaderMap[red.id]?.total_points ?? 0) + result.finalScoreRed,
        bye_count: leaderMap[red.id]?.bye_count ?? 0,
      }
      leaderMap[blue.id] = {
        total_points: (leaderMap[blue.id]?.total_points ?? 0) + result.finalScoreBlue,
        bye_count: leaderMap[blue.id]?.bye_count ?? 0,
      }

      const r = fighters.find(f => f.id === red.id)?.name
      const b = fighters.find(f => f.id === blue.id)?.name
      console.log(`    #${matchNum-1} ${r} ${result.finalScoreRed} - ${result.finalScoreBlue} ${b} (${weapon})`)
    }

    // Register bye
    if (byeFighterId) {
      await addDoc(collection(db, 'byes'), {
        fighter_id: byeFighterId, round_id: roundRef.id, calibration_points: 3,
      })
      leaderMap[byeFighterId] = {
        total_points: (leaderMap[byeFighterId]?.total_points ?? 0) + 3,
        bye_count: (leaderMap[byeFighterId]?.bye_count ?? 0) + 1,
      }
      const batch2 = writeBatch(db)
      batch2.update(doc(db, 'leaderboard', byeFighterId), {
        total_points: increment(3), bye_count: increment(1),
      })
      await batch2.commit()
    }

    // Mark round complete
    await setDoc(doc(db, 'rounds', roundRef.id), {
      status: 'complete', completed_at: serverTimestamp(),
    }, { merge: true })
  }

  console.log('\n=== Poblado completo: 5 rondas con resultados aleatorios ===')
  process.exit(0)
}

run().catch((err) => {
  console.error('Error:', err.message)
  process.exit(1)
})
