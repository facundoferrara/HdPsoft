import { useReducer, useState, useEffect, useCallback } from 'react'
import { useRoundMatches } from '../../hooks/useMatches'
import { useRounds } from '../../hooks/useRounds'
import { useFighters } from '../../hooks/useFighters'
import { useConfig } from '../../hooks/useConfig'
import { completeMatch } from '../../firebase/writes'
import {
  calcNormalHit, calcContrapaso, calcDouble,
} from '../../utils/scoring'
import ZonePicker from './ZonePicker'
import styles from './ResultsForm.module.css'

// ── Catálogos ─────────────────────────────────────────────────────────────────

const INVALIDITY_REASONS = [
  { id: 'inconclusive', label: 'Inconcluso (caída)' },
  { id: 'foul', label: 'Falta (uno)' },
  { id: 'double_foul', label: 'Doble falta' },
]

const PENALTY_TYPES = [
  { id: 'warning', label: 'Advertencia' },
  { id: 'yellow', label: 'Amarilla' },
  { id: 'red', label: 'Roja' },
]

const PENALTY_REASONS = [
  { id: 'illegal_zone', label: 'Golpe zona ilegal' },
  { id: 'illegal_technique', label: 'Técnica ilegal' },
  { id: 'knockdown', label: 'Derribo' },
  { id: 'excessive_force', label: 'Fuerza excesiva' },
  { id: 'contempt', label: 'Desacato' },
  { id: 'expose_back', label: 'Exponer espalda' },
  { id: 'out_of_arena', label: 'Fuera de arena' },
  { id: 'self_fall', label: 'Caída propia' },
  { id: 'self_disarm', label: 'Desarme autoinfligido' },
]

// ── Estado inicial del wizard ─────────────────────────────────────────────────

const INIT_EXCHANGE = {
  step: 'valid',       // valid | invalidReason | type | firstHit | contrapasoQ | contrapaso | doubleRed | doubleBlue | penalties | penaltyDetail | done
  valid: null,
  invalidity_reason: null,
  is_double: null,
  first_hit: null,     // { fighter, zone }
  contrapaso: null,    // { zone }
  double_red: null,
  double_blue: null,
  penalties: [],
  // temp for penalty entry
  pendingPenalty: null,
}

function exchangeReducer(state, action) {
  switch (action.type) {
    case 'SET_VALID': return { ...state, valid: action.value, step: action.value ? 'type' : 'invalidReason' }
    case 'SET_INVALIDITY': return { ...state, invalidity_reason: action.value, step: 'done' }
    case 'SET_TYPE': return { ...state, is_double: action.value, step: action.value ? 'doubleRed' : 'firstHit' }
    case 'SET_FIRST_HIT': return { ...state, first_hit: action.value, step: 'contrapasoQ' }
    case 'SET_CONTRAPASO_Q': return { ...state, step: action.value ? 'contrapaso' : 'penalties' }
    case 'SET_CONTRAPASO': return { ...state, contrapaso: action.value, step: 'penalties' }
    case 'SET_DOUBLE_RED': return { ...state, double_red: action.value, step: 'doubleBlue' }
    case 'SET_DOUBLE_BLUE': return { ...state, double_blue: action.value, step: 'penalties' }
    case 'ADD_PENALTY': return { ...state, penalties: [...state.penalties, action.value], step: 'penalties' }
    case 'START_PENALTY': return { ...state, pendingPenalty: action.value, step: 'penaltyDetail' }
    case 'FINISH_PENALTIES': return { ...state, step: 'done' }
    case 'RESET': return { ...INIT_EXCHANGE }
    default: return state
  }
}

// ── Cálculo de delta ──────────────────────────────────────────────────────────

