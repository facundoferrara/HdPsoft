import {
  doc,
  collection,
  addDoc,
  setDoc,
  updateDoc,
  writeBatch,
  getDocs,
  serverTimestamp,
  increment,
  Timestamp,
} from 'firebase/firestore'
import { db } from './config'
import { matchesRef, roundsRef, byesRef, exchangesRef, fightersRef } from './db'

const TIER_ORDER = { boffer: 0, nylon: 1, acero: 2 }

// ── Activación / cancelación ──────────────────────────────────────────────────

export async function activateMatch(matchId, arena) {
  await updateDoc(doc(db, 'matches', matchId), { status: 'active', arena })
}

export async function cancelMatch(matchId) {
  await updateDoc(doc(db, 'matches', matchId), { status: 'cancelled', arena: null })
}

/** Libera una arena: vuelve el asalto a 'pending' sin arena, para reasignar otro en su lugar. */
export async function deactivateMatch(matchId) {
  await updateDoc(doc(db, 'matches', matchId), { status: 'pending', arena: null })
}

// ── Reroll de cuerpo de control ───────────────────────────────────────────────

/**
 * Actualiza el cuerpo de control de un asalto y ajusta los contadores acumulados
 * de `control_stats` (si se pasa `prevControlBody`, resta a quien sale y suma a quien entra).
 *
 * @param {string} matchId
 * @param {{ refereeId, judge1Id, judge2Id, sameClubWarning, roleMismatchWarning, fairnessWarning }} next
 * @param {{ refereeId, judge1Id, judge2Id }|null} prevControlBody — ids previos, para ajustar stats
 */
export async function updateMatchControlBody(matchId, next, prevControlBody = null) {
  const batch = writeBatch(db)

  batch.update(doc(db, 'matches', matchId), {
    referee_id: next.refereeId,
    judge_1_id: next.judge1Id,
    judge_2_id: next.judge2Id,
    same_club_warning: next.sameClubWarning ?? false,
    fairness_warning: next.fairnessWarning ?? false,
    role_mismatch_warning: next.roleMismatchWarning ?? false,
    rerolled: true,
  })

  if (prevControlBody) {
    const roleChanges = [
      { prev: prevControlBody.refereeId, curr: next.refereeId, field: 'referee_count' },
      { prev: prevControlBody.judge1Id,  curr: next.judge1Id,  field: 'judge_count' },
      { prev: prevControlBody.judge2Id,  curr: next.judge2Id,  field: 'judge_count' },
    ]
    for (const { prev, curr, field } of roleChanges) {
      if (prev === curr) continue
      if (prev) batch.set(doc(db, 'control_stats', prev), { [field]: increment(-1) }, { merge: true })
      if (curr) batch.set(doc(db, 'control_stats', curr), { [field]: increment(1) }, { merge: true })
    }
  }

  await batch.commit()
}

// ── Cierre de asalto ──────────────────────────────────────────────────────────

/**
 * Cierra un asalto: escribe exchanges, actualiza match y leaderboard en batch.
 *
 * @param {string} matchId
 * @param {{ exchanges, finalScoreRed, finalScoreBlue, winnerId, endedEarly, endedByDepletion, fighterRedId, fighterBlueId }} data
 */
export async function completeMatch(matchId, {
  exchanges,
  finalScoreRed,
  finalScoreBlue,
  winnerId,
  endedEarly,
  endedByDepletion,
  fighterRedId,
  fighterBlueId,
}) {
  // Batch: match + leaderboard (atomico)
  const batch = writeBatch(db)

  batch.update(doc(db, 'matches', matchId), {
    status: 'complete',
    final_score_red: finalScoreRed,
    final_score_blue: finalScoreBlue,
    winner_id: winnerId,
    ended_early: endedEarly,
    ended_by_depletion: endedByDepletion,
  })

  batch.update(doc(db, 'leaderboard', fighterRedId), {
    total_points: increment(Math.round(finalScoreRed * 100) / 100),
    matches_complete: increment(1),
  })

  batch.update(doc(db, 'leaderboard', fighterBlueId), {
    total_points: increment(Math.round(finalScoreBlue * 100) / 100),
    matches_complete: increment(1),
  })

  await batch.commit()

  // Exchanges (subcollección — fuera del batch por limitación de Firestore)
  const exRef = exchangesRef(matchId)
  for (const ex of exchanges) {
    await addDoc(exRef, ex)
  }
}

/**
 * Cierra un asalto por override de mesa: puntaje final tipeado a mano + nota editorial.
 * No escribe exchanges — no hay datos reales de intercambio que registrar en una corrección.
 *
 * @param {string} matchId
 * @param {{ finalScoreRed, finalScoreBlue, winnerId, overrideNote, fighterRedId, fighterBlueId }} data
 */
