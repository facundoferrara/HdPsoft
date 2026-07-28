import { useState } from 'react'
import GearCheck from '../components/admin/GearCheck'
import Scheduler from '../components/admin/Scheduler'
import ResultsForm from '../components/admin/ResultsForm'
import InfractionsPanel from '../components/admin/InfractionsPanel'
import RoundProjection from '../components/admin/RoundProjection'
import styles from './Admin.module.css'

const TABS = [
  { id: 'scheduler', label: 'Scheduler' },
  { id: 'results', label: 'Carga de resultados' },
  { id: 'infractions', label: 'Infracciones' },
  { id: 'gear', label: 'Gear Check' },
]

export default function Admin() {
  const [activeTab, setActiveTab] = useState('scheduler')

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <span className={styles.logo}>HDP 2026 · Admin</span>
        <nav className={styles.tabs}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      <main className={styles.content}>
        {activeTab === 'scheduler' && (
          <>
            <RoundProjection />
            <Scheduler />
          </>
        )}
        {activeTab === 'results' && <ResultsForm />}
        {activeTab === 'infractions' && <InfractionsPanel />}
        {activeTab === 'gear' && <GearCheck />}
      </main>
    </div>
  )
}
