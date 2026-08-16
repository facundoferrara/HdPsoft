import {
  doc,
  collection,
  addDoc,
  setDoc,
  updateDoc,
  getDoc,
  deleteDoc,
  writeBatch,
  getDocs,
  query,
  where,
  serverTimestamp,
  increment,
  arrayUnion,
  Timestamp,
} from 'firebase/firestore'
import { db } from './config'
import { matchesRef, roundsRef, byesRef, exchangesRef, fightersRef, weaponsConfigRef, controlStatsRef, leaderboardRef } from './db'

const TIER_ORDER = { boffer: 0, nylon: 1, acero: 2 }

// ── Activación / cancelación ──────────────────────────────────────────────────

export async function activateMatch(matchId, arena, matchNumber) {
  await updateDoc(doc(db, 'matches', matchId), { status: 'active', arena, match_number: matchNumber, activated_at: serverTimestamp() })
}

export async function cancelMatch(matchId) {
  await updateDoc(doc(db, 'matches', matchId), { status: 'cancelled', arena: null })
}

/** Libera una arena: vuelve el asalto a 'pending' sin arena, para reasignar otro en su lugar. */
export async function deactivateMatch(matchId) {
  await updateDoc(doc(db, 'matches', matchId), { status: 'pending', arena: null })
}

/** Actualiza el arma acordada de un asalto (Ari la acuerda verbalmente con el par). */
export async function updateMatchWeapon(matchId, weaponName) {
  await updateDoc(doc(db, 'matches', matchId), { weapon: { name: weaponName } })
}

// ── Reroll de cuerpo de control ───────────────────────────────────────────────

/**
 * Actualiza el cuerpo de control de un asalto y ajusta los contadores acumulados
 * de `control_stats` (si se pasa `prevControlBody`, resta a quien sale y suma a quien entra).
 *
 * @param {string} matchId
 * @param {{ refereeId, judge1Id, judge2Id, sameClubWarning, fairnessWarning }} next
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

/** Premio "Más victorias con espada larga" — pedido de sponsor, arma exacta (no "a dos manos" en general). */
function espadaLargaWin(winnerId, fighterId, weaponName) {
  return winnerId === fighterId && weaponName === 'espada larga' ? 1 : 0
}

/**
 * Cierra un asalto: escribe exchanges, actualiza match y leaderboard en batch.
 *
 * `defenseLossRed`/`defenseLossBlue`, `cleanHeadHitsRed`/`Blue`, `contrapasoRescuedRed`/`Blue`
 * ya vienen calculados por el caller (MatchScoresheet, que tiene `blocks`/`zoneValues`/los
 * records armados a mano) — ver `computeDefenseLoss`, `countCleanHeadHits` y
 * `sumContrapasoRescued` ahí. `weaponName` es el arma acordada del asalto (para el premio
 * de espada larga).
 *
 * @param {string} matchId
 * @param {{ exchanges, finalScoreRed, finalScoreBlue, winnerId, endedEarly, endedByDepletion, fighterRedId, fighterBlueId, defenseLossRed, defenseLossBlue, cleanHeadHitsRed, cleanHeadHitsBlue, contrapasoRescuedRed, contrapasoRescuedBlue, handHitsRed, handHitsBlue, doubleHitCount, weaponName }} data
 */
