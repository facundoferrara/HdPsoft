import { useState } from 'react'
import { useRoundMatches } from '../../hooks/useMatches'
import { useRounds } from '../../hooks/useRounds'
import { useFighters } from '../../hooks/useFighters'
import { useConfig } from '../../hooks/useConfig'
import { completeMatch, overrideMatch, updateMatchWeapon, addCustomWeapon } from '../../firebase/writes'
import { useWeapons } from '../../hooks/useWeapons'
import { calcNormalHit, calcContrapaso, calcDouble, calcMutualPresa } from '../../utils/scoring'
import { PRIMARY_ZONES } from '../../utils/zones'
import styles from './ResultsForm.module.css'

// State factories

function emptyInvalid() { return { notes: '', penRed: null, penBlue: null } }

function emptyBlock() {
  return {
    invalids:       [],
    isDouble:       null,
    hitFirst:       null,   // 'red'|'blue'
    hitZone:        null,
    alsoHit:        null,   // ¿también golpeó el otro? → contrapaso si !isDouble
    contrapasoZone: null,
    doubleRedZone:  null,
    doubleBlueZone: null,
    disarmedFighter: null,  // 'red'|'blue' — solo cuando isDouble === 'disarm'
    penRed:         null,   // 'warning'|'yellow'|null
    penBlue:        null,
  }
}

function emptyBlocks() { return [emptyBlock(), emptyBlock(), emptyBlock()] }

// Block completion

function isBlockComplete(b) {
  if (b.isDouble === null) return false
  if (b.isDouble === 'presa') return true
  if (b.isDouble === 'disarm') return b.disarmedFighter !== null
  if (b.isDouble === true) return b.doubleRedZone !== null && b.doubleBlueZone !== null
  if (!b.hitFirst || !b.hitZone) return false
  if (b.alsoHit === null) return false
  return !(b.alsoHit && !b.contrapasoZone)
}

// Score computation (derived, not state)

function computeBlockDelta(block, scoreRed, scoreBlue, zoneValues) {
  if (!isBlockComplete(block)) return { deltaRed: 0, deltaBlue: 0, pointsRescued: 0 }

  let deltaRed = 0, deltaBlue = 0, pointsRescued = 0

  if (block.isDouble === 'disarm') {
    const DISARM_PTS = 3
    if (block.disarmedFighter === 'red') {
      const eff = Math.min(DISARM_PTS, scoreRed)
      deltaRed = -eff; deltaBlue = +eff
    } else {
      const eff = Math.min(DISARM_PTS, scoreBlue)
      deltaBlue = -eff; deltaRed = +eff
    }
  } else if (block.isDouble === 'presa') {
    const r = calcMutualPresa(scoreRed, scoreBlue, zoneValues)
    deltaRed = -r.deltaRed; deltaBlue = -r.deltaBlue
  } else if (block.isDouble === true) {
    const r = calcDouble(block.doubleRedZone, block.doubleBlueZone, scoreRed, scoreBlue, zoneValues)
    deltaRed = -r.deltaRed; deltaBlue = -r.deltaBlue
  } else if (block.hitFirst === 'red') {
    const r = block.alsoHit && block.contrapasoZone
      ? calcContrapaso(block.hitZone, block.contrapasoZone, scoreBlue, zoneValues)
      : calcNormalHit(block.hitZone, scoreBlue, zoneValues)
    deltaBlue = -r.pointsDelta; deltaRed = +r.pointsDelta; pointsRescued = r.pointsRescued ?? 0
  } else {
    const r = block.alsoHit && block.contrapasoZone
      ? calcContrapaso(block.hitZone, block.contrapasoZone, scoreRed, zoneValues)
      : calcNormalHit(block.hitZone, scoreRed, zoneValues)
    deltaRed = -r.pointsDelta; deltaBlue = +r.pointsDelta; pointsRescued = r.pointsRescued ?? 0
  }

  // Amarilla: anula todas las acciones válidas del infractor (reglamento art. penalidades)
  const bothYellow = block.penRed === 'yellow' && block.penBlue === 'yellow'
  if (bothYellow) {
    deltaRed = 0; deltaBlue = 0; pointsRescued = 0
  } else if (block.isDouble === false) {
    const attacker = block.hitFirst
    if (block.penRed === 'yellow' && attacker === 'red') {
      deltaRed = 0; deltaBlue = 0; pointsRescued = 0
    } else if (block.penBlue === 'yellow' && attacker === 'blue') {
      deltaRed = 0; deltaBlue = 0; pointsRescued = 0
    } else if (block.penRed === 'yellow' && attacker === 'blue') {
      // Defensor (rojo) con amarilla: su contrapaso se anula → golpe completo transfiere
      if (block.alsoHit && block.contrapasoZone) {
        const r = calcNormalHit(block.hitZone, scoreRed, zoneValues)
        deltaRed = -r.pointsDelta; deltaBlue = +r.pointsDelta; pointsRescued = 0
      }
    } else if (block.penBlue === 'yellow' && attacker === 'red') {
      if (block.alsoHit && block.contrapasoZone) {
        const r = calcNormalHit(block.hitZone, scoreBlue, zoneValues)
        deltaBlue = -r.pointsDelta; deltaRed = +r.pointsDelta; pointsRescued = 0
      }
    }
  } else if (block.isDouble === 'disarm') {
    // Desarme es consecuencia reglamentaria — amarilla individual no lo anula
  } else {
    // Doble o presa mutua: amarilla de un lado anula solo su golpe
    if (block.penRed === 'yellow') {
      deltaBlue = 0
    } else if (block.penBlue === 'yellow') {
      deltaRed = 0
    }
  }

  return { deltaRed, deltaBlue, pointsRescued }
}