export async function overrideMatch(matchId, {
  finalScoreRed,
  finalScoreBlue,
  winnerId,
  overrideNote,
  fighterRedId,
  fighterBlueId,
}) {
  const batch = writeBatch(db)

  batch.update(doc(db, 'matches', matchId), {
    status: 'complete',
    final_score_red: finalScoreRed,
    final_score_blue: finalScoreBlue,
    winner_id: winnerId,
    ended_early: false,
    ended_by_depletion: false,
    override: true,
    override_note: overrideNote,
    overridden_at: serverTimestamp(),
  })

  batch.update(doc(db, 'leaderboard', fighterRedId), {
    total_points: increment(Math.round(finalScoreRed * 100) / 100),
    matches_complete: increment(1),
  })

  batch.update(doc(db, 'leaderboard', fighterBlueId), {
    total_points: increment(Math.round(finalScoreBlue * 100) / 100),
    matches_complete: increment(1),
  })

  await batch.commit()
}

// ── Generación de ronda ───────────────────────────────────────────────────────

/**
 * Escribe una ronda completa con todos sus asaltos a Firestore.
 *
 * @param {number} roundNumber
 * @param {Array<{ red, blue, refereeId, judge1Id, judge2Id, sameClubWarning }>} pairs
 * @returns {string} roundId
 */
export async function generateRound(roundNumber, pairs) {
  const roundRef = await addDoc(roundsRef, {
    round_number: roundNumber,
    status: 'active',
    started_at: serverTimestamp(),
    completed_at: null,
  })

  const allMatchesSnap = await getDocs(matchesRef)
  const sequenceBase = allMatchesSnap.size

  const batch = writeBatch(db)
  pairs.forEach(({ red, blue, refereeId, judge1Id, judge2Id, sameClubWarning, roleMismatchWarning, fairnessWarning }, idx) => {
    const matchRef = doc(collection(db, 'matches'))
    const match_tier =
      TIER_ORDER[red.tier] <= TIER_ORDER[blue.tier] ? red.tier : blue.tier

    batch.set(matchRef, {
      round_id: roundRef.id,
      sequence_number: sequenceBase + idx + 1,
      match_number: idx + 1,
      fighter_red_id: red.id,
      fighter_blue_id: blue.id,
      referee_id: refereeId ?? null,
      judge_1_id: judge1Id ?? null,
      judge_2_id: judge2Id ?? null,
      match_tier,
      weapon: { name: 'espada larga' }, // Ari lo acuerda verbalmente; editable en scheduler
      arena: null,
      status: 'pending',
      final_score_red: null,
      final_score_blue: null,
      winner_id: null,
      ended_early: false,
      ended_by_depletion: false,
      same_club_warning: sameClubWarning ?? false,
      fairness_warning: fairnessWarning ?? false,
      role_mismatch_warning: roleMismatchWarning ?? false,
      rerolled: false,
    })

    if (refereeId) batch.set(doc(db, 'control_stats', refereeId), { referee_count: increment(1) }, { merge: true })
    if (judge1Id)  batch.set(doc(db, 'control_stats', judge1Id),  { judge_count: increment(1) },  { merge: true })
    if (judge2Id)  batch.set(doc(db, 'control_stats', judge2Id),  { judge_count: increment(1) },  { merge: true })
  })
  await batch.commit()

  return roundRef.id
}

export async function closeRound(roundId) {
  await updateDoc(doc(db, 'rounds', roundId), {
    status: 'complete',
    completed_at: serverTimestamp(),
  })
}

// ── Bye ───────────────────────────────────────────────────────────────────────

export async function registerBye(fighterId, roundId, calibrationPoints) {
  const batch = writeBatch(db)
  batch.set(doc(byesRef), {
    fighter_id: fighterId,
    round_id: roundId,
    calibration_points: calibrationPoints,
  })
  batch.update(doc(db, 'leaderboard', fighterId), {
    total_points: increment(Math.round(calibrationPoints * 100) / 100),
    bye_count: increment(1),
  })
  await batch.commit()
}

// ── Anular ronda ─────────────────────────────────────────────────────────────

/** Cancela todos los matches pendientes de una ronda y marca la ronda como cancelada. */
export async function cancelRound(roundId, matchIds) {
  const batch = writeBatch(db)
  matchIds.forEach((id) => batch.update(doc(db, 'matches', id), { status: 'cancelled' }))
  batch.update(doc(db, 'rounds', roundId), { status: 'cancelled', completed_at: serverTimestamp() })
  await batch.commit()
}

// ── Gear Check ───────────────────────────────────────────────────────────────────

export async function updateFighterGear(fighterId, tier) {
  await updateDoc(doc(db, 'fighters', fighterId), { tier })
}

/** Alta de una persona presente que no compite (staff/colaborador), elegible como cuerpo de control. */
export async function addStaffMember({ name, club, role }) {
  await addDoc(fightersRef, { name, club: club || 'Ind', tier: 'na', role: role || 'both' })
}

// ── Estado del evento ─────────────────────────────────────────────────────────

export async function setEventBreak(durationMinutes) {
  const break_ends_at = durationMinutes
    ? Timestamp.fromMillis(Date.now() + durationMinutes * 60 * 1000)
    : null
  await setDoc(doc(db, 'config', 'event'), { status: 'break', break_ends_at }, { merge: true })
}

export async function resumeEvent() {
  await setDoc(doc(db, 'config', 'event'), { status: 'active', break_ends_at: null }, { merge: true })
}

export async function setEventStatus(status) {
  await setDoc(doc(db, 'config', 'event'), { status, break_ends_at: null }, { merge: true })
}