export async function completeMatch(matchId, {
  exchanges,
  finalScoreRed,
  finalScoreBlue,
  winnerId,
  endedEarly,
  endedByDepletion,
  endedByRedCard,
  redCardedFighter,
  fighterRedId,
  fighterBlueId,
  defenseLossRed,
  defenseLossBlue,
  cleanHandHitsRed,
  cleanHandHitsBlue,
  cleanBodyHitsRed,
  cleanBodyHitsBlue,
  cleanHeadHitsRed,
  cleanHeadHitsBlue,
  contrapasoRescuedRed,
  contrapasoRescuedBlue,
  contrapasoCountRed,
  contrapasoCountBlue,
  cleanExchangesRed,
  cleanExchangesBlue,
  totalValidExchanges,
  handHitsRed,
  handHitsBlue,
  doubleHitCount,
  weaponName,
}) {
  const batch = writeBatch(db)

  // Leaderboard points: expelled → 0, opponent → deferred (0 now, calibration at round close)
  const redIsExpelled  = endedByRedCard && (redCardedFighter === 'red' || redCardedFighter === 'both')
  const blueIsExpelled = endedByRedCard && (redCardedFighter === 'blue' || redCardedFighter === 'both')
  const leaderboardRed  = redIsExpelled || (endedByRedCard && !redIsExpelled) ? 0 : finalScoreRed
  const leaderboardBlue = blueIsExpelled || (endedByRedCard && !blueIsExpelled) ? 0 : finalScoreBlue

  const wldRed = winnerId === fighterRedId ? 'matches_won' : winnerId === 'draw' ? 'matches_drawn' : 'matches_lost'
  const wldBlue = winnerId === fighterBlueId ? 'matches_won' : winnerId === 'draw' ? 'matches_drawn' : 'matches_lost'

  const lbSnapshot = {
    red: {
      total_points: Math.round(leaderboardRed * 100) / 100,
      wld: wldRed,
      points_lost_defense: defenseLossRed ?? 0,
      clean_hand_hits: cleanHandHitsRed ?? 0,
      clean_body_hits: cleanBodyHitsRed ?? 0,
      clean_head_hits: cleanHeadHitsRed ?? 0,
      points_rescued_contrapaso: contrapasoRescuedRed ?? 0,
      contrapaso_count: contrapasoCountRed ?? 0,
      clean_exchanges_won: cleanExchangesRed ?? 0,
      total_valid_exchanges: totalValidExchanges ?? 0,
      hand_hits_landed: handHitsRed ?? 0,
      double_hit_count: doubleHitCount ?? 0,
      wins_espada_larga: espadaLargaWin(winnerId, fighterRedId, weaponName),
    },
    blue: {
      total_points: Math.round(leaderboardBlue * 100) / 100,
      wld: wldBlue,
      points_lost_defense: defenseLossBlue ?? 0,
      clean_hand_hits: cleanHandHitsBlue ?? 0,
      clean_body_hits: cleanBodyHitsBlue ?? 0,
      clean_head_hits: cleanHeadHitsBlue ?? 0,
      points_rescued_contrapaso: contrapasoRescuedBlue ?? 0,
      contrapaso_count: contrapasoCountBlue ?? 0,
      clean_exchanges_won: cleanExchangesBlue ?? 0,
      total_valid_exchanges: totalValidExchanges ?? 0,
      hand_hits_landed: handHitsBlue ?? 0,
      double_hit_count: doubleHitCount ?? 0,
      wins_espada_larga: espadaLargaWin(winnerId, fighterBlueId, weaponName),
    },
  }

  batch.update(doc(db, 'matches', matchId), {
    status: 'complete',
    final_score_red: finalScoreRed,
    final_score_blue: finalScoreBlue,
    winner_id: winnerId,
    ended_early: endedEarly,
    ended_by_depletion: endedByDepletion,
    ended_by_red_card: endedByRedCard ?? false,
    red_carded_fighter: redCardedFighter ?? null,
    calibration_pending: endedByRedCard && redCardedFighter !== 'both',
    _lb_snapshot: lbSnapshot,
  })

  batch.update(doc(db, 'leaderboard', fighterRedId), {
    total_points: increment(lbSnapshot.red.total_points),
    matches_complete: increment(1),
    [wldRed]: increment(1),
    points_lost_defense: increment(lbSnapshot.red.points_lost_defense),
    clean_hand_hits: increment(lbSnapshot.red.clean_hand_hits),
    clean_body_hits: increment(lbSnapshot.red.clean_body_hits),
    clean_head_hits: increment(lbSnapshot.red.clean_head_hits),
    points_rescued_contrapaso: increment(lbSnapshot.red.points_rescued_contrapaso),
    contrapaso_count: increment(lbSnapshot.red.contrapaso_count),
    clean_exchanges_won: increment(lbSnapshot.red.clean_exchanges_won),
    total_valid_exchanges: increment(lbSnapshot.red.total_valid_exchanges),
    hand_hits_landed: increment(lbSnapshot.red.hand_hits_landed),
    double_hit_count: increment(lbSnapshot.red.double_hit_count),
    wins_espada_larga: increment(lbSnapshot.red.wins_espada_larga),
  })

  batch.update(doc(db, 'leaderboard', fighterBlueId), {
    total_points: increment(lbSnapshot.blue.total_points),
    matches_complete: increment(1),
    [wldBlue]: increment(1),
    points_lost_defense: increment(lbSnapshot.blue.points_lost_defense),
    clean_hand_hits: increment(lbSnapshot.blue.clean_hand_hits),
    clean_body_hits: increment(lbSnapshot.blue.clean_body_hits),
    clean_head_hits: increment(lbSnapshot.blue.clean_head_hits),
    points_rescued_contrapaso: increment(lbSnapshot.blue.points_rescued_contrapaso),
    contrapaso_count: increment(lbSnapshot.blue.contrapaso_count),
    clean_exchanges_won: increment(lbSnapshot.blue.clean_exchanges_won),
    total_valid_exchanges: increment(lbSnapshot.blue.total_valid_exchanges),
    hand_hits_landed: increment(lbSnapshot.blue.hand_hits_landed),
    double_hit_count: increment(lbSnapshot.blue.double_hit_count),
    wins_espada_larga: increment(lbSnapshot.blue.wins_espada_larga),
  })

  await batch.commit()

  const exRef = exchangesRef(matchId)
  for (const ex of exchanges) {
    await addDoc(exRef, ex)
  }
}