function computeScores(blocks, startPts, zoneValues) {
  const out = [{ red: startPts, blue: startPts }]
  for (const b of blocks) {
    const prev = out[out.length - 1]
    const { deltaRed, deltaBlue } = computeBlockDelta(b, prev.red, prev.blue, zoneValues)
    out.push({ red: Math.max(0, prev.red + deltaRed), blue: Math.max(0, prev.blue + deltaBlue) })
  }
  return out  // length 4: [before b0, after b0, after b1, after b2]
}

// Firestore payload builder
function blockToRecords(block, startNum, scoreRed, scoreBlue, zoneValues) {
  const records = []
  let n = startNum
  for (const inv of block.invalids) {
    const pens = []
    if (inv.penRed)  pens.push({ fighter: 'red',  type: inv.penRed  })
    if (inv.penBlue) pens.push({ fighter: 'blue', type: inv.penBlue })
    records.push({
      exchange_number: n++, valid: false, invalidity_reason: 'inconclusive',
      notes: inv.notes || null, first_hit: null, contrapaso: null,
      is_double: false, double_red: null, double_blue: null,
      penalties: pens, points_delta_red: 0, points_delta_blue: 0, points_rescued: 0,
    })
  }
  const { deltaRed, deltaBlue, pointsRescued } = computeBlockDelta(block, scoreRed, scoreBlue, zoneValues)
  const pens = []
  if (block.penRed)  pens.push({ fighter: 'red',  type: block.penRed  })
  if (block.penBlue) pens.push({ fighter: 'blue', type: block.penBlue })
  const bothYellow = block.penRed === 'yellow' && block.penBlue === 'yellow'
  const isPresa = block.isDouble === 'presa'
  const isDisarm = block.isDouble === 'disarm'
  records.push({
    exchange_number: n++, valid: !bothYellow,
    invalidity_reason: bothYellow ? 'double_foul' : null, notes: null,
    first_hit: block.isDouble === false && block.hitFirst ? { fighter: block.hitFirst, zone: block.hitZone } : null,
    contrapaso: block.alsoHit && block.contrapasoZone ? { zone: block.contrapasoZone } : null,
    is_double: block.isDouble === true,
    is_presa_mutua: isPresa,
    is_disarm: isDisarm,
    disarmed_fighter: isDisarm ? block.disarmedFighter : null,
    double_red:  block.doubleRedZone  ? { zone: block.doubleRedZone  } : null,
    double_blue: block.doubleBlueZone ? { zone: block.doubleBlueZone } : null,
    penalties: pens, points_delta_red: deltaRed, points_delta_blue: deltaBlue, points_rescued: pointsRescued,
  })
  return { records, nextNum: n }
}

/**
 * Puntos "perdidos para Defensa": mide la capacidad de un tirador de no vulnerar sus
 * puntos iniciales — es un ledger separado del marcador real. Cada golpe recibido resta
 * su valor de zona CRUDO (sin descontar lo que un contrapaso rescata en el marcador real:
 * si te pegan en la cabeza (3) y contrapaseás a la mano (1), en el marcador real bajás 2,
 * pero para Defensa igual "recibiste" el golpe de cabeza completo). Doble y presa mutua
 * también restan (no tienen mecanismo de rescate). Tope: no se puede perder más de
 * `startPts` por asalto. Un intercambio anulado por amarilla (ver computeBlockDelta) no
 * resta nada — no hubo golpe real.
 */
function computeDefenseLoss(blocks, startPts, zoneValues) {
  let red = 0, blue = 0
  for (const block of blocks) {
    if (!isBlockComplete(block)) continue
    const bothYellow = block.penRed === 'yellow' && block.penBlue === 'yellow'
    if (bothYellow) continue

    if (block.isDouble === false) {
      const attacker = block.hitFirst
      if ((block.penRed === 'yellow' && attacker === 'red') ||
          (block.penBlue === 'yellow' && attacker === 'blue')) continue

      const victimRaw = zoneValues[block.hitZone]
      if (attacker === 'red') blue += victimRaw
      else red += victimRaw

      // Contrapaso defense loss — voided if defender has yellow
      if (block.alsoHit && block.contrapasoZone) {
        const defenderYellow = (attacker === 'red' && block.penBlue === 'yellow') ||
                               (attacker === 'blue' && block.penRed === 'yellow')
        if (!defenderYellow) {
          const attackerRaw = zoneValues[block.contrapasoZone]
          if (attacker === 'red') red += attackerRaw
          else blue += attackerRaw
        }
      }
    } else if (block.isDouble === 'disarm') {
      const DISARM_PTS = 3
      if (block.disarmedFighter === 'red') red += DISARM_PTS
      else blue += DISARM_PTS
    } else if (block.isDouble === 'presa') {
      const pmv = zoneValues.presa_mutua ?? 2
      if (block.penBlue !== 'yellow') red += pmv
      if (block.penRed !== 'yellow') blue += pmv
    } else if (block.isDouble === true) {
      if (block.doubleRedZone && block.penBlue !== 'yellow')  red  += zoneValues[block.doubleRedZone]
      if (block.doubleBlueZone && block.penRed !== 'yellow') blue += zoneValues[block.doubleBlueZone]
    }
  }
  return { red: Math.min(startPts, red), blue: Math.min(startPts, blue) }
}

function countHandHitsLanded(records) {
  let red = 0, blue = 0
  for (const r of records) {
    if (!r.valid) continue
    if (r.is_double) {
      if (r.double_blue?.zone === 'hand') red++
      if (r.double_red?.zone === 'hand') blue++
    } else if (r.first_hit) {
      if (r.first_hit.zone === 'hand') {
        if (r.first_hit.fighter === 'red') red++; else blue++
      }
      if (r.contrapaso?.zone === 'hand') {
        if (r.first_hit.fighter === 'red') blue++; else red++
      }
    }
  }
  return { red, blue }
}

function countDoubleHits(records) {
  let count = 0
  for (const r of records) { if (r.valid && r.is_double) count++ }
  return count
}

