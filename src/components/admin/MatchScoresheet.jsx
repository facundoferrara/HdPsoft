import { useState } from 'react'
import { useRoundMatches } from '../../hooks/useMatches'
import { useRounds } from '../../hooks/useRounds'
import { useFighters } from '../../hooks/useFighters'
import { useConfig } from '../../hooks/useConfig'
import { completeMatch, overrideMatch } from '../../firebase/writes'
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
    penRed:         null,   // 'warning'|'yellow'|null
    penBlue:        null,
  }
}

function emptyBlocks() { return [emptyBlock(), emptyBlock(), emptyBlock()] }

// Block completion

function isBlockComplete(b) {
  if (b.isDouble === null) return false
  if (b.isDouble === 'presa') return true   // presa mutua: no zones needed
  if (b.isDouble === true) return b.doubleRedZone !== null && b.doubleBlueZone !== null
  if (!b.hitFirst || !b.hitZone) return false
  if (b.alsoHit === null) return false
  return !(b.alsoHit && !b.contrapasoZone)
}

// Score computation (derived, not state)

function computeBlockDelta(block, scoreRed, scoreBlue, zoneValues) {
  if (!isBlockComplete(block)) return { deltaRed: 0, deltaBlue: 0, pointsRescued: 0 }

  let deltaRed = 0, deltaBlue = 0, pointsRescued = 0

  if (block.isDouble === 'presa') {
    const r = calcMutualPresa(scoreRed, scoreBlue)
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

  // Amarilla al atacante anula el intercambio completo
  const attacker = (block.isDouble === false) ? block.hitFirst : null
  if ((block.penRed === 'yellow' && attacker === 'red') ||
      (block.penBlue === 'yellow' && attacker === 'blue') ||
      (block.penRed === 'yellow' && block.penBlue === 'yellow')) {
    deltaRed = 0; deltaBlue = 0
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
  records.push({
    exchange_number: n++, valid: !bothYellow,
    invalidity_reason: bothYellow ? 'double_foul' : null, notes: null,
    first_hit: block.isDouble === false && block.hitFirst ? { fighter: block.hitFirst, zone: block.hitZone } : null,
    contrapaso: block.alsoHit && block.contrapasoZone ? { zone: block.contrapasoZone } : null,
    is_double: block.isDouble === true,
    is_presa_mutua: isPresa,
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
    const attacker = block.isDouble === false ? block.hitFirst : null
    const nullified = bothYellow ||
      (block.penRed === 'yellow' && attacker === 'red') ||
      (block.penBlue === 'yellow' && attacker === 'blue')
    if (nullified) continue

    if (block.isDouble === 'presa') {
      red += 2; blue += 2
    } else if (block.isDouble === true) {
      if (block.doubleRedZone)  red  += zoneValues[block.doubleRedZone]
      if (block.doubleBlueZone) blue += zoneValues[block.doubleBlueZone]
    } else if (block.isDouble === false && block.hitFirst) {
      const victimRaw = zoneValues[block.hitZone]
      if (block.hitFirst === 'red') blue += victimRaw
      else red += victimRaw
      if (block.alsoHit && block.contrapasoZone) {
        const attackerRaw = zoneValues[block.contrapasoZone]
        if (block.hitFirst === 'red') red += attackerRaw
        else blue += attackerRaw
      }
    }
  }
  return { red: Math.min(startPts, red), blue: Math.min(startPts, blue) }
}

/**
 * Golpes limpios a la cabeza (premio "Golpe limpio a la cabeza"): intercambios donde
 * el golpe principal fue a la cabeza, sin contrapaso, sin doble y sin penalidades.
 * Se computa sobre los records ya armados (misma forma que se guarda en Firestore).
 */
function countCleanHeadHits(records) {
  let red = 0, blue = 0
  for (const r of records) {
    if (!r.valid || r.is_double || r.contrapaso || r.penalties.length > 0) continue
    if (r.first_hit?.zone !== 'head') continue
    if (r.first_hit.fighter === 'red') red++
    else blue++
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

// Component — planilla de un asalto puntual. `onBack` vuelve a la vista anterior
// (picker de ResultsForm, o grilla de asaltos de Scheduler, según quién la use).
export default function MatchScoresheet({ matchId, onBack }) {
  const { currentRound }  = useRounds()
  const { matches }       = useRoundMatches(currentRound?.id)
  const { fightersMap }   = useFighters()
  const { config }        = useConfig()

  const [blocks, setBlocks] = useState(emptyBlocks)
  const [saving, setSaving] = useState(false)
  const [overrideMode, setOverrideMode] = useState(false)

  const match = matches.find((m) => m.id === matchId)
  const red  = match ? fightersMap[match.fighter_red_id]  : null
  const blue = match ? fightersMap[match.fighter_blue_id] : null

  const zoneValues   = config?.zone_values    ?? { hand: 1, body: 2, head: 3, presa: 3 }
  const startingPts  = config?.starting_points ?? 5

  const scores = computeScores(blocks, startingPts, zoneValues)
  const allComplete = blocks.every(isBlockComplete)

  // Accumulated card counts across all blocks (for header display)
  const cards = { red: { warning: 0, yellow: 0 }, blue: { warning: 0, yellow: 0 } }
  for (const b of blocks) {
    for (const inv of b.invalids) {
      if (inv.penRed  === 'warning') cards.red.warning++
      if (inv.penRed  === 'yellow')  cards.red.yellow++
      if (inv.penBlue === 'warning') cards.blue.warning++
      if (inv.penBlue === 'yellow')  cards.blue.yellow++
    }
    if (b.penRed  === 'warning') cards.red.warning++
    if (b.penRed  === 'yellow')  cards.red.yellow++
    if (b.penBlue === 'warning') cards.blue.warning++
    if (b.penBlue === 'yellow')  cards.blue.yellow++
  }

  function setBlock(i, updater) {
    setBlocks((prev) => prev.map((b, idx) => idx === i ? updater(b) : b))
  }

  async function handleConfirm() {
    if (!allComplete || saving) return
    setSaving(true)
    try {
      const allRecords = []; let n = 1
      for (let i = 0; i < 3; i++) {
        const { records, nextNum } = blockToRecords(blocks[i], n, scores[i].red, scores[i].blue, zoneValues)
        allRecords.push(...records); n = nextNum
      }
      const finalRed = scores[3].red, finalBlue = scores[3].blue
      let winnerId = 'draw'
      if (finalRed  > finalBlue) winnerId = match.fighter_red_id
      if (finalBlue > finalRed)  winnerId = match.fighter_blue_id
      const defenseLoss = computeDefenseLoss(blocks, startingPts, zoneValues)
      const cleanHeadHits = countCleanHeadHits(allRecords)
      const contrapasoRescued = sumContrapasoRescued(allRecords)
      await completeMatch(matchId, {
        exchanges: allRecords, finalScoreRed: finalRed, finalScoreBlue: finalBlue, winnerId,
        endedEarly: false, endedByDepletion: false,
        fighterRedId: match.fighter_red_id, fighterBlueId: match.fighter_blue_id,
        defenseLossRed: defenseLoss.red, defenseLossBlue: defenseLoss.blue,
        cleanHeadHitsRed: cleanHeadHits.red, cleanHeadHitsBlue: cleanHeadHits.blue,
        contrapasoRescuedRed: contrapasoRescued.red, contrapasoRescuedBlue: contrapasoRescued.blue,
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
          <CardBadges warning={cards.red.warning} yellow={cards.red.yellow} />
        </div>
        <span className={styles.vs}>vs</span>
        <div className={`${styles.sheetSide} ${styles.sheetSideRight}`}>
          <CardBadges warning={cards.blue.warning} yellow={cards.blue.yellow} />
          <span className={styles.blueName}>{blue?.name}</span>
        </div>
        <button
          className={`${styles.overrideToggleBtn} ${overrideMode ? styles.overrideToggleBtnActive : ''}`}
          onClick={() => setOverrideMode((v) => !v)}
        >
          {overrideMode ? '✕ Cancelar override' : '⚠ Override'}
        </button>
      </div>

      {overrideMode ? (
        <OverrideForm red={red} blue={blue} saving={saving} onConfirm={handleOverrideConfirm} />
      ) : (
        <>
          {blocks.map((block, i) => (
            <ExchangeBlock
              key={i}
              index={i}
              block={block}
              red={red}
              blue={blue}
              scoreIn={scores[i]}
              scoreOut={scores[i + 1]}
              zoneValues={zoneValues}
              isFinal={i === 2}
              finalRed={scores[3].red}
              finalBlue={scores[3].blue}
              onChange={(updater) => setBlock(i, updater)}
            />
          ))}

          <button className={styles.confirmBtn} onClick={handleConfirm} disabled={!allComplete || saving}>
            {saving ? 'Guardando...' : 'Confirmar y cerrar asalto'}
          </button>
        </>
      )}
    </div>
  )
}

// OverrideForm — corrección manual de mesa, bypassea el cálculo por intercambio
function OverrideForm({ red, blue, saving, onConfirm }) {
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
      <button
        className={styles.confirmBtn}
        disabled={!canConfirm}
        onClick={() => onConfirm({ finalRed, finalBlue, note: note.trim() })}
      >
        {saving ? 'Guardando...' : 'Confirmar override y cerrar asalto'}
      </button>
    </div>
  )
}

// Zona activa de un lado, derivada del estado del bloque (para resaltar el botón tocado).
// La columna de cada tirador marca los puntos que ESE tirador perdió (fue golpeado) —
// por eso el golpe principal se muestra en la columna de la víctima (hitFirst !== side)
// y el contrapaso (el atacante también fue tocado) en la columna del propio atacante.
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
function ExchangeBlock({ index, block, red, blue, scoreIn, zoneValues, isFinal, finalRed, finalBlue, onChange }) {
  const complete = isBlockComplete(block)
  const { deltaRed, deltaBlue, pointsRescued } = computeBlockDelta(block, scoreIn.red, scoreIn.blue, zoneValues)
  const bothYellow = block.penRed === 'yellow' && block.penBlue === 'yellow'

  function set(field, value) { onChange((b) => ({ ...b, [field]: value })) }

  function addInvalid()        { onChange((b) => ({ ...b, invalids: [...b.invalids, emptyInvalid()] })) }
  function removeInvalid(j)    { onChange((b) => ({ ...b, invalids: b.invalids.filter((_, i) => i !== j) })) }
  function setInvalid(j, f, v) { onChange((b) => ({ ...b, invalids: b.invalids.map((inv, i) => i === j ? { ...inv, [f]: v } : inv) })) }

  function toggleMode(mode) {
    const target = mode === 'double' ? true : 'presa'
    const next = block.isDouble === target ? null : target
    onChange((b) => ({
      ...b, isDouble: next, hitFirst: null, hitZone: null, alsoHit: null, contrapasoZone: null,
      doubleRedZone: null, doubleBlueZone: null,
    }))
  }

  // Tocar la columna de un tirador marca que ESE tirador fue golpeado por esa cantidad
  // de puntos (por eso los botones muestran valores negativos) — el atacante es el otro lado.
  function handleTap(side, zone) {
    if (block.isDouble === 'presa') return

    if (block.isDouble === true) {
      const field = side === 'red' ? 'doubleRedZone' : 'doubleBlueZone'
      const current = side === 'red' ? block.doubleRedZone : block.doubleBlueZone
      set(field, current === zone ? null : zone)
      return
    }

    const attacker = side === 'red' ? 'blue' : 'red'

    // Sin golpe marcado todavía: este toque es el golpe inicial del intercambio — side es la víctima
    if (!block.hitFirst) {
      onChange((b) => ({ ...b, isDouble: false, hitFirst: attacker, hitZone: zone, alsoHit: false, contrapasoZone: null }))
      return
    }

    // Toque en la columna de la víctima ya marcada: corrige la zona, o deshace si es la misma
    if (block.hitFirst === attacker) {
      if (block.hitZone === zone) {
        onChange((b) => ({ ...b, isDouble: null, hitFirst: null, hitZone: null, alsoHit: null, contrapasoZone: null }))
      } else {
        set('hitZone', zone)
      }
      return
    }

    // Toque en la propia columna del atacante: contrapaso (también fue golpeado, rescata puntos)
    if (block.alsoHit && block.contrapasoZone === zone) {
      onChange((b) => ({ ...b, alsoHit: false, contrapasoZone: null }))
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
            disabled={block.isDouble === 'presa'}
            red
            onTap={(zone) => handleTap('red', zone)}
          />

          <div className={styles.modeColumn}>
            <ModePill active={block.isDouble === true} onClick={() => toggleMode('double')}>Doble</ModePill>
            <ModePill active={block.isDouble === 'presa'} onClick={() => toggleMode('presa')}>Presa mutua</ModePill>
            {block.isDouble === false && block.hitFirst && block.alsoHit && (
              <span className={styles.contraTag}>
                {block.hitFirst === 'red' ? blue?.name : red?.name} ejecuta contrapaso, anula {pointsRescued} {pointsRescued === 1 ? 'punto' : 'puntos'} del golpe inicial
              </span>
            )}
          </div>

          <ZoneButtons
            name={blue?.name}
            zoneValues={zoneValues}
            selectedZone={zoneForSide(block, 'blue')}
            role={zoneRoleForSide(block, 'blue')}
            disabled={block.isDouble === 'presa'}
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

        {isFinal && (
          <div className={styles.finalRow}>
            <span className={styles.finalLabel}>Puntaje Final</span>
            <span>
              <span className={styles.redName}>{finalRed}</span>
              <span className={styles.scoreDash}> — </span>
              <span className={styles.blueName}>{finalBlue}</span>
            </span>
          </div>
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
function ModePill({ children, active, onClick }) {
  return (
    <button type="button" className={`${styles.modePill} ${active ? styles.modePillActive : ''}`} onClick={onClick}>
      {children}
    </button>
  )
}

// PenToggle

function PenToggle({ label, value, onChange, isRed }) {
  return (
    <div className={styles.penToggle}>
      <span className={`${styles.penLabel} ${isRed ? styles.redName : styles.blueName}`}>{label}</span>
      <div className={styles.penOpts}>
        {[{ id: 'warning', lab: 'Adv' }, { id: 'yellow', lab: 'Am' }].map((o) => (
          <button
            key={o.id}
            type="button"
            className={`${styles.penOpt} ${value === o.id ? (o.id === 'yellow' ? styles.penOptYellow : styles.penOptWarn) : ''}`}
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
function CardBadges({ warning, yellow }) {
  return (
    <span className={styles.cardBadges}>
      {warning > 0 && <span className={styles.badgeAdv}>Adv ×{warning}</span>}
      {yellow  > 0 && <span className={styles.badgeYellow}>Am ×{yellow}</span>}
    </span>
  )
}