/**
 * Cierra un asalto por override de mesa: puntaje final tipeado a mano + nota editorial.
 * No escribe exchanges — no hay datos reales de intercambio que registrar en una corrección.
 * Por eso tampoco toca `points_lost_defense`/`clean_head_hits`/`points_rescued_contrapaso`:
 * sin detalle de intercambios no hay forma de calcularlos. `wins_espada_larga` sí se
 * actualiza — solo depende de `winner_id` y el arma del asalto, ambos ya conocidos.
 *
 * @param {string} matchId
 * @param {{ finalScoreRed, finalScoreBlue, winnerId, overrideNote, fighterRedId, fighterBlueId, weaponName }} data
 */
export async function overrideMatch(matchId, {
  finalScoreRed,
  finalScoreBlue,
  winnerId,
  overrideNote,
  fighterRedId,
  fighterBlueId,
  weaponName,
}) {
  const batch = writeBatch(db)

  const wldRed = winnerId === fighterRedId ? 'matches_won' : winnerId === 'draw' ? 'matches_drawn' : 'matches_lost'
  const wldBlue = winnerId === fighterBlueId ? 'matches_won' : winnerId === 'draw' ? 'matches_drawn' : 'matches_lost'

  const lbSnapshot = {
    red: {
      total_points: Math.round(finalScoreRed * 100) / 100,
      wld: wldRed,
      wins_espada_larga: espadaLargaWin(winnerId, fighterRedId, weaponName),
    },
    blue: {
      total_points: Math.round(finalScoreBlue * 100) / 100,
      wld: wldBlue,
      wins_espada_larga: espadaLargaWin(winnerId, fighterBlueId, weaponName),
    },
  }

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
    _lb_snapshot: lbSnapshot,
  })

  batch.update(doc(db, 'leaderboard', fighterRedId), {
    total_points: increment(lbSnapshot.red.total_points),
    matches_complete: increment(1),
    [wldRed]: increment(1),
    wins_espada_larga: increment(lbSnapshot.red.wins_espada_larga),
  })

  batch.update(doc(db, 'leaderboard', fighterBlueId), {
    total_points: increment(lbSnapshot.blue.total_points),
    matches_complete: increment(1),
    [wldBlue]: increment(1),
    wins_espada_larga: increment(lbSnapshot.blue.wins_espada_larga),
  })

  await batch.commit()
}