function countCleanHitsByZone(records) {
  let red = { hand: 0, body: 0, head: 0 }, blue = { hand: 0, body: 0, head: 0 }
  for (const r of records) {
    if (!r.valid || r.is_double || r.contrapaso || r.penalties.length > 0) continue
    if (!r.first_hit || !r.first_hit.zone) continue
    const zone = r.first_hit.zone
    if (zone !== 'hand' && zone !== 'body' && zone !== 'head') continue
    if (r.first_hit.fighter === 'red') red[zone]++
    else blue[zone]++
  }
  return { red, blue }
}

/**
 * Puntos rescatados por contrapaso (premio "Más puntos rescatados"): se le acreditan
 * a quien EJECUTA el contrapaso — la víctima del golpe principal, no el atacante.
 */
function sumContrapasoRescued(records) {
  let red = 0, blue = 0
  for (const r of records) {
    if (!r.valid || !r.contrapaso || !r.first_hit) continue
    if (r.first_hit.fighter === 'red') blue += r.points_rescued
    else red += r.points_rescued
  }
  return { red, blue }
}

function countContrapasos(records) {
  let red = 0, blue = 0
  for (const r of records) {
    if (!r.valid || !r.contrapaso || !r.first_hit) continue
    if (r.first_hit.fighter === 'red') blue++
    else red++
  }
  return { red, blue }
}

function countCleanExchanges(records) {
  let cleanRed = 0, cleanBlue = 0, totalValid = 0
  for (const r of records) {
    if (!r.valid) continue
    totalValid++
    if (r.is_double || r.is_presa_mutua) continue
    if (!r.first_hit) continue
    if (r.contrapaso) continue
    if (r.first_hit.fighter === 'red') cleanRed++
    else cleanBlue++
  }
  return { cleanRed, cleanBlue, totalValid }
}

function WeaponBar({ matchId, match, weapons }) {
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const current = match?.weapon?.name ?? ''

  if (adding) {
    return (
      <div className={styles.weaponBar}>
        <span className={styles.weaponBarLabel}>Arma:</span>
        <input
          className={styles.weaponBarInput}
          value={newName}
          autoFocus
          placeholder="Nombre del arma"
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') { setAdding(false); setNewName('') }
          }}
          onBlur={() => {
            const trimmed = newName.trim()
            if (trimmed) {
              addCustomWeapon(trimmed)
              updateMatchWeapon(matchId, trimmed)
            }
            setAdding(false); setNewName('')
          }}
        />
      </div>
    )
  }

  return (
    <div className={styles.weaponBar}>
      <span className={styles.weaponBarLabel}>Arma:</span>
      <select
        className={styles.weaponBarSelect}
        value={weapons.includes(current) ? current : '__other__'}
        onChange={(e) => {
          const v = e.target.value
          if (v === '__new__') { setAdding(true); return }
          if (v !== '__other__') updateMatchWeapon(matchId, v)
        }}
      >
        {!weapons.includes(current) && current && <option value="__other__">{current}</option>}
        {weapons.map((w) => <option key={w} value={w}>{w}</option>)}
        <option value="__new__">+ Nueva arma...</option>
      </select>
    </div>
  )
}

