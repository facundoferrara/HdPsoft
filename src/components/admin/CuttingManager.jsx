import { useState, useMemo } from 'react'
import { useCutting } from '../../hooks/useCutting'
import {
  addCuttingParticipant,
  updateCuttingParticipant,
  deleteCuttingParticipant,
  saveCuttingScores,
  resetAllCuttingScores,
} from '../../firebase/cuttingWrites'
import styles from './CuttingManager.module.css'

const CLUBS = [
  'Sol del Norte',
  'Cruz del Sur',
  'FadW',
  'Vincere',
  'Independiente',
  'Duelist Academy',
  'SMCD',
  'Motus',
]

function RosterSection({ participants, onSwitchToScoring }) {
  const [name, setName] = useState('')
  const [club, setClub] = useState(CLUBS[0])
  const [weapon, setWeapon] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editClub, setEditClub] = useState('')
  const [editWeapon, setEditWeapon] = useState('')

  async function handleAdd(e) {
    e.preventDefault()
    if (!name.trim() || saving) return
    setSaving(true)
    try {
      await addCuttingParticipant({ name, club, weapon })
      setName('')
      setWeapon('')
    } finally {
      setSaving(false)
    }
  }

  function startEdit(p) {
    setEditingId(p.id)
    setEditName(p.name)
    setEditClub(p.club)
    setEditWeapon(p.weapon || '')
  }

  async function commitEdit() {
    if (!editName.trim()) { setEditingId(null); return }
    await updateCuttingParticipant(editingId, {
      name: editName.trim(),
      club: editClub,
      weapon: editWeapon.trim().slice(0, 50),
    })
    setEditingId(null)
  }

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <h3 className={styles.sectionTitle}>Participantes</h3>
        {participants.length > 0 && (
          <button className={styles.proceedBtn} onClick={onSwitchToScoring}>
            Ir a puntajes ({participants.length})
          </button>
        )}
      </div>

      <form className={styles.addForm} onSubmit={handleAdd}>
        <input
          className={styles.input}
          placeholder="Nombre"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
        <select className={styles.select} value={club} onChange={(e) => setClub(e.target.value)}>
          {CLUBS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <input
          className={styles.inputWeapon}
          placeholder="Arma (opc.)"
          maxLength={50}
          value={weapon}
          onChange={(e) => setWeapon(e.target.value)}
        />
        <button className={styles.addBtn} type="submit" disabled={!name.trim() || saving}>
          {saving ? 'Guardando...' : '+ Agregar'}
        </button>
      </form>

      {participants.length === 0 ? (
        <p className={styles.empty}>No hay participantes registrados.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>#</th>
              <th>Nombre</th>
              <th>Academia</th>
              <th>Arma</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {participants.map((p, i) => (
              <tr key={p.id}>
                {editingId === p.id ? (
                  <>
                    <td className={styles.rankCell}>{i + 1}</td>
                    <td>
                      <input
                        className={styles.editInput}
                        value={editName}
                        autoFocus
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') commitEdit() }}
                      />
                    </td>
                    <td>
                      <select className={styles.editSelect} value={editClub} onChange={(e) => setEditClub(e.target.value)}>
                        {CLUBS.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </td>
                    <td>
                      <input
                        className={styles.editInput}
                        value={editWeapon}
                        maxLength={50}
                        onChange={(e) => setEditWeapon(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') commitEdit() }}
                      />
                    </td>
                    <td>
                      <button className={styles.saveBtn} onClick={commitEdit}>OK</button>
                      <button className={styles.cancelEditBtn} onClick={() => setEditingId(null)}>X</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className={styles.rankCell}>{i + 1}</td>
                    <td className={styles.nameCell}>{p.name}</td>
                    <td className={styles.clubCell}>{p.club}</td>
                    <td className={styles.weaponCell}>{p.weapon || '—'}</td>
                    <td className={styles.actionsCell}>
                      <button className={styles.editBtn} onClick={() => startEdit(p)}>Editar</button>
                      <button
                        className={styles.deleteBtn}
                        onClick={() => { if (confirm(`Eliminar a ${p.name}?`)) deleteCuttingParticipant(p.id) }}
                      >
                        X
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function ScoreInput({ value, onChange }) {
  return (
    <input
      className={styles.scoreInput}
      type="number"
      min={0}
      max={10}
      step={1}
      value={value ?? ''}
      onChange={(e) => {
        const v = e.target.value
        if (v === '') { onChange(null); return }
        const n = Math.min(10, Math.max(0, parseInt(v, 10)))
        if (!isNaN(n)) onChange(n)
      }}
    />
  )
}

function ScoringSection({ participants, onSwitchToRoster }) {
  const [round, setRound] = useState(1)
  const [drafts, setDrafts] = useState({})
  const [saving, setSaving] = useState({})
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [resetting, setResetting] = useState(false)

  const maxRound = useMemo(() => {
    let max = 1
    participants.forEach((p) => {
      Object.keys(p.rounds || {}).forEach((k) => {
        const n = parseInt(k, 10)
        if (n > max) max = n
      })
    })
    return max
  }, [participants])

  const availableRounds = useMemo(() => {
    const rounds = []
    for (let i = 1; i <= Math.max(maxRound, round); i++) rounds.push(i)
    return rounds
  }, [maxRound, round])

  const ranked = useMemo(() => {
    return [...participants]
      .filter((p) => p.final_score != null)
      .sort((a, b) => b.final_score - a.final_score)
  }, [participants])

  const ties = useMemo(() => {
    const groups = {}
    ranked.forEach((p) => {
      const score = p.final_score
      if (!groups[score]) groups[score] = []
      groups[score].push(p)
    })
    return Object.entries(groups)
      .filter(([, arr]) => arr.length > 1)
      .map(([score, arr]) => ({ score: Number(score), participants: arr }))
  }, [ranked])

  const firstPlaceTie = ties.find((t) => {
    const topScore = ranked[0]?.final_score
    return t.score === topScore
  })

  function getDraft(pId) {
    if (drafts[pId]) return drafts[pId]
    const p = participants.find((x) => x.id === pId)
    const existing = p?.rounds?.[round]
    return existing || { j1: null, j2: null, j3: null }
  }

  function setDraft(pId, field, value) {
    setDrafts((prev) => ({
      ...prev,
      [pId]: { ...getDraft(pId), [field]: value },
    }))
  }

  async function handleSave(pId) {
    const d = getDraft(pId)
    if (d.j1 == null || d.j2 == null || d.j3 == null) return
    setSaving((prev) => ({ ...prev, [pId]: true }))
    try {
      await saveCuttingScores(pId, round, d)
      setDrafts((prev) => { const next = { ...prev }; delete next[pId]; return next })
    } finally {
      setSaving((prev) => ({ ...prev, [pId]: false }))
    }
  }

  async function handleReset() {
    setResetting(true)
    try {
      await resetAllCuttingScores()
      setDrafts({})
      setRound(1)
    } finally {
      setResetting(false)
      setShowResetConfirm(false)
    }
  }

  function canSave(pId) {
    const d = getDraft(pId)
    return d.j1 != null && d.j2 != null && d.j3 != null
  }

  const roundParticipants = round === 1
    ? participants
    : participants.filter((p) => {
        const prevRound = p.rounds?.[round - 1]
        if (!prevRound) return false
        const prevTotal = prevRound.total
        return participants.some(
          (other) => other.id !== p.id && other.rounds?.[round - 1]?.total === prevTotal,
        )
      })

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <h3 className={styles.sectionTitle}>Puntajes</h3>
        <div className={styles.scoringControls}>
          <div className={styles.roundSelector}>
            <span className={styles.roundLabel}>Ronda:</span>
            {availableRounds.map((r) => (
              <button
                key={r}
                className={`${styles.roundBtn} ${r === round ? styles.roundBtnActive : ''}`}
                onClick={() => { setRound(r); setDrafts({}) }}
              >
                {r}
              </button>
            ))}
            <button
              className={styles.roundBtnAdd}
              onClick={() => { setRound(maxRound + 1); setDrafts({}) }}
              title="Nueva ronda de desempate"
            >
              +
            </button>
          </div>
          <button className={styles.resetScoresBtn} onClick={() => setShowResetConfirm(true)}>
            Resetear puntajes
          </button>
          <button className={styles.backBtn} onClick={onSwitchToRoster}>
            Volver al roster
          </button>
        </div>
      </div>

      {ties.length > 0 && (
        <div className={styles.tiesAlert}>
          {firstPlaceTie && (
            <p className={styles.tiesMandatory}>
              Empate en 1er puesto ({firstPlaceTie.score} pts): {firstPlaceTie.participants.map((p) => p.name).join(', ')} — desempate obligatorio
            </p>
          )}
          {ties.filter((t) => t !== firstPlaceTie).map((t) => (
            <p key={t.score} className={styles.tiesOptional}>
              Empate en {t.score} pts: {t.participants.map((p) => p.name).join(', ')} — desempate optativo
            </p>
          ))}
        </div>
      )}

      {roundParticipants.length === 0 ? (
        <p className={styles.empty}>No hay participantes para esta ronda.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Academia</th>
              <th>Arma</th>
              <th className={styles.judgeCol}>Juez 1</th>
              <th className={styles.judgeCol}>Juez 2</th>
              <th className={styles.judgeCol}>Juez 3</th>
              <th className={styles.totalCol}>Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {roundParticipants.map((p) => {
              const d = getDraft(p.id)
              const existing = p.rounds?.[round]
              const total = (d.j1 ?? 0) + (d.j2 ?? 0) + (d.j3 ?? 0)
              const isComplete = d.j1 != null && d.j2 != null && d.j3 != null
              const isSaved = existing && !drafts[p.id]
              return (
                <tr key={p.id} className={isSaved ? styles.rowSaved : ''}>
                  <td className={styles.nameCell}>{p.name}</td>
                  <td className={styles.clubCell}>{p.club}</td>
                  <td className={styles.weaponCell}>{p.weapon || '—'}</td>
                  <td>
                    <ScoreInput
                      value={d.j1}
                      onChange={(v) => setDraft(p.id, 'j1', v)}
                    />
                  </td>
                  <td>
                    <ScoreInput
                      value={d.j2}
                      onChange={(v) => setDraft(p.id, 'j2', v)}
                    />
                  </td>
                  <td>
                    <ScoreInput
                      value={d.j3}
                      onChange={(v) => setDraft(p.id, 'j3', v)}
                    />
                  </td>
                  <td className={styles.totalCell}>
                    {isComplete ? total : '—'}
                  </td>
                  <td>
                    <button
                      className={styles.saveScoreBtn}
                      disabled={!canSave(p.id) || saving[p.id]}
                      onClick={() => handleSave(p.id)}
                    >
                      {saving[p.id] ? '...' : isSaved ? 'Editar' : 'Guardar'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {ranked.length > 0 && (
        <div className={styles.rankingPreview}>
          <h4 className={styles.rankingTitle}>Ranking actual</h4>
          <ol className={styles.rankingList}>
            {ranked.map((p, i) => (
              <li key={p.id} className={styles.rankingItem}>
                <span className={styles.rankingPos}>{i + 1}.</span>
                <span className={styles.rankingName}>{p.name}</span>
                <span className={styles.rankingClub}>{p.club}</span>
                <span className={styles.rankingScore}>{p.final_score} pts</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {showResetConfirm && (
        <div className={styles.overlay}>
          <div className={styles.dialog}>
            <h3 className={styles.dialogTitle}>Resetear puntajes</h3>
            <p className={styles.dialogText}>
              Se borrarán todos los puntajes de todas las rondas. El roster de participantes NO se modifica.
            </p>
            <p className={styles.dialogWarning}>Esta accion no se puede deshacer.</p>
            <div className={styles.dialogActions}>
              <button className={styles.dialogCancel} onClick={() => setShowResetConfirm(false)} disabled={resetting}>
                Cancelar
              </button>
              <button className={styles.dialogConfirm} onClick={handleReset} disabled={resetting}>
                {resetting ? 'Reseteando...' : 'Si, resetear'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function CuttingManager() {
  const { participants, loading } = useCutting()
  const [view, setView] = useState('roster')

  if (loading) return <div className={styles.loading}>Cargando...</div>

  return (
    <div className={styles.page}>
      {view === 'roster' ? (
        <RosterSection
          participants={participants}
          onSwitchToScoring={() => setView('scoring')}
        />
      ) : (
        <ScoringSection
          participants={participants}
          onSwitchToRoster={() => setView('roster')}
        />
      )}
    </div>
  )
}