export async function reopenMatch(matchId) {
  const matchDoc = await getDoc(doc(db, 'matches', matchId))
  if (!matchDoc.exists()) throw new Error('Match not found')
  const match = matchDoc.data()
  if (match.status !== 'complete') return

  const snap = match._lb_snapshot
  const batch = writeBatch(db)

  if (snap) {
    for (const [side, fighterId] of [['red', match.fighter_red_id], ['blue', match.fighter_blue_id]]) {
      const s = snap[side]
      const updates = {
        total_points: increment(-s.total_points),
        matches_complete: increment(-1),
        [s.wld]: increment(-1),
        wins_espada_larga: increment(-(s.wins_espada_larga ?? 0)),
      }
      if (s.points_lost_defense != null) {
        Object.assign(updates, {
          points_lost_defense: increment(-s.points_lost_defense),
          clean_hand_hits: increment(-s.clean_hand_hits),
          clean_body_hits: increment(-s.clean_body_hits),
          clean_head_hits: increment(-s.clean_head_hits),
          points_rescued_contrapaso: increment(-s.points_rescued_contrapaso),
          contrapaso_count: increment(-s.contrapaso_count),
          clean_exchanges_won: increment(-s.clean_exchanges_won),
          total_valid_exchanges: increment(-s.total_valid_exchanges),
          hand_hits_landed: increment(-s.hand_hits_landed),
          double_hit_count: increment(-s.double_hit_count),
        })
      }
      batch.update(doc(db, 'leaderboard', fighterId), updates)
    }
  }

  batch.update(doc(db, 'matches', matchId), {
    status: 'active',
    final_score_red: null,
    final_score_blue: null,
    winner_id: null,
    ended_early: false,
    ended_by_depletion: false,
    ended_by_red_card: false,
    red_carded_fighter: null,
    calibration_pending: false,
    override: false,
    override_note: null,
    _lb_snapshot: null,
  })

  await batch.commit()

  const exSnap = await getDocs(exchangesRef(matchId))
  const delBatch = writeBatch(db)
  exSnap.docs.forEach((d) => delBatch.delete(d.ref))
  if (!exSnap.empty) await delBatch.commit()
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
  pairs.forEach(({ red, blue, refereeId, judge1Id, judge2Id, sameClubWarning, fairnessWarning }, idx) => {
    const matchRef = doc(collection(db, 'matches'))
    const match_tier =
      TIER_ORDER[red.tier] <= TIER_ORDER[blue.tier] ? red.tier : blue.tier

    batch.set(matchRef, {
      round_id: roundRef.id,
      sequence_number: sequenceBase + idx + 1,
      match_number: null,
      fighter_red_id: red.id,
      fighter_blue_id: blue.id,
      referee_id: refereeId ?? null,
      judge_1_id: judge1Id ?? null,
      judge_2_id: judge2Id ?? null,
      match_tier,
      weapon: { name: 'sable' },
      arena: null,
      status: 'pending',
      final_score_red: null,
      final_score_blue: null,
      winner_id: null,
      ended_early: false,
      ended_by_depletion: false,
      same_club_warning: sameClubWarning ?? false,
      fairness_warning: fairnessWarning ?? false,
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
  await applyCalibration(roundId)
  await updateDoc(doc(db, 'rounds', roundId), {
    status: 'complete',
    completed_at: serverTimestamp(),
  })
}

/**
 * Aplica puntuación de calibración al cerrar una ronda:
 * 1. Calcula el promedio de puntos de asaltos normales (sin tarjeta roja, sin bye)
 * 2. Asigna calibración a oponentes de tarjeta roja y bye fighters
 */
async function applyCalibration(roundId) {
  const matchSnap = await getDocs(query(matchesRef, where('round_id', '==', roundId)))
  const byeSnap   = await getDocs(query(byesRef, where('round_id', '==', roundId)))

  const normalScores = []
  const redCardMatches = []

  for (const d of matchSnap.docs) {
    const m = d.data()
    if (m.status !== 'complete') continue
    if (m.ended_by_red_card) {
      redCardMatches.push({ id: d.id, ...m })
    } else {
      normalScores.push(m.final_score_red, m.final_score_blue)
    }
  }

  if (normalScores.length === 0 && redCardMatches.length === 0 && byeSnap.empty) return

  const calibration = normalScores.length > 0
    ? Math.round((normalScores.reduce((a, b) => a + b, 0) / normalScores.length) * 100) / 100
    : 0

  const batch = writeBatch(db)

  // Red card opponents: increment their leaderboard by calibration
  for (const m of redCardMatches) {
    if (m.red_carded_fighter === 'both') continue
    const opponentId = m.red_carded_fighter === 'red' ? m.fighter_blue_id : m.fighter_red_id
    batch.update(doc(db, 'leaderboard', opponentId), {
      total_points: increment(Math.round(calibration * 100) / 100),
    })
    batch.update(doc(db, 'matches', m.id), {
      calibration_pending: false,
      calibration_score: calibration,
    })
  }

  // Bye fighters: set calibration and increment leaderboard
  for (const d of byeSnap.docs) {
    const b = d.data()
    if (b.calibration_points != null && b.calibration_points > 0) continue
    batch.update(d.ref, { calibration_points: calibration })
    batch.update(doc(db, 'leaderboard', b.fighter_id), {
      total_points: increment(Math.round(calibration * 100) / 100),
    })
  }

  await batch.commit()
}

// ── Bye ───────────────────────────────────────────────────────────────────────

export async function registerBye(fighterId, roundId, calibrationPoints) {
  const batch = writeBatch(db)
  batch.set(doc(byesRef), {
    fighter_id: fighterId,
    round_id: roundId,
    calibration_points: calibrationPoints,
  })
  const lbUpdate = { bye_count: increment(1) }
  if (calibrationPoints != null) {
    lbUpdate.total_points = increment(Math.round(calibrationPoints * 100) / 100)
  }
  batch.update(doc(db, 'leaderboard', fighterId), lbUpdate)
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

export async function updateFighterInfo(fighterId, fields) {
  const batch = writeBatch(db)
  batch.update(doc(db, 'fighters', fighterId), fields)
  batch.update(doc(db, 'leaderboard', fighterId), fields)
  await batch.commit()
}

export async function deleteFighter(fighterId) {
  const batch = writeBatch(db)
  batch.delete(doc(db, 'fighters', fighterId))
  batch.delete(doc(db, 'leaderboard', fighterId))
  await batch.commit()
}

export async function updateFighterStatus(fighterId, newStatus) {
  if (newStatus === 'active') {
    await updateDoc(doc(db, 'fighters', fighterId), { status: 'active' })
    return { cancelledMatch: false }
  }

  const roundSnap = await getDocs(query(roundsRef, where('status', '==', 'active')))

  let pendingMatchDoc = null
  let opponentId = null
  let roundId = null

  if (!roundSnap.empty) {
    roundId = roundSnap.docs[0].id
    const matchSnap = await getDocs(query(matchesRef, where('round_id', '==', roundId)))
    pendingMatchDoc = matchSnap.docs.find((d) => {
      const m = d.data()
      return m.status === 'pending' && (m.fighter_red_id === fighterId || m.fighter_blue_id === fighterId)
    })
    if (pendingMatchDoc) {
      const m = pendingMatchDoc.data()
      opponentId = m.fighter_red_id === fighterId ? m.fighter_blue_id : m.fighter_red_id
    }
  }

  const batch = writeBatch(db)
  batch.update(doc(db, 'fighters', fighterId), { status: newStatus })

  if (pendingMatchDoc && roundId && opponentId) {
    batch.update(pendingMatchDoc.ref, { status: 'cancelled' })
    batch.set(doc(byesRef), {
      fighter_id: opponentId,
      round_id: roundId,
      calibration_points: null,
    })
    batch.update(doc(db, 'leaderboard', opponentId), { bye_count: increment(1) })
    if (newStatus === 'paused') {
      batch.set(doc(byesRef), {
        fighter_id: fighterId,
        round_id: roundId,
        calibration_points: null,
      })
      batch.update(doc(db, 'leaderboard', fighterId), { bye_count: increment(1) })
    }
  }

  await batch.commit()
  return { cancelledMatch: !!pendingMatchDoc, opponentId }
}

export async function addCustomWeapon(weaponName) {
  await updateDoc(weaponsConfigRef, { custom: arrayUnion(weaponName) })
}

export async function addStaffMember({ name, club, role, tier }) {
  const effectiveTier = tier || 'na'
  const effectiveClub = club || 'Ind'
  const ref = await addDoc(fightersRef, { name, club: effectiveClub, tier: effectiveTier, role: role || 'both' })
  await setDoc(doc(db, 'leaderboard', ref.id), {
    fighter_id: ref.id, name, club: effectiveClub,
    total_points: 0, matches_complete: 0, bye_count: 0,
    points_lost_defense: 0, clean_head_hits: 0, points_rescued_contrapaso: 0,
    wins_espada_larga: 0, matches_won: 0, matches_lost: 0, matches_drawn: 0,
    hand_hits_landed: 0, double_hit_count: 0, contrapaso_count: 0,
    clean_hand_hits: 0, clean_body_hits: 0, clean_exchanges_won: 0, total_valid_exchanges: 0,
  })
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

export async function resetTournament() {
  const matchSnap = await getDocs(matchesRef)
  for (const d of matchSnap.docs) {
    const exSnap = await getDocs(exchangesRef(d.id))
    const b = writeBatch(db)
    exSnap.docs.forEach((e) => b.delete(e.ref))
    if (!exSnap.empty) await b.commit()
  }

  const delCollections = [matchesRef, roundsRef, byesRef, controlStatsRef]
  for (const colRef of delCollections) {
    const snap = await getDocs(colRef)
    if (snap.empty) continue
    const b = writeBatch(db)
    snap.docs.forEach((d) => b.delete(d.ref))
    await b.commit()
  }

  const lbSnap = await getDocs(leaderboardRef)
  const delBatch = writeBatch(db)
  lbSnap.docs.forEach((d) => delBatch.delete(d.ref))
  await delBatch.commit()

  const createBatch = writeBatch(db)
  for (const d of lbSnap.docs) {
    const data = d.data()
    createBatch.set(d.ref, {
      fighter_id: d.id, name: data.name, club: data.club,
      total_points: 0, matches_complete: 0, bye_count: 0,
      points_lost_defense: 0, clean_head_hits: 0, points_rescued_contrapaso: 0,
      wins_espada_larga: 0, matches_won: 0, matches_lost: 0, matches_drawn: 0,
      hand_hits_landed: 0, double_hit_count: 0, contrapaso_count: 0,
      clean_hand_hits: 0, clean_body_hits: 0, clean_exchanges_won: 0, total_valid_exchanges: 0,
    })
  }
  await createBatch.commit()

  await setDoc(doc(db, 'config', 'event'), {
    status: 'active', break_ends_at: null,
    current_round: 0, arenas: 3,
  }, { merge: true })
}