function computeDelta(exch, scoreRed, scoreBlue, zoneValues) {
  let deltaRed = 0, deltaBlue = 0, pointsRescued = 0

  if (!exch.valid) return { deltaRed: 0, deltaBlue: 0, pointsRescued: 0 }

  if (exch.is_double && exch.double_red && exch.double_blue) {
    const r = calcDouble(exch.double_red.zone, exch.double_blue.zone, scoreRed, scoreBlue, zoneValues)
    deltaRed = -r.deltaRed
    deltaBlue = -r.deltaBlue
  } else if (exch.first_hit) {
    const { fighter, zone } = exch.first_hit
    if (fighter === 'red') {
      // Rojo golpea azul
      if (exch.contrapaso) {
        const r = calcContrapaso(zone, exch.contrapaso.zone, scoreBlue, zoneValues)
        deltaBlue = -r.pointsDelta
        pointsRescued = r.pointsRescued
      } else {
        const r = calcNormalHit(zone, scoreBlue, zoneValues)
        deltaBlue = -r.pointsDelta
      }
    } else {
      // Azul golpea rojo
      if (exch.contrapaso) {
        const r = calcContrapaso(zone, exch.contrapaso.zone, scoreRed, zoneValues)
        deltaRed = -r.pointsDelta
        pointsRescued = r.pointsRescued
      } else {
        const r = calcNormalHit(zone, scoreRed, zoneValues)
        deltaRed = -r.pointsDelta
      }
    }
  }

  // Penalizaciones: amarilla y roja anulan la acción ofensiva del infractor
  for (const pen of exch.penalties) {
    if (pen.type === 'yellow' || pen.type === 'red') {
      if (pen.fighter === 'red') {
        // Anular acción ofensiva de rojo (el delta de azul se revierte)
        if (exch.first_hit?.fighter === 'red') deltaBlue = 0
      } else {
        if (exch.first_hit?.fighter === 'blue') deltaRed = 0
      }
    }
  }

  return { deltaRed, deltaBlue, pointsRescued }
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function ResultsForm() {
  const { currentRound } = useRounds()
  const { matches } = useRoundMatches(currentRound?.id)
  const { fightersMap } = useFighters()
  const { config } = useConfig()

  const [selectedMatchId, setSelectedMatchId] = useState(null)
  const [exchanges, setExchanges] = useState([])
  const [scoreRed, setScoreRed] = useState(5)
  const [scoreBlue, setScoreBlue] = useState(5)
  const [exch, dispatch] = useReducer(exchangeReducer, INIT_EXCHANGE)
  const [zoneTemp, setZoneTemp] = useState(null)
  const [showPreview, setShowPreview] = useState(false)
  const [saving, setSaving] = useState(false)

  const activeMatches = matches.filter((m) => m.status === 'active')
  const selectedMatch = matches.find((m) => m.id === selectedMatchId)
  const red = selectedMatch ? fightersMap[selectedMatch.fighter_red_id] : null
  const blue = selectedMatch ? fightersMap[selectedMatch.fighter_blue_id] : null

  const zoneValues = config?.zone_values ?? { hand: 1, body: 2, head: 3, presa: 3 }
  const selfDisarmBase = config?.self_disarm_base ?? 3
  const startingPoints = config?.starting_points ?? 5

  const validCount = exchanges.filter((e) => e.valid).length
  const matchOver = scoreRed === 0 || scoreBlue === 0 || validCount >= 3

  function selectMatch(matchId) {
    setSelectedMatchId(matchId)
    setExchanges([])
    setScoreRed(startingPoints)
    setScoreBlue(startingPoints)
    dispatch({ type: 'RESET' })
    setShowPreview(false)
  }

  function commitExchange() {
    const { deltaRed, deltaBlue, pointsRescued } = computeDelta(exch, scoreRed, scoreBlue, zoneValues)
    const newRed = Math.max(0, scoreRed + deltaRed)
    const newBlue = Math.max(0, scoreBlue + deltaBlue)

    const record = {
      exchange_number: exchanges.length + 1,
      valid: exch.valid,
      invalidity_reason: exch.invalidity_reason ?? null,
      first_hit: exch.first_hit ?? null,
      contrapaso: exch.contrapaso ?? null,
      is_double: exch.is_double ?? false,
      double_red: exch.double_red ?? null,
      double_blue: exch.double_blue ?? null,
      penalties: exch.penalties,
      points_delta_red: deltaRed,
      points_delta_blue: deltaBlue,
      points_rescued: pointsRescued,
    }

    setExchanges((prev) => [...prev, record])
    setScoreRed(newRed)
    setScoreBlue(newBlue)
    dispatch({ type: 'RESET' })
    setZoneTemp(null)
  }

  // Commit when wizard reaches 'done' step (via useEffect to avoid side-effect during render)
  useEffect(() => {
    if (exch.step === 'done') commitExchange()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exch.step])

  async function handleConfirm() {
    if (!selectedMatch || saving) return
    setSaving(true)
    try {
      let winnerId
      if (scoreRed > scoreBlue) winnerId = selectedMatch.fighter_red_id
      else if (scoreBlue > scoreRed) winnerId = selectedMatch.fighter_blue_id
      else winnerId = 'draw'

      await completeMatch(selectedMatchId, {
        exchanges,
        finalScoreRed: scoreRed,
        finalScoreBlue: scoreBlue,
        winnerId,
        endedEarly: (scoreRed === 0 || scoreBlue === 0) && validCount < 3,
        endedByDepletion: scoreRed === 0 || scoreBlue === 0,
        fighterRedId: selectedMatch.fighter_red_id,
        fighterBlueId: selectedMatch.fighter_blue_id,
      })

      setSelectedMatchId(null)
      setExchanges([])
      setScoreRed(startingPoints)
      setScoreBlue(startingPoints)
      setShowPreview(false)
    } finally {
      setSaving(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!currentRound) return <div className={styles.empty}>No hay ronda activa.</div>
  if (activeMatches.length === 0) return <div className={styles.empty}>No hay asaltos activos en este momento.</div>

  if (!selectedMatchId) {
    return (
      <div className={styles.page}>
        <h3 className={styles.sectionTitle}>Seleccionar asalto</h3>
        <div className={styles.matchList}>
          {activeMatches.map((m) => {
            const r = fightersMap[m.fighter_red_id]
            const b = fightersMap[m.fighter_blue_id]
            return (
              <button key={m.id} className={styles.matchOption} onClick={() => selectMatch(m.id)}>
                <span className={styles.arena}>#{m.match_number} · Arena {m.arena}</span>
                <span className={styles.redName}>{r?.name ?? '—'}</span>
                <span className={styles.vs}>vs</span>
                <span className={styles.blueName}>{b?.name ?? '—'}</span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  if (showPreview) {
    return (
      <div className={styles.page}>
        <div className={styles.previewHeader}>
          <span className={styles.redName}>{red?.name}</span>
          <span className={styles.scoreBig}>{scoreRed}</span>
          <span className={styles.dash}>—</span>
          <span className={styles.scoreBig}>{scoreBlue}</span>
          <span className={styles.blueName}>{blue?.name}</span>
        </div>

        <div className={styles.exchangeList}>
          {exchanges.map((e, i) => (
            <div key={i} className={`${styles.exchRow} ${!e.valid ? styles.exchInvalid : ''}`}>
              <span className={styles.exchNum}>#{e.exchange_number}</span>
              {!e.valid ? (
                <span className={styles.exchDesc}>{INVALIDITY_REASONS.find(r => r.id === e.invalidity_reason)?.label ?? 'Inválido'}</span>
              ) : e.is_double ? (
                <span className={styles.exchDesc}>
                  Doble · {e.double_red?.zone} vs {e.double_blue?.zone}
                </span>
              ) : (
                <span className={styles.exchDesc}>
                  {e.first_hit?.fighter === 'red' ? red?.name : blue?.name} → {e.first_hit?.zone}
                  {e.contrapaso ? ` · contrapaso ${e.contrapaso.zone}` : ''}
                </span>
              )}
              <span className={styles.exchDelta}>
                {e.points_delta_red !== 0 && <span className={styles.red}>{e.points_delta_red > 0 ? '+' : ''}{e.points_delta_red}</span>}
                {e.points_delta_blue !== 0 && <span className={styles.blue}>{e.points_delta_blue > 0 ? '+' : ''}{e.points_delta_blue}</span>}
              </span>
            </div>
          ))}
        </div>

        <div className={styles.previewActions}>
          <button className={styles.backBtn} onClick={() => setShowPreview(false)}>← Volver</button>
          <button className={styles.confirmBtn} onClick={handleConfirm} disabled={saving}>
            {saving ? 'Guardando...' : 'Confirmar y cerrar asalto'}
          </button>
        </div>
      </div>
    )
  }

  // ── Wizard de intercambio ───────────────────────────────────────────────────

  return (
    <div className={styles.page}>
      {/* Scoreboard */}
      <div className={styles.scoreboard}>
        <div className={`${styles.score} ${styles.redScore}`}>
          <span className={styles.fighterLabel}>{red?.name}</span>
          <span className={styles.pts}>{scoreRed}</span>
        </div>
        <div className={styles.scoreCenter}>
          <span className={styles.exchCount}>{validCount}/3 intercambios válidos</span>
        </div>
        <div className={`${styles.score} ${styles.blueScore}`}>
          <span className={styles.pts}>{scoreBlue}</span>
          <span className={styles.fighterLabel}>{blue?.name}</span>
        </div>
      </div>

      {matchOver ? (
        <div className={styles.matchOverBanner}>
          Asalto terminado · {scoreRed > scoreBlue ? red?.name : scoreBlue > scoreRed ? blue?.name : 'Empate'}
          <button className={styles.previewBtn} onClick={() => setShowPreview(true)}>Ver resumen →</button>
        </div>
      ) : (
        <div className={styles.wizard}>
          <div className={styles.wizardTitle}>Intercambio #{exchanges.length + 1}</div>

          {exch.step === 'valid' && (
            <WizardStep label="¿Fue válido este intercambio?">
              <BtnRow>
                <Btn onClick={() => dispatch({ type: 'SET_VALID', value: true })}>Válido</Btn>
                <Btn onClick={() => dispatch({ type: 'SET_VALID', value: false })} secondary>Inválido</Btn>
              </BtnRow>
            </WizardStep>
          )}

          {exch.step === 'invalidReason' && (
            <WizardStep label="Motivo de invalidez">
              <BtnRow>
                {INVALIDITY_REASONS.map((r) => (
                  <Btn key={r.id} onClick={() => dispatch({ type: 'SET_INVALIDITY', value: r.id })}>{r.label}</Btn>
                ))}
              </BtnRow>
            </WizardStep>
          )}

          {exch.step === 'type' && (
            <WizardStep label="¿Fue un doble?">
              <BtnRow>
                <Btn onClick={() => dispatch({ type: 'SET_TYPE', value: false })}>No (golpe simple)</Btn>
                <Btn onClick={() => dispatch({ type: 'SET_TYPE', value: true })} secondary>Sí, fue doble</Btn>
              </BtnRow>
            </WizardStep>
          )}

          {exch.step === 'firstHit' && (
            <WizardStep label="Primer golpe">
              <ZonePicker label="Zona del golpe" value={zoneTemp} onChange={setZoneTemp} />
              {zoneTemp?.zone && (
                <BtnRow>
                  <Btn onClick={() => { dispatch({ type: 'SET_FIRST_HIT', value: { ...zoneTemp, fighter: 'red' } }); setZoneTemp(null) }}>
                    {red?.name} (rojo)
                  </Btn>
                  <Btn secondary onClick={() => { dispatch({ type: 'SET_FIRST_HIT', value: { ...zoneTemp, fighter: 'blue' } }); setZoneTemp(null) }}>
                    {blue?.name} (azul)
                  </Btn>
                </BtnRow>
              )}
            </WizardStep>
          )}

          {exch.step === 'contrapasoQ' && (
            <WizardStep label="¿Hubo contrapaso?">
              <BtnRow>
                <Btn onClick={() => dispatch({ type: 'SET_CONTRAPASO_Q', value: false })}>No</Btn>
                <Btn secondary onClick={() => dispatch({ type: 'SET_CONTRAPASO_Q', value: true })}>Sí</Btn>
              </BtnRow>
            </WizardStep>
          )}

          {exch.step === 'contrapaso' && (
            <WizardStep label="Zona del contrapaso">
              <ZonePicker value={zoneTemp} onChange={setZoneTemp} label="Zona de respuesta" />
              {zoneTemp?.zone && (
                <Btn onClick={() => { dispatch({ type: 'SET_CONTRAPASO', value: zoneTemp }); setZoneTemp(null) }}>
                  Confirmar contrapaso
                </Btn>
              )}
            </WizardStep>
          )}

          {exch.step === 'doubleRed' && (
            <WizardStep label={`Zona del golpe de ${red?.name} (rojo)`}>
              <ZonePicker value={zoneTemp} onChange={setZoneTemp} />
              {zoneTemp?.zone && (
                <Btn onClick={() => { dispatch({ type: 'SET_DOUBLE_RED', value: zoneTemp }); setZoneTemp(null) }}>
                  Siguiente →
                </Btn>
              )}
            </WizardStep>
          )}

          {exch.step === 'doubleBlue' && (
            <WizardStep label={`Zona del golpe de ${blue?.name} (azul)`}>
              <ZonePicker value={zoneTemp} onChange={setZoneTemp} />
              {zoneTemp?.zone && (
                <Btn onClick={() => { dispatch({ type: 'SET_DOUBLE_BLUE', value: zoneTemp }); setZoneTemp(null) }}>
                  Siguiente →
                </Btn>
              )}
            </WizardStep>
          )}

          {exch.step === 'penalties' && (
            <WizardStep label="¿Hubo penalizaciones?">
              {exch.penalties.map((p, i) => (
                <div key={i} className={styles.penTag}>
                  {p.fighter === 'red' ? red?.name : blue?.name} · {p.type} · {PENALTY_REASONS.find(r => r.id === p.reason)?.label}
                </div>
              ))}
              <BtnRow>
                <Btn secondary onClick={() => dispatch({ type: 'START_PENALTY', value: { fighter: 'red' } })}>
                  + Penalización {red?.name}
                </Btn>
                <Btn secondary onClick={() => dispatch({ type: 'START_PENALTY', value: { fighter: 'blue' } })}>
                  + Penalización {blue?.name}
                </Btn>
                <Btn onClick={() => dispatch({ type: 'FINISH_PENALTIES' })}>Sin más → confirmar</Btn>
              </BtnRow>
            </WizardStep>
          )}

          {exch.step === 'penaltyDetail' && exch.pendingPenalty && (
            <PenaltyDetailStep
              fighter={exch.pendingPenalty.fighter === 'red' ? red : blue}
              onConfirm={(type, reason) => dispatch({
                type: 'ADD_PENALTY',
                value: { fighter: exch.pendingPenalty.fighter, type, reason },
              })}
            />
          )}
        </div>
      )}

      <button className={styles.backMatchBtn} onClick={() => setSelectedMatchId(null)}>
        ← Cambiar asalto
      </button>
    </div>
  )
}

// ── Sub-componentes del wizard ────────────────────────────────────────────────

function WizardStep({ label, children }) {
  return (
    <div className={styles.step}>
      <div className={styles.stepLabel}>{label}</div>
      {children}
    </div>
  )
}

function BtnRow({ children }) {
  return <div className={styles.btnRow}>{children}</div>
}

function Btn({ children, onClick, secondary }) {
  return (
    <button
      className={`${styles.wBtn} ${secondary ? styles.wBtnSecondary : ''}`}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  )
}

function PenaltyDetailStep({ fighter, onConfirm }) {
  const [type, setType] = useState(null)
  const [reason, setReason] = useState(null)

  return (
    <div className={styles.step}>
      <div className={styles.stepLabel}>Penalización para {fighter?.name}</div>
      <div className={styles.stepLabel}>Tipo:</div>
      <BtnRow>
        {PENALTY_TYPES.map((t) => (
          <button
            key={t.id}
            className={`${styles.wBtn} ${type === t.id ? styles.wBtnSelected : styles.wBtnSecondary}`}
            onClick={() => setType(t.id)}
          >
            {t.label}
          </button>
        ))}
      </BtnRow>
      {type && (
        <>
          <div className={styles.stepLabel}>Motivo:</div>
          <div className={styles.btnRow} style={{ flexWrap: 'wrap' }}>
            {PENALTY_REASONS.map((r) => (
              <button
                key={r.id}
                className={`${styles.wBtn} ${reason === r.id ? styles.wBtnSelected : styles.wBtnSecondary}`}
                onClick={() => setReason(r.id)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </>
      )}
      {type && reason && (
        <Btn onClick={() => onConfirm(type, reason)}>Confirmar penalización</Btn>
      )}
    </div>
  )
}