// Component — planilla de un asalto puntual. `onBack` vuelve a la vista anterior
// (picker de ResultsForm, o grilla de asaltos de Scheduler, según quién la use).
export default function MatchScoresheet({ matchId, roundId: roundIdProp, initialBlocks, onBlocksChange, onBack }) {
  const { currentRound }  = useRounds()
  const effectiveRoundId  = roundIdProp ?? currentRound?.id
  const { matches }       = useRoundMatches(effectiveRoundId)
  const { fightersMap }   = useFighters()
  const { config }        = useConfig()
  const { weapons }       = useWeapons()

  const [blocks, setBlocksRaw] = useState(() => initialBlocks ?? emptyBlocks())
  const [saving, setSaving] = useState(false)
  const [overrideMode, setOverrideMode] = useState(false)

  function setBlocks(updater) {
    setBlocksRaw((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      onBlocksChange?.(next)
      return next
    })
  }

  const match = matches.find((m) => m.id === matchId)
  const matchAlreadyComplete = match?.status === 'complete'
  const red  = match ? fightersMap[match.fighter_red_id]  : null
  const blue = match ? fightersMap[match.fighter_blue_id] : null

  const zoneValues   = config?.zone_values    ?? { hand: 1, body: 2, head: 3, presa: 3, presa_mutua: 2 }
  const startingPts  = config?.starting_points ?? 5

  const scores = computeScores(blocks, startingPts, zoneValues)
  const allComplete = blocks.every(isBlockComplete)

  // Accumulated card counts across all blocks (for header display)
  const cards = { red: { warning: 0, yellow: 0, red: 0 }, blue: { warning: 0, yellow: 0, red: 0 } }
  for (const b of blocks) {
    for (const inv of b.invalids) {
      if (inv.penRed  === 'warning') cards.red.warning++
      if (inv.penRed  === 'yellow')  cards.red.yellow++
      if (inv.penRed  === 'red')     cards.red.red++
      if (inv.penBlue === 'warning') cards.blue.warning++
      if (inv.penBlue === 'yellow')  cards.blue.yellow++
      if (inv.penBlue === 'red')     cards.blue.red++
    }
    if (b.penRed  === 'warning') cards.red.warning++
    if (b.penRed  === 'yellow')  cards.red.yellow++
    if (b.penRed  === 'red')     cards.red.red++
    if (b.penBlue === 'warning') cards.blue.warning++
    if (b.penBlue === 'yellow')  cards.blue.yellow++
    if (b.penBlue === 'red')     cards.blue.red++
  }
  // 2 advertencias autoinfligidas = 1 amarilla (reglamento)
  const effectiveYellowRed  = cards.red.yellow  + Math.floor(cards.red.warning  / 2)
  const effectiveYellowBlue = cards.blue.yellow + Math.floor(cards.blue.warning / 2)
  const redExpelled  = cards.red.red > 0 || effectiveYellowRed >= 2
  const blueExpelled = cards.blue.red > 0 || effectiveYellowBlue >= 2
  const hasExpulsion = redExpelled || blueExpelled

  function setBlock(i, updater) {
    setBlocks((prev) => prev.map((b, idx) => idx === i ? updater(b) : b))
  }

  function handleReset() {
    setBlocks(emptyBlocks())
  }

  const depletedAfter = (() => {
    for (let i = 0; i < 3; i++) {
      if (!isBlockComplete(blocks[i])) break
      if (scores[i + 1].red === 0 || scores[i + 1].blue === 0) return i
    }
    return null
  })()
  const isDepleted = depletedAfter !== null
  const effectiveComplete = isDepleted || allComplete
  const canConfirm = effectiveComplete || hasExpulsion

  async function handleConfirm() {
    if (!canConfirm || saving) return
    setSaving(true)
    try {
      const maxBlock = isDepleted ? depletedAfter + 1 : 3
      const allRecords = []; let n = 1
      for (let i = 0; i < maxBlock; i++) {
        if (!isBlockComplete(blocks[i])) continue
        const { records, nextNum } = blockToRecords(blocks[i], n, scores[i].red, scores[i].blue, zoneValues)
        allRecords.push(...records); n = nextNum
      }
      const lastIdx = isDepleted ? depletedAfter + 1 : blocks.filter(isBlockComplete).length
      const finalRed = scores[lastIdx].red, finalBlue = scores[lastIdx].blue
      let winnerId = 'draw'
      const endedByRedCard = hasExpulsion
      const redCardedFighter = hasExpulsion
        ? (redExpelled && blueExpelled ? 'both' : redExpelled ? 'red' : 'blue')
        : null
      if (hasExpulsion) {
        if (redExpelled && blueExpelled) winnerId = 'draw'
        else winnerId = redExpelled ? match.fighter_blue_id : match.fighter_red_id
      } else {
        if (finalRed  > finalBlue) winnerId = match.fighter_red_id
        if (finalBlue > finalRed)  winnerId = match.fighter_blue_id
      }
      const completedBlocks = blocks.slice(0, maxBlock).filter(isBlockComplete)
      const defenseLoss = computeDefenseLoss(completedBlocks, startingPts, zoneValues)
      const cleanHits = countCleanHitsByZone(allRecords)
      const contrapasoRescued = sumContrapasoRescued(allRecords)
      const contrapasoExecs = countContrapasos(allRecords)
      const cleanExch = countCleanExchanges(allRecords)
      const handHits = countHandHitsLanded(allRecords)
      const doubleHits = countDoubleHits(allRecords)
      await completeMatch(matchId, {
        exchanges: allRecords, finalScoreRed: finalRed, finalScoreBlue: finalBlue, winnerId,
        endedEarly: hasExpulsion, endedByDepletion: isDepleted,
        endedByRedCard, redCardedFighter,
        fighterRedId: match.fighter_red_id, fighterBlueId: match.fighter_blue_id,
        defenseLossRed: defenseLoss.red, defenseLossBlue: defenseLoss.blue,
        cleanHandHitsRed: cleanHits.red.hand, cleanHandHitsBlue: cleanHits.blue.hand,
        cleanBodyHitsRed: cleanHits.red.body, cleanBodyHitsBlue: cleanHits.blue.body,
        cleanHeadHitsRed: cleanHits.red.head, cleanHeadHitsBlue: cleanHits.blue.head,
        contrapasoRescuedRed: contrapasoRescued.red, contrapasoRescuedBlue: contrapasoRescued.blue,
        contrapasoCountRed: contrapasoExecs.red, contrapasoCountBlue: contrapasoExecs.blue,
        cleanExchangesRed: cleanExch.cleanRed, cleanExchangesBlue: cleanExch.cleanBlue,
        totalValidExchanges: cleanExch.totalValid,
        handHitsRed: handHits.red, handHitsBlue: handHits.blue,
        doubleHitCount: doubleHits,
        weaponName: match.weapon?.name,
      })
      onBack?.()
    } finally { setSaving(false) }
  }

  async function handleOverrideConfirm({ finalRed, finalBlue, note }) {
    if (saving) return
    setSaving(true)
    try {
      let winnerId = 'draw'
      if (finalRed  > finalBlue) winnerId = match.fighter_red_id
      if (finalBlue > finalRed)  winnerId = match.fighter_blue_id
      await overrideMatch(matchId, {
        finalScoreRed: finalRed, finalScoreBlue: finalBlue, winnerId, overrideNote: note,
        fighterRedId: match.fighter_red_id, fighterBlueId: match.fighter_blue_id,
        weaponName: match.weapon?.name,
      })
      onBack?.()
    } finally { setSaving(false) }
  }

  if (!match) return (
    <div className={styles.page}>
      <div className={styles.empty}>Este asalto ya no está disponible.</div>
      <button className={styles.backArrowBtn} onClick={onBack}>←</button>
    </div>
  )

  return (
    <div className={styles.page}>
      <div className={styles.sheetHeader}>
        <button type="button" className={styles.backArrowBtn} onClick={onBack} title="Volver">←</button>
        <div className={styles.sheetSide}>
          <span className={styles.redName}>{red?.name}</span>
          <CardBadges warning={cards.red.warning} yellow={cards.red.yellow} red={cards.red.red} />
        </div>
        <span className={styles.vs}>vs</span>
        <div className={`${styles.sheetSide} ${styles.sheetSideRight}`}>
          <CardBadges warning={cards.blue.warning} yellow={cards.blue.yellow} red={cards.blue.red} />
          <span className={styles.blueName}>{blue?.name}</span>
        </div>
      </div>

      <div className={styles.toolBar}>
        <WeaponBar matchId={matchId} match={match} weapons={weapons} />
        <button type="button" className={styles.resetBtn} onClick={handleReset}>Resetear asalto</button>
      </div>

      {!overrideMode && (
        <>
          {blocks.map((block, i) => {
            const disabled = isDepleted && i > depletedAfter
            return disabled ? null : (
              <ExchangeBlock
                key={i}
                index={i}
                block={block}
                red={red}
                blue={blue}
                scoreIn={scores[i]}
                scoreOut={scores[i + 1]}
                zoneValues={zoneValues}
                onChange={(updater) => setBlock(i, updater)}
              />
            )
          })}

          {isDepleted && (
            <div className={styles.depletionBanner}>
              {scores[depletedAfter + 1].red === 0 && scores[depletedAfter + 1].blue === 0
                ? 'Ambos agotaron sus puntos'
                : `${scores[depletedAfter + 1].red === 0 ? red?.name : blue?.name} agotó sus puntos`} — asalto terminado
            </div>
          )}

          <div className={styles.finalRow}>
            <span className={styles.finalLabel}>Puntaje Final</span>
            <span>
              <span className={styles.redName}>{scores[isDepleted ? depletedAfter + 1 : 3].red}</span>
              <span className={styles.scoreDash}> — </span>
              <span className={styles.blueName}>{scores[isDepleted ? depletedAfter + 1 : 3].blue}</span>
            </span>
          </div>

          {hasExpulsion && !effectiveComplete && (
            <div className={styles.expulsionBanner}>
              {redExpelled && blueExpelled ? 'Ambos expulsados' : `${redExpelled ? red?.name : blue?.name} expulsado`} — el asalto se puede cerrar
            </div>
          )}

          {matchAlreadyComplete ? (
            <div className={styles.actionRow}>
              <span className={styles.alreadyDoneLabel}>Asalto ya cerrado</span>
            </div>
          ) : (
            <div className={styles.actionRow}>
              <button className={styles.confirmBtn} onClick={handleConfirm} disabled={!canConfirm || saving}>
                {saving ? 'Guardando...' : hasExpulsion ? 'Cerrar por expulsión' : isDepleted ? 'Cerrar por agotamiento' : 'Confirmar y cerrar asalto'}
              </button>
              <button
                className={styles.overrideToggleBtn}
                onClick={() => setOverrideMode(true)}
              >
                ⚠ Override
              </button>
            </div>
          )}
        </>
      )}

      {overrideMode && !matchAlreadyComplete && (
        <OverrideForm red={red} blue={blue} saving={saving} onConfirm={handleOverrideConfirm} onCancel={() => setOverrideMode(false)} />
      )}
    </div>
  )
}

