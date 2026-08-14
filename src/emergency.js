/**
 * Emergency console tools — importable via:
 *   await import('/src/emergency.js')
 *
 * Functions are registered on `window` for direct console access.
 */

import { doc, getDocs, query, where, writeBatch, getDoc } from 'firebase/firestore'
import { db } from './firebase/config'
import { matchesRef, roundsRef } from './firebase/db'
import { overrideMatch, closeRound, deactivateMatch } from './firebase/writes'

window.__forceCloseMatch = async function (matchId, scoreRed, scoreBlue) {
  const snap = await getDoc(doc(db, 'matches', matchId))
  if (!snap.exists()) { console.error('Match not found:', matchId); return }
  const m = snap.data()
  if (m.status === 'complete') { console.warn('Match already complete'); return }
  const winnerId = scoreRed > scoreBlue ? m.fighter_red_id
    : scoreBlue > scoreRed ? m.fighter_blue_id
    : 'draw'
  await overrideMatch(matchId, {
    finalScoreRed: scoreRed,
    finalScoreBlue: scoreBlue,
    winnerId,
    overrideNote: 'Emergency close from console',
    fighterRedId: m.fighter_red_id,
    fighterBlueId: m.fighter_blue_id,
    weaponName: m.weapon?.name ?? 'sable',
  })
  console.log(`✓ Match ${matchId} closed: ${scoreRed}–${scoreBlue}`)
}

window.__forceCloseRound = async function (roundId) {
  const matchSnap = await getDocs(query(matchesRef, where('round_id', '==', roundId)))
  const batch = writeBatch(db)
  let cancelled = 0
  for (const d of matchSnap.docs) {
    if (d.data().status !== 'complete' && d.data().status !== 'cancelled') {
      batch.update(d.ref, { status: 'cancelled' })
      cancelled++
    }
  }
  if (cancelled > 0) await batch.commit()
  await closeRound(roundId)
  console.log(`✓ Round ${roundId} force-closed (${cancelled} matches cancelled, calibration applied)`)
}

window.__forceDeactivateMatch = async function (matchId) {
  await deactivateMatch(matchId)
  console.log(`✓ Match ${matchId} → pending`)
}

window.__listActive = async function () {
  const matchSnap = await getDocs(query(matchesRef, where('status', '==', 'active')))
  const results = matchSnap.docs.map(d => {
    const m = d.data()
    return { id: d.id, red: m.fighter_red_id, blue: m.fighter_blue_id, arena: m.arena }
  })
  console.log('Active matches:', JSON.stringify(results))
  return results
}

window.__status = async function () {
  const roundSnap = await getDocs(roundsRef)
  const rounds = roundSnap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => a.round_number - b.round_number)

  const active = rounds.find(r => r.status === 'active')
  console.log(`Rounds: ${rounds.length} total, active: ${active ? `R${active.round_number} (${active.id})` : 'none'}`)

  if (active) {
    const matchSnap = await getDocs(query(matchesRef, where('round_id', '==', active.id)))
    const matches = matchSnap.docs.map(d => ({ id: d.id, ...d.data() }))
    const byStatus = {}
    for (const m of matches) {
      byStatus[m.status] = (byStatus[m.status] ?? 0) + 1
    }
    console.log('Matches:', byStatus)
    console.table(matches.map(m => ({
      id: m.id,
      status: m.status,
      arena: m.arena,
      red: m.fighter_red_id?.slice(0, 6),
      blue: m.fighter_blue_id?.slice(0, 6),
      score: m.status === 'complete' ? `${m.final_score_red}–${m.final_score_blue}` : '—',
    })))
  }
}

console.log('%c🚑 Emergency tools loaded', 'font-size: 1.2em; font-weight: bold')
console.log('  __forceCloseMatch(matchId, scoreRed, scoreBlue)')
console.log('  __forceCloseRound(roundId)')
console.log('  __forceDeactivateMatch(matchId)')
console.log('  __status()  — current state summary')
console.log('Usage: await import("/src/emergency.js")')
