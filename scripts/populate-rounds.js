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
const ROUNDS_TO_GENERATE = 6

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
  let cleanHandRed = 0, cleanHandBlue = 0
  let cleanBodyRed = 0, cleanBodyBlue = 0
  let cleanHeadRed = 0, cleanHeadBlue = 0
  let contraRescuedRed = 0, contraRescuedBlue = 0
  let contraCountRed = 0, contraCountBlue = 0
  let cleanExchRed = 0, cleanExchBlue = 0, totalValidExch = 0
  let handHitsRed = 0, handHitsBlue = 0
  let doubleHitCount = 0
  let n = 1

  for (const block of blocks) {
    let deltaRed = 0, deltaBlue = 0, pointsRescued = 0

    totalValidExch++
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

      if (!contrapasoZone) {
        if (attacker === 'red') cleanExchRed++; else cleanExchBlue++
        if (hitZone === 'hand') { if (attacker === 'red') cleanHandRed++; else cleanHandBlue++ }
        if (hitZone === 'body') { if (attacker === 'red') cleanBodyRed++; else cleanBodyBlue++ }
        if (hitZone === 'head') { if (attacker === 'red') cleanHeadRed++; else cleanHeadBlue++ }
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
        deltaBlue = -loss
      } else {
        deltaRed = -loss
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
    cleanHandRed, cleanHandBlue,
    cleanBodyRed, cleanBodyBlue,
    cleanHeadRed, cleanHeadBlue,
    contraRescuedRed, contraRescuedBlue,
    contraCountRed, contraCountBlue,
    cleanExchRed, cleanExchBlue, totalValidExch,
    handHitsRed, handHitsBlue,
    doubleHitCount,
  }
}

async function batchDelete(docs) {
  for (let i = 0; i < docs.length; i += 500) {
    const batch = writeBatch(db)
    docs.slice(i, i + 500).forEach((d) => batch.delete(d.ref))
    await batch.commit()
  }
}

async function clearMatchesWithExchanges() {
  const matchesSnap = await getDocs(collection(db, 'matches'))
  if (matchesSnap.empty) return { matches: 0, exchanges: 0 }
  let exchCount = 0
  for (const matchDoc of matchesSnap.docs) {
    const exchSnap = await getDocs(collection(db, 'matches', matchDoc.id, 'exchanges'))
    if (!exchSnap.empty) {
      await batchDelete(exchSnap.docs)
      exchCount += exchSnap.size
    }
  }
  await batchDelete(matchesSnap.docs)
  return { matches: matchesSnap.size, exchanges: exchCount }
}

async function run() {
  console.log('=== Limpiando datos previos ===')
  const { matches: mDel, exchanges: eDel } = await clearMatchesWithExchanges()
  if (mDel) console.log(`  ${mDel} matches eliminados (${eDel} exchanges)`)

  const roundsSnap = await getDocs(collection(db, 'rounds'))
  if (!roundsSnap.empty) {
    await batchDelete(roundsSnap.docs)
    console.log(`  ${roundsSnap.size} rounds eliminados`)
  }

  const byesSnap = await getDocs(collection(db, 'byes'))
  if (!byesSnap.empty) {
    await batchDelete(byesSnap.docs)
    console.log(`  ${byesSnap.size} byes eliminados`)
  }

  const csSnap = await getDocs(collection(db, 'control_stats'))
  if (!csSnap.empty) {
    await batchDelete(csSnap.docs)
    console.log(`  ${csSnap.size} control_stats eliminados`)
  }

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
      clean_hand_hits: 0, clean_body_hits: 0,
      clean_exchanges_won: 0, total_valid_exchanges: 0,
    })
  }

  const pastPairs = new Set()
  const leaderMap = Object.fromEntries(activeFighters.map((f) => [f.id, { total_points: 0, bye_count: 0 }]))
  const roleStats = {}
  for (const f of eligible) roleStats[f.id] = { refCount: 0, judgeCount: 0 }

  for (let round = 1; round <= ROUNDS_TO_GENERATE; round++) {
    console.log(`\n=== Ronda ${round} ===`)

    const enriched = activeFighters.map((f) => ({
      ...f,
      total_points: leaderMap[f.id]?.total_points ?? 0,
      bye_count: leaderMap[f.id]?.bye_count ?? 0,
    }))

    const { pairs, byeFighterId } = generatePairings(enriched, pastPairs)
    console.log(`  ${pairs.length} asaltos${byeFighterId ? `, bye: ${fighters.find(f=>f.id===byeFighterId)?.name}` : ''}`)

    const roundRef = await addDoc(collection(db, 'rounds'), {
      round_number: round, status: 'active', started_at: serverTimestamp(),
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
        clean_hand_hits: increment(result.cleanHandRed),
        clean_body_hits: increment(result.cleanBodyRed),
        clean_head_hits: increment(result.cleanHeadRed),
        points_rescued_contrapaso: increment(result.contraRescuedRed),
        contrapaso_count: increment(result.contraCountRed),
        clean_exchanges_won: increment(result.cleanExchRed),
        total_valid_exchanges: increment(result.totalValidExch),
        hand_hits_landed: increment(result.handHitsRed),
        double_hit_count: increment(result.doubleHitCount),
        wins_espada_larga: increment(espadaLargaRed),
      })
      batch.update(doc(db, 'leaderboard', blue.id), {
        total_points: increment(Math.round(result.finalScoreBlue * 100) / 100),
        matches_complete: increment(1),
        [wldBlue]: increment(1),
        points_lost_defense: increment(result.defenseLossBlue),
        clean_hand_hits: increment(result.cleanHandBlue),
        clean_body_hits: increment(result.cleanBodyBlue),
        clean_head_hits: increment(result.cleanHeadBlue),
        points_rescued_contrapaso: increment(result.contraRescuedBlue),
        contrapaso_count: increment(result.contraCountBlue),
        clean_exchanges_won: increment(result.cleanExchBlue),
        total_valid_exchanges: increment(result.totalValidExch),
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

  console.log(`\n=== Poblado completo: ${ROUNDS_TO_GENERATE} rondas con resultados aleatorios ===`)
  process.exit(0)
}

run().catch((err) => {
  console.error('Error:', err.message)
  process.exit(1)
})