// OverrideForm — corrección manual de mesa, bypassea el cálculo por intercambio
function OverrideForm({ red, blue, saving, onConfirm, onCancel }) {
  const [scoreRed, setScoreRed] = useState('')
  const [scoreBlue, setScoreBlue] = useState('')
  const [note, setNote] = useState('')

  const finalRed = Number(scoreRed)
  const finalBlue = Number(scoreBlue)
  const validScores = scoreRed !== '' && scoreBlue !== '' && !Number.isNaN(finalRed) && !Number.isNaN(finalBlue)
  const canConfirm = validScores && note.trim().length > 0 && !saving

  return (
    <div className={styles.overrideForm}>
      <p className={styles.overrideHint}>
        Corrección manual de mesa — carga el puntaje final directo, sin registrar intercambios. Requiere nota editorial.
      </p>
      <div className={styles.overrideScores}>
        <label className={styles.overrideScoreField}>
          <span className={styles.redName}>{red?.name}</span>
          <input
            type="number" min="0" className={styles.overrideScoreInput}
            value={scoreRed} onChange={(e) => setScoreRed(e.target.value)}
          />
        </label>
        <span className={styles.scoreDash}>—</span>
        <label className={styles.overrideScoreField}>
          <span className={styles.blueName}>{blue?.name}</span>
          <input
            type="number" min="0" className={styles.overrideScoreInput}
            value={scoreBlue} onChange={(e) => setScoreBlue(e.target.value)}
          />
        </label>
      </div>
      <textarea
        className={styles.overrideNoteInput}
        placeholder="Nota editorial (obligatoria) — qué pasó y por qué se corrige a mano"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
      />
      <div className={styles.actionRow}>
        <button
          className={styles.confirmBtn}
          disabled={!canConfirm}
          onClick={() => onConfirm({ finalRed, finalBlue, note: note.trim() })}
        >
          {saving ? 'Guardando...' : 'Confirmar override y cerrar asalto'}
        </button>
        <button className={styles.overrideToggleBtn} onClick={onCancel}>
          ✕ Cancelar override
        </button>
      </div>
    </div>
  )
}

const ZONE_NAMES = { hand: 'las manos', body: 'el cuerpo', head: 'la cabeza', presa: 'presa' }

function zoneLabel(zone) {
  if (zone === 'presa') return 'con presa'
  return `en ${ZONE_NAMES[zone]}`
}

