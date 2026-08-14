import { useState, useEffect } from 'react'
import { useFighters } from '../../hooks/useFighters'
import { updateFighterGear, updateFighterInfo, updateFighterStatus, addStaffMember, deleteFighter } from '../../firebase/writes'
import styles from './GearCheck.module.css'

const TIERS = ['tbd', 'boffer', 'nylon', 'acero', 'na']
const TIER_LABELS = { tbd: 'Pendiente', boffer: 'Boffer', nylon: 'Nylon', acero: 'Acero', na: 'Staff / no compite' }

const CONTROL_ROLES = ['both', 'referee', 'judge', 'none']
const CONTROL_ROLE_LABELS = { both: 'Árbitro y juez', referee: 'Solo árbitro', judge: 'Solo juez', none: 'Ninguno' }

export default function GearCheck() {
  const { fighters, loading } = useFighters()
  const [showAddStaff, setShowAddStaff] = useState(false)
  const [staffName, setStaffName] = useState('')
  const [staffClub, setStaffClub] = useState('')
  const [staffRole, setStaffRole] = useState('both')
  const [savingStaff, setSavingStaff] = useState(false)

  if (loading) return <div className={styles.loading}>Cargando...</div>

  const byClub = fighters.reduce((acc, f) => {
    if (!acc[f.club]) acc[f.club] = []
    acc[f.club].push(f)
    return acc
  }, {})

  const counts = {
    active: fighters.filter((f) => !['tbd', 'na'].includes(f.tier) && f.status !== 'paused' && f.status !== 'disqualified').length,
    tbd: fighters.filter((f) => f.tier === 'tbd').length,
    na: fighters.filter((f) => f.tier === 'na').length,
    paused: fighters.filter((f) => f.status === 'paused').length,
    disqualified: fighters.filter((f) => f.status === 'disqualified').length,
  }

  async function handleTierChange(fighter, tier) {
    await updateFighterGear(fighter.id, tier)
  }

  async function handleAddStaff(e) {
    e.preventDefault()
    if (!staffName.trim() || savingStaff) return
    setSavingStaff(true)
    try {
      await addStaffMember({ name: staffName.trim(), club: staffClub.trim(), role: staffRole })
      setStaffName(''); setStaffClub(''); setStaffRole('both'); setShowAddStaff(false)
    } finally {
      setSavingStaff(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.summary}>
        <span className={styles.chip}>✓ {counts.active} acreditados</span>
        {counts.tbd > 0 && <span className={`${styles.chip} ${styles.chipPending}`}>⏳ {counts.tbd} pendientes</span>}
        {counts.paused > 0 && <span className={`${styles.chip} ${styles.chipPaused}`}>⏸ {counts.paused} pausados</span>}
        {counts.disqualified > 0 && <span className={`${styles.chip} ${styles.chipDq}`}>✕ {counts.disqualified} descalificados</span>}
        {counts.na > 0 && <span className={`${styles.chip} ${styles.chipAbsent}`}>👥 {counts.na} staff/no compite</span>}
        <button className={styles.addStaffBtn} onClick={() => setShowAddStaff((v) => !v)}>
          {showAddStaff ? '✕ Cancelar' : '+ Agregar persona presente'}
        </button>
      </div>

      {showAddStaff && (
        <form className={styles.addStaffForm} onSubmit={handleAddStaff}>
          <input
            className={styles.addStaffInput}
            placeholder="Nombre"
            value={staffName}
            onChange={(e) => setStaffName(e.target.value)}
            autoFocus
          />
          <input
            className={styles.addStaffInput}
            placeholder="Club (opcional)"
            value={staffClub}
            onChange={(e) => setStaffClub(e.target.value)}
          />
          <select
            className={styles.addStaffSelect}
            value={staffRole}
            onChange={(e) => setStaffRole(e.target.value)}
          >
            {CONTROL_ROLES.map((r) => (
              <option key={r} value={r}>{CONTROL_ROLE_LABELS[r]}</option>
            ))}
          </select>
          <button className={styles.addStaffSubmit} type="submit" disabled={!staffName.trim() || savingStaff}>
            {savingStaff ? 'Guardando...' : 'Agregar'}
          </button>
        </form>
      )}

      {Object.entries(byClub).sort().map(([club, clubFighters]) => (
        <div key={club} className={styles.clubSection}>
          <h3 className={styles.clubName}>{club}</h3>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Club</th>
                <th>Rol</th>
                <th>Tier</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {clubFighters.map((f) => (
                <tr
                  key={f.id}
                  className={
                    f.status === 'disqualified' ? styles.rowDisqualified
                    : f.status === 'paused' ? styles.rowPaused
                    : f.tier === 'na' ? styles.rowAbsent
                    : f.tier === 'tbd' ? styles.rowPending
                    : styles.rowActive
                  }
                >
                  <td className={styles.name}>
                    <InlineEdit value={f.name} onSave={(v) => updateFighterInfo(f.id, { name: v })} />
                  </td>
                  <td>
                    <InlineEdit value={f.club} onSave={(v) => updateFighterInfo(f.id, { club: v })} />
                  </td>
                  <td>
                    <select
                      className={styles.roleSelect}
                      value={f.role ?? 'none'}
                      onChange={(e) => updateFighterInfo(f.id, { role: e.target.value })}
                    >
                      {CONTROL_ROLES.map((r) => (
                        <option key={r} value={r}>{CONTROL_ROLE_LABELS[r]}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      className={`${styles.tierSelect} ${styles[`tier_${f.tier}`]}`}
                      value={f.tier}
                      onChange={(e) => handleTierChange(f, e.target.value)}
                    >
                      {TIERS.map((t) => (
                        <option key={t} value={t}>{TIER_LABELS[t]}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <StatusActions fighter={f} />
                  </td>
                  <td>
                    <button
                      className={styles.deleteBtn}
                      title="Eliminar"
                      onClick={() => { if (confirm(`¿Eliminar a ${f.name}?`)) deleteFighter(f.id) }}
                    >✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

function StatusActions({ fighter }) {
  const [busy, setBusy] = useState(false)
  const f = fighter

  async function handlePause() {
    if (busy) return
    const msg = `¿Pausar a ${f.name}? Si tiene asalto pendiente en la ronda activa, se cancelará y ambos recibirán bye.`
    if (!confirm(msg)) return
    setBusy(true)
    try {
      const result = await updateFighterStatus(f.id, 'paused')
      if (result.cancelledMatch) {
        alert(`${f.name} pausado. Asalto cancelado, bye para ambos.`)
      }
    } finally { setBusy(false) }
  }

  async function handleUnpause() {
    if (busy) return
    setBusy(true)
    try { await updateFighterStatus(f.id, 'active') }
    finally { setBusy(false) }
  }

  async function handleReinstate() {
    if (busy) return
    if (!confirm(`¿Reinstalar a ${f.name}? Volverá a ser elegible para rondas futuras.`)) return
    setBusy(true)
    try { await updateFighterStatus(f.id, 'active') }
    finally { setBusy(false) }
  }

  if (f.status === 'disqualified') {
    return (
      <div className={styles.statusCell}>
        <span className={styles.dqBadge}>DQ</span>
        <button className={styles.reinstateBtn} onClick={handleReinstate} disabled={busy}>↩</button>
      </div>
    )
  }

  if (f.status === 'paused') {
    return (
      <div className={styles.statusCell}>
        <button className={styles.unpauseBtn} onClick={handleUnpause} disabled={busy}>▶ Activar</button>
      </div>
    )
  }

  if (['tbd', 'na'].includes(f.tier)) return <span className={styles.statusNA}>—</span>

  return (
    <button className={styles.pauseBtn} onClick={handlePause} disabled={busy}>⏸</button>
  )
}

function InlineEdit({ value, onSave }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  useEffect(() => { setDraft(value) }, [value])

  function commit() {
    setEditing(false)
    const trimmed = draft.trim()
    if (trimmed && trimmed !== value) onSave(trimmed)
    else setDraft(value)
  }

  if (!editing) {
    return (
      <span className={styles.inlineValue} onClick={() => setEditing(true)}>
        {value}
      </span>
    )
  }

  return (
    <input
      className={styles.inlineInput}
      value={draft}
      autoFocus
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
    />
  )
}
