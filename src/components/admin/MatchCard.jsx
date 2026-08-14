import { useState, useEffect } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { useWeapons } from '../../hooks/useWeapons'
import { addCustomWeapon } from '../../firebase/writes'
import styles from './MatchCard.module.css'

const TIER_COLOR = { boffer: '#42a5f5', nylon: '#ab47bc', acero: '#81c784' }

/**
 * Tarjeta de asalto del Scheduler.
 * @param {{ match, fightersMap, isBlocked, onReroll, candidates, onAssignRole, onDeactivate, onUpdateWeapon, onCardClick, isSelected }} props
 */
export default function MatchCard({ match, fightersMap, isBlocked, onReroll, candidates = [], onAssignRole, onDeactivate, onUpdateWeapon, onCardClick, isSelected }) {
  const isDraggable = match.status === 'pending' && !isBlocked
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: match.id,
    disabled: !isDraggable,
  })

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  }

  const red = fightersMap[match.fighter_red_id]
  const blue = fightersMap[match.fighter_blue_id]
  const referee = fightersMap[match.referee_id]
  const judge1 = fightersMap[match.judge_1_id]
  const judge2 = fightersMap[match.judge_2_id]

  const cardClass = [
    styles.card,
    match.status === 'complete' ? styles.complete :
    match.status === 'cancelled' ? styles.cancelled :
    match.status === 'active' ? styles.active :
    isBlocked ? styles.blocked : styles.available,
    isDragging ? styles.dragging : '',
    isSelected ? styles.selected : '',
  ].join(' ')

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cardClass}
      {...(isDraggable ? { ...listeners, ...attributes } : {})}
      onClick={() => isDraggable && onCardClick?.(match)}
    >
      <div className={styles.header}>
        <span className={styles.matchNum}>{match.match_number != null ? `#${match.match_number}` : '—'}</span>
        <span className={styles.tier} style={{ color: TIER_COLOR[match.match_tier] }}>
          {match.match_tier?.toUpperCase()}
        </span>
        <WeaponSelect match={match} onUpdate={onUpdateWeapon} />
        {match.same_club_warning && <span className={styles.sameClub}>⚠ mismo club</span>}
        {match.fairness_warning && <span className={styles.fairnessWarning}>⚠ desbalance árbitro</span>}

        {match.rerolled && <span className={styles.rerolled}>↺</span>}
      </div>

      <div className={styles.fighters}>
        <div className={styles.fighter}>
          <span className={styles.red}>●</span>
          <span className={styles.fighterName}>{red?.name ?? '—'}</span>
          <span className={styles.fighterSub}>{red?.club} · {red?.tier}</span>
        </div>
        <div className={styles.vsRow}>vs</div>
        <div className={styles.fighter}>
          <span className={styles.blue}>●</span>
          <span className={styles.fighterName}>{blue?.name ?? '—'}</span>
          <span className={styles.fighterSub}>{blue?.club} · {blue?.tier}</span>
        </div>
      </div>

      <div className={styles.control}>
        <div className={styles.controlRow}>
          <span className={styles.controlLabel}>Árbitro</span>
          <ControlBodySlot
            current={referee}
            candidates={candidates.filter((c) => c.id !== judge1?.id && c.id !== judge2?.id)}
            disabled={!onAssignRole || !['pending', 'active'].includes(match.status)}
            onAssign={(id) => onAssignRole(match, 'referee', id)}
          />
        </div>
        <div className={styles.controlRow}>
          <span className={styles.controlLabel}>Jueces</span>
          <span className={styles.controlJudges}>
            <ControlBodySlot
              current={judge1}
              candidates={candidates.filter((c) => c.id !== referee?.id && c.id !== judge2?.id)}
              disabled={!onAssignRole || !['pending', 'active'].includes(match.status)}
              onAssign={(id) => onAssignRole(match, 'judge1', id)}
            />
            <span className={styles.controlSep}>·</span>
            <ControlBodySlot
              current={judge2}
              candidates={candidates.filter((c) => c.id !== referee?.id && c.id !== judge1?.id)}
              disabled={!onAssignRole || !['pending', 'active'].includes(match.status)}
              onAssign={(id) => onAssignRole(match, 'judge2', id)}
            />
          </span>
        </div>
      </div>

      {match.status === 'complete' && match.final_score_red != null && (
        <div className={styles.result}>
          <span className={styles.red}>{match.final_score_red}</span>
          <span className={styles.vs}>—</span>
          <span className={styles.blue}>{match.final_score_blue}</span>
        </div>
      )}

      {match.status === 'pending' && (
        <button
          className={styles.rerollBtn}
          onClick={(e) => { e.stopPropagation(); onReroll(match) }}
        >
          ↺ Reroll
        </button>
      )}

      {match.status === 'active' && onDeactivate && (
        <button
          className={styles.deactivateBtn}
          onClick={(e) => { e.stopPropagation(); onDeactivate(match.id) }}
        >
          ✕ Liberar arena
        </button>
      )}
    </div>
  )
}

function WeaponSelect({ match, onUpdate }) {
  const { weapons } = useWeapons()
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const editable = ['pending', 'active'].includes(match.status) && !!onUpdate
  const current = match.weapon?.name ?? ''

  if (!editable) return <span className={styles.weaponLabel}>{current || '—'}</span>

  if (adding) {
    return (
      <span className={styles.newWeaponRow} onClick={(e) => e.stopPropagation()}>
        <input
          className={styles.newWeaponInput}
          value={newName}
          autoFocus
          placeholder="Nombre del arma"
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.currentTarget.blur() }
            if (e.key === 'Escape') { setAdding(false); setNewName('') }
          }}
          onBlur={() => {
            const trimmed = newName.trim()
            if (trimmed) {
              addCustomWeapon(trimmed)
              onUpdate(match.id, trimmed)
            }
            setAdding(false); setNewName('')
          }}
        />
      </span>
    )
  }

  return (
    <select
      className={styles.weaponSelect}
      value={weapons.includes(current) ? current : '__other__'}
      title="Arma acordada del asalto"
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        const v = e.target.value
        if (v === '__new__') { setAdding(true); return }
        if (v !== '__other__') onUpdate(match.id, v)
      }}
    >
      {!weapons.includes(current) && current && (
        <option value="__other__">{current}</option>
      )}
      {weapons.map((w) => (
        <option key={w} value={w}>{w}</option>
      ))}
      <option value="__new__">+ Nueva arma...</option>
    </select>
  )
}

/** Nombre clickeable de árbitro/juez — abre un dropdown para forzar una reasignación manual. */
function ControlBodySlot({ current, candidates, disabled, onAssign }) {
  const [open, setOpen] = useState(false)

  if (disabled) return <span className={styles.controlName}>{current?.name ?? '—'}</span>

  return (
    <div className={styles.controlSlot}>
      <button
        type="button"
        className={styles.controlNameBtn}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
      >
        {current?.name ?? '—'}
      </button>
      {open && (
        <>
          <div className={styles.controlBackdrop} onClick={(e) => { e.stopPropagation(); setOpen(false) }} />
          <div className={styles.controlDropdown} onClick={(e) => e.stopPropagation()}>
            {candidates.length === 0 && <div className={styles.controlEmpty}>Sin candidatos</div>}
            {candidates.map((c) => (
              <button
                key={c.id}
                type="button"
                className={styles.controlOption}
                onClick={() => { onAssign(c.id); setOpen(false) }}
              >
                {c.name} <span className={styles.controlOptionClub}>{c.club}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