function narrateExchange(block, redName, blueName, zoneValues, deltaRed, deltaBlue, pointsRescued) {
  const rn = redName || 'Rojo'
  const bn = blueName || 'Azul'

  if (block.isDouble === 'disarm') {
    if (!block.disarmedFighter) return null
    const disarmed = block.disarmedFighter === 'red' ? rn : bn
    const pts = Math.abs(block.disarmedFighter === 'red' ? deltaRed : deltaBlue)
    return `${disarmed} desarmado: pierde ${pts} ${pts === 1 ? 'punto' : 'puntos'}.`
  }

  if (block.isDouble === 'presa') {
    const dr = Math.abs(deltaRed), db = Math.abs(deltaBlue)
    if (dr === 0 && db === 0) return 'Presa mutua anulada.'
    if (dr === db) return `Presa mutua, −${dr} ${dr === 1 ? 'punto' : 'puntos'} ambos.`
    if (dr === 0) return `Presa mutua, solo ${bn} pierde ${db} ${db === 1 ? 'punto' : 'puntos'}.`
    if (db === 0) return `Presa mutua, solo ${rn} pierde ${dr} ${dr === 1 ? 'punto' : 'puntos'}.`
    return `Presa mutua, −${dr} a ${rn}, −${db} a ${bn}.`
  }

  if (block.isDouble === true) {
    const rz = block.doubleRedZone
    const bz = block.doubleBlueZone
    if (!rz && !bz) return null
    if (rz && bz) return `Doble: ${rn} recibe ${zoneLabel(rz)}, ${bn} recibe ${zoneLabel(bz)}.`
    if (rz) return `Doble: ${rn} recibe ${zoneLabel(rz)}.`
    return `Doble: ${bn} recibe ${zoneLabel(bz)}.`
  }

  if (block.isDouble === false && block.hitFirst) {
    const attacker = block.hitFirst === 'red' ? rn : bn
    const victim = block.hitFirst === 'red' ? bn : rn
    const hz = block.hitZone
    if (!hz) return null

    const hitPts = zoneValues[hz] ?? 0
    let text
    if (hz === 'presa') {
      text = `${attacker} realiza presa a ${victim}: roba ${hitPts} ${hitPts === 1 ? 'punto' : 'puntos'}.`
    } else {
      text = `${attacker} golpea ${zoneLabel(hz)} a ${victim}: roba ${hitPts} ${hitPts === 1 ? 'punto' : 'puntos'}.`
    }

    if (block.alsoHit && block.contrapasoZone) {
      const cz = block.contrapasoZone
      const defenderPen = block.hitFirst === 'red' ? block.penBlue : block.penRed
      if (defenderPen === 'yellow') {
        text += ` Contrapaso ${cz === 'presa' ? 'con presa' : zoneLabel(cz)} anulado por amarilla.`
      } else if (cz === 'presa') {
        text += pointsRescued > 0
          ? ` ${victim} contrapaso con presa: anula ${pointsRescued} ${pointsRescued === 1 ? 'punto' : 'puntos'} del golpe.`
          : ` ${victim} contrapaso con presa: anula completamente el golpe.`
      } else {
        text += pointsRescued > 0
          ? ` ${victim} contrapaso ${zoneLabel(cz)}: anula ${pointsRescued} ${pointsRescued === 1 ? 'punto' : 'puntos'} del golpe.`
          : ` ${victim} contrapaso ${zoneLabel(cz)}: anula completamente el golpe.`
      }
    }
    return text
  }

  return null
}

// hitFirst = who attacked. Victim column (hitFirst !== side) shows hitZone; attacker column shows contrapasoZone.
function zoneForSide(block, side) {
  if (block.isDouble === true) return side === 'red' ? block.doubleRedZone : block.doubleBlueZone
  if (block.isDouble === false) {
    if (block.hitFirst && block.hitFirst !== side) return block.hitZone
    if (block.hitFirst === side && block.alsoHit) return block.contrapasoZone
  }
  return null
}

// Rol del toque para ese lado — solo afecta el estilo (golpe recibido vs. contrapaso vs. doble)
function zoneRoleForSide(block, side) {
  if (block.isDouble === true) return zoneForSide(block, side) ? 'double' : null
  if (block.isDouble === false) {
    if (block.hitFirst && block.hitFirst !== side && block.hitZone) return 'hit'
    if (block.hitFirst === side && block.alsoHit && block.contrapasoZone) return 'contra'
  }
  return null
}

// ExchangeBlock — planilla eidética: tocar el valor de un tirador reemplaza el flow de radios
function ExchangeBlock({ index, block, red, blue, scoreIn, zoneValues, onChange }) {
  const complete = isBlockComplete(block)
  const { deltaRed, deltaBlue, pointsRescued } = computeBlockDelta(block, scoreIn.red, scoreIn.blue, zoneValues)
  const bothYellow = block.penRed === 'yellow' && block.penBlue === 'yellow'

  function set(field, value) { onChange((b) => ({ ...b, [field]: value })) }

  function addInvalid()        { onChange((b) => ({ ...b, invalids: [...b.invalids, emptyInvalid()] })) }
  function removeInvalid(j)    { onChange((b) => ({ ...b, invalids: b.invalids.filter((_, i) => i !== j) })) }
  function setInvalid(j, f, v) { onChange((b) => ({ ...b, invalids: b.invalids.map((inv, i) => i === j ? { ...inv, [f]: v } : inv) })) }

  function selectMode(mode) {
    if (mode === 'red' || mode === 'blue') {
      const already = block.isDouble === false && block.hitFirst === mode
      if (already) {
        onChange((b) => ({ ...b, isDouble: null, hitFirst: null }))
      } else if (block.isDouble === false && block.hitFirst) {
        onChange((b) => ({
          ...b,
          hitFirst: mode,
          hitZone: b.alsoHit ? b.contrapasoZone : null,
          contrapasoZone: b.hitZone ?? null,
          alsoHit: !!(b.hitZone),
        }))
      } else {
        // Coming from double/presa/disarm/null: keep what maps to the new mode
        const victim = mode === 'red' ? 'blue' : 'red'
        onChange((b) => ({
          ...b,
          isDouble: false,
          hitFirst: mode,
          hitZone: b.hitZone ?? (victim === 'red' ? b.doubleRedZone : b.doubleBlueZone) ?? null,
          contrapasoZone: b.contrapasoZone ?? (mode === 'red' ? b.doubleRedZone : b.doubleBlueZone) ?? null,
          alsoHit: !!(b.contrapasoZone ?? (mode === 'red' ? b.doubleRedZone : b.doubleBlueZone)),
          doubleRedZone: null,
          doubleBlueZone: null,
          disarmedFighter: null,
        }))
      }
    } else if (mode === 'double') {
      if (block.isDouble === true) {
        onChange((b) => ({ ...b, isDouble: null }))
      } else {
        onChange((b) => ({
          ...b,
          isDouble: true,
          doubleRedZone: b.doubleRedZone ?? (b.hitFirst === 'red' ? b.contrapasoZone : b.hitZone) ?? null,
          doubleBlueZone: b.doubleBlueZone ?? (b.hitFirst === 'blue' ? b.contrapasoZone : b.hitZone) ?? null,
          hitFirst: null, hitZone: null, alsoHit: null, contrapasoZone: null, disarmedFighter: null,
        }))
      }
    } else if (mode === 'presa') {
      onChange((b) => ({
        ...b,
        isDouble: block.isDouble === 'presa' ? null : 'presa',
        hitFirst: null, hitZone: null, alsoHit: null, contrapasoZone: null,
        doubleRedZone: null, doubleBlueZone: null, disarmedFighter: null,
      }))
    } else if (mode === 'disarm') {
      onChange((b) => ({
        ...b,
        isDouble: block.isDouble === 'disarm' ? null : 'disarm',
        hitFirst: null, hitZone: null, alsoHit: null, contrapasoZone: null,
        doubleRedZone: null, doubleBlueZone: null, disarmedFighter: null,
      }))
    }
  }

  function handleTap(side, zone) {
    if (block.isDouble === 'presa' || block.isDouble === 'disarm') return

    if (block.isDouble === true) {
      const field = side === 'red' ? 'doubleRedZone' : 'doubleBlueZone'
      const otherField = side === 'red' ? 'doubleBlueZone' : 'doubleRedZone'
      const current = side === 'red' ? block.doubleRedZone : block.doubleBlueZone
      const newVal = current === zone ? null : zone
      if (newVal === 'presa' && block[otherField] === 'presa') {
        onChange((b) => ({
          ...b, isDouble: 'presa',
          hitFirst: null, hitZone: null, alsoHit: null, contrapasoZone: null,
          doubleRedZone: null, doubleBlueZone: null,
        }))
      } else {
        set(field, newVal)
      }
      return
    }

    if (!block.hitFirst) {
      const attacker = side === 'red' ? 'blue' : 'red'
      onChange((b) => ({ ...b, isDouble: false, hitFirst: attacker, hitZone: zone, alsoHit: false, contrapasoZone: null }))
      return
    }

    const victim = block.hitFirst === 'red' ? 'blue' : 'red'

    if (side === victim) {
      if (block.hitZone === zone) {
        onChange((b) => ({ ...b, hitZone: null, alsoHit: false, contrapasoZone: null }))
      } else if (zone === 'presa' && block.alsoHit && block.contrapasoZone === 'presa') {
        onChange((b) => ({
          ...b, isDouble: 'presa',
          hitFirst: null, hitZone: null, alsoHit: null, contrapasoZone: null,
          doubleRedZone: null, doubleBlueZone: null,
        }))
      } else {
        onChange((b) => ({ ...b, hitZone: zone, alsoHit: b.alsoHit ?? false }))
      }
      return
    }

    if (!block.hitZone) return
    if (block.alsoHit && block.contrapasoZone === zone) {
      onChange((b) => ({ ...b, alsoHit: false, contrapasoZone: null }))
    } else if (zone === 'presa' && block.hitZone === 'presa') {
      onChange((b) => ({
        ...b, isDouble: 'presa',
        hitFirst: null, hitZone: null, alsoHit: null, contrapasoZone: null,
        doubleRedZone: null, doubleBlueZone: null,
      }))
    } else {
      onChange((b) => ({ ...b, alsoHit: true, contrapasoZone: zone }))
    }
  }

  return (
    <div className={styles.exchBlock}>
      {/* Invalids before this exchange */}
      <div className={styles.invalidsSection}>
        <div className={styles.invalidsHeader}>
          <span className={styles.invalidsLabel}>Inválidos antes del intercambio {index + 1}</span>
          <button className={styles.addInvalidBtn} onClick={addInvalid}>+ Agregar inválido</button>
        </div>
        {block.invalids.map((inv, j) => (
          <div key={j} className={styles.invalidRow}>
            <input
              className={styles.notesInput}
              placeholder="Notas"
              value={inv.notes}
              onChange={(e) => setInvalid(j, 'notes', e.target.value)}
            />
            <PenToggle label={red?.name}  value={inv.penRed}  onChange={(v) => setInvalid(j, 'penRed',  v)} isRed />
            <PenToggle label={blue?.name} value={inv.penBlue} onChange={(v) => setInvalid(j, 'penBlue', v)} />
            <button className={styles.removeInvalidBtn} onClick={() => removeInvalid(j)}>✕</button>
          </div>
        ))}
      </div>

      {/* Valid exchange — grilla de 3 columnas imitando la planilla física */}
      <div className={styles.exchGrid}>
        <div className={styles.exchGridHeader}>
          <span className={styles.exchGridTitle}>Intercambio {index + 1}</span>
          <span className={styles.scoreIn}>
            <span className={styles.redName}>{scoreIn.red}</span>
            <span className={styles.scoreDash}>—</span>
            <span className={styles.blueName}>{scoreIn.blue}</span>
          </span>
        </div>

        <div className={styles.tapGrid}>
          <ZoneButtons
            name={red?.name}
            zoneValues={zoneValues}
            selectedZone={zoneForSide(block, 'red')}
            role={zoneRoleForSide(block, 'red')}
            disabled={block.isDouble === 'presa' || block.isDouble === 'disarm'}
            red
            onTap={(zone) => handleTap('red', zone)}
          />

          <div className={styles.modeColumn}>
            <ModePill active={block.isDouble === false && block.hitFirst === 'red'} red onClick={() => selectMode('red')}>Golpe Rojo</ModePill>
            <ModePill active={block.isDouble === true} onClick={() => selectMode('double')}>Doble</ModePill>
            <ModePill active={block.isDouble === false && block.hitFirst === 'blue'} blue onClick={() => selectMode('blue')}>Golpe Azul</ModePill>
            <ModePill active={block.isDouble === 'presa'} onClick={() => selectMode('presa')}>Presa mutua</ModePill>
            <ModePill active={block.isDouble === 'disarm'} onClick={() => selectMode('disarm')}>Desarme</ModePill>
            {block.isDouble === 'disarm' && (
              <div className={styles.disarmPicker}>
                <button
                  type="button"
                  className={`${styles.disarmBtn} ${block.disarmedFighter === 'red' ? styles.disarmBtnActiveRed : ''}`}
                  onClick={() => set('disarmedFighter', block.disarmedFighter === 'red' ? null : 'red')}
                >{red?.name ?? 'Rojo'}</button>
                <button
                  type="button"
                  className={`${styles.disarmBtn} ${block.disarmedFighter === 'blue' ? styles.disarmBtnActiveBlue : ''}`}
                  onClick={() => set('disarmedFighter', block.disarmedFighter === 'blue' ? null : 'blue')}
                >{blue?.name ?? 'Azul'}</button>
              </div>
            )}
            <div className={styles.narrationWrap}>
              {(() => {
                const narration = narrateExchange(block, red?.name, blue?.name, zoneValues, deltaRed, deltaBlue, pointsRescued)
                return narration ? <span className={styles.contraTag}>{narration}</span> : null
              })()}
            </div>
          </div>

          <ZoneButtons
            name={blue?.name}
            zoneValues={zoneValues}
            selectedZone={zoneForSide(block, 'blue')}
            role={zoneRoleForSide(block, 'blue')}
            disabled={block.isDouble === 'presa' || block.isDouble === 'disarm'}
            onTap={(zone) => handleTap('blue', zone)}
          />
        </div>

        {block.isDouble !== null && (
          <div className={styles.exchPenRow}>
            <PenToggle label={red?.name}  value={block.penRed}  onChange={(v) => set('penRed',  v)} isRed />
            <PenToggle label={blue?.name} value={block.penBlue} onChange={(v) => set('penBlue', v)} />
          </div>
        )}

        {complete && !bothYellow && (
          <div className={styles.diffRow}>
            <span className={styles.diffLabel}>Diferencia</span>
            <span className={deltaRed  > 0 ? styles.redPos  : deltaRed  < 0 ? styles.redNeg  : styles.neutral}>{deltaRed  > 0 ? '+' : ''}{deltaRed}</span>
            <span className={styles.scoreDash}> / </span>
            <span className={deltaBlue > 0 ? styles.bluePos : deltaBlue < 0 ? styles.blueNeg : styles.neutral}>{deltaBlue > 0 ? '+' : ''}{deltaBlue}</span>
          </div>
        )}
        {complete && bothYellow && (
          <div className={styles.diffRow}><span className={styles.invalidTag}>Doble amarilla — intercambio no cuenta</span></div>
        )}

      </div>
    </div>
  )
}

// ZoneButtons — nombre + 3 botones de valor (mano/cuerpo/cabeza, 3 arriba) + pastilla "Presa"
function ZoneButtons({ name, zoneValues, selectedZone, role, disabled, red, onTap }) {
  return (
    <div className={styles.zoneButtons}>
      <span className={`${styles.zoneButtonsName} ${red ? styles.redName : styles.blueName}`}>{name}</span>
      <div className={styles.zoneStack}>
        {PRIMARY_ZONES.map((z) => (
          <button
            key={z}
            type="button"
            disabled={disabled}
            className={[
              styles.zoneBtn,
              red ? styles.zoneBtnRed : styles.zoneBtnBlue,
              selectedZone === z ? (role === 'contra' ? styles.zoneBtnContra : styles.zoneBtnActive) : '',
            ].filter(Boolean).join(' ')}
            onClick={() => onTap(z)}
          >
            −{zoneValues[z]}
          </button>
        ))}
      </div>
      <button
        type="button"
        disabled={disabled}
        className={[
          styles.presaBtn,
          selectedZone === 'presa' ? (role === 'contra' ? styles.zoneBtnContra : styles.zoneBtnActive) : '',
        ].filter(Boolean).join(' ')}
        onClick={() => onTap('presa')}
      >
        Presa
      </button>
    </div>
  )
}

// ModePill
function ModePill({ children, active, red, blue, onClick }) {
  const cls = [
    styles.modePill,
    active && (red ? styles.modePillRed : blue ? styles.modePillBlue : styles.modePillActive),
  ].filter(Boolean).join(' ')
  return (
    <button type="button" className={cls} onClick={onClick}>{children}</button>
  )
}

// PenToggle

function PenToggle({ label, value, onChange, isRed }) {
  return (
    <div className={styles.penToggle}>
      <span className={`${styles.penLabel} ${isRed ? styles.redName : styles.blueName}`}>{label}</span>
      <div className={styles.penOpts}>
        {[{ id: 'warning', lab: 'Adv' }, { id: 'yellow', lab: 'Am' }, { id: 'red', lab: 'Roja' }].map((o) => (
          <button
            key={o.id}
            type="button"
            className={`${styles.penOpt} ${value === o.id ? (o.id === 'yellow' ? styles.penOptYellow : o.id === 'red' ? styles.penOptRed : styles.penOptWarn) : ''}`}
            onClick={() => onChange(value === o.id ? null : o.id)}
          >
            {o.lab}
          </button>
        ))}
      </div>
    </div>
  )
}

// CardBadges
function CardBadges({ warning, yellow, red }) {
  const effectiveYellow = yellow + Math.floor(warning / 2)
  const escalated = warning >= 2
  const expelled = red > 0 || effectiveYellow >= 2
  return (
    <span className={styles.cardBadges}>
      {warning > 0 && <span className={escalated ? styles.badgeYellow : styles.badgeAdv}>Adv ×{warning}{escalated ? ' → Am' : ''}</span>}
      {yellow  > 0 && <span className={styles.badgeYellow}>Am ×{yellow}</span>}
      {red     > 0 && <span className={styles.badgeRed}>Roja ×{red}</span>}
      {expelled && <span className={styles.badgeExpelled}>EXPULSADO</span>}
    </span>
  )
}

