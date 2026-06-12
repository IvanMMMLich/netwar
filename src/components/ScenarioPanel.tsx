import React from 'react'
import { useStore } from '../store'
import { SCENARIOS } from '../data/nodeInfo'

const COL = {
  bg: '#070b14', panel: '#0d1424', border: '#1e2d4a',
  green: '#00e676', blue: '#00b4ff', amber: '#ffb300',
  red: '#ff4444', purple: '#9c6bff', text: '#c8d8f0', dim: '#4a6a8a',
}

function CtrlBtn({ children, active, color = COL.green, onClick }: {
  children: React.ReactNode; active?: boolean; color?: string; onClick: () => void
}) {
  const [hov, setHov] = React.useState(false)
  const lit = hov || active
  return (
    <button onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ fontFamily: '"Press Start 2P", cursive', fontSize: 9,
        background: lit ? `${color}18` : COL.panel,
        border: `1.5px solid ${lit ? color : COL.border}`,
        boxShadow: lit ? `0 0 8px ${color}44` : 'none',
        color: lit ? color : '#7a9ab8', padding: '6px 12px', cursor: 'pointer',
        transition: 'all .15s', userSelect: 'none', letterSpacing: '0.04em',
      }}>{children}</button>
  )
}

export default function ScenarioPanel() {
  const {
    scenarioPanelOpen, setScenarioPanelOpen,
    activeScenario, setActiveScenario,
    activeScenarioStep, nextStep, prevStep,
    protocols, setProtocol,
  } = useStore()

  if (!scenarioPanelOpen) return null

  const scenario = activeScenario !== null ? SCENARIOS.find(s => s.id === activeScenario) : null
  const step     = scenario ? scenario.steps[activeScenarioStep] : null

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#070b1488',
      zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) setScenarioPanelOpen(false) }}>

      <div style={{ background: COL.panel, border: `2px solid ${COL.green}`,
        boxShadow: `0 0 40px ${COL.green}22`, width: 680, maxHeight: '85vh',
        overflowY: 'auto', padding: '24px 28px',
        fontFamily: '"Share Tech Mono", monospace' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ fontFamily: '"Press Start 2P", cursive', fontSize: 12, color: COL.green,
            textShadow: `0 0 10px ${COL.green}` }}>
            {scenario ? scenario.title : '▶ СЦЕНАРИИ'}
          </div>
          <button onClick={() => { setScenarioPanelOpen(false); setActiveScenario(null) }}
            style={{ background: 'none', border: `1px solid ${COL.border}`, color: COL.dim,
              width: 28, height: 28, cursor: 'pointer', fontFamily: '"Press Start 2P", cursive', fontSize: 10 }}>
            ✕
          </button>
        </div>

        {/* Scenario list */}
        {!scenario && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {SCENARIOS.map(s => (
              <div key={s.id} onClick={() => setActiveScenario(s.id)}
                style={{ border: `1.5px solid ${COL.border}`, padding: '14px 16px', cursor: 'pointer',
                  transition: 'border-color .15s' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = COL.green}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = COL.border}>
                <div style={{ fontFamily: '"Press Start 2P", cursive', fontSize: 9,
                  color: COL.green, marginBottom: 6 }}>
                  [{s.id}] {s.title}
                </div>
                <div style={{ fontSize: 11, color: COL.dim }}>{s.summary}</div>
              </div>
            ))}
          </div>
        )}

        {/* Active scenario step */}
        {scenario && step && (
          <>
            {/* Step indicator */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
              {scenario.steps.map((_, i) => (
                <div key={i} style={{ width: 32, height: 4, background: i <= activeScenarioStep ? COL.green : COL.border }} />
              ))}
            </div>

            {/* Step title */}
            <div style={{ fontFamily: '"Press Start 2P", cursive', fontSize: 10,
              color: COL.blue, marginBottom: 12 }}>{step.title}</div>

            {/* Description */}
            <div style={{ background: '#0a0f1e', border: `1px solid ${COL.border}`,
              padding: '12px', marginBottom: 12, fontSize: 12, color: COL.text, lineHeight: '1.7' }}>
              {step.description}
            </div>

            {/* Explanation */}
            <div style={{ fontSize: 11, color: COL.dim, lineHeight: '1.8',
              marginBottom: 16, borderLeft: `3px solid ${COL.blue}`, paddingLeft: 12 }}>
              {step.explanation}
            </div>

            {/* Protocol choices */}
            {step.choices && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontFamily: '"Press Start 2P", cursive', fontSize: 8,
                  color: COL.dim, marginBottom: 8 }}>ВЫБЕРИ ПРОТОКОЛ:</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {step.choices.map(c => (
                    <div key={c.key + c.value}>
                      <CtrlBtn active={(protocols as unknown as Record<string, string>)[c.key] === c.value}
                        onClick={() => setProtocol(c.key as keyof typeof protocols, c.value as never)}>
                        {c.label}
                      </CtrlBtn>
                      {(protocols as unknown as Record<string, string>)[c.key] === c.value && (
                        <div style={{ fontSize: 9, color: COL.green, marginTop: 4,
                          maxWidth: 160, lineHeight: '1.5' }}>{c.outcome}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Navigation */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
              <CtrlBtn onClick={() => {
                if (activeScenarioStep === 0) setActiveScenario(null)
                else prevStep()
              }} color={COL.dim}>
                ← {activeScenarioStep === 0 ? 'К СПИСКУ' : 'НАЗАД'}
              </CtrlBtn>
              {activeScenarioStep < scenario.steps.length - 1
                ? <CtrlBtn onClick={nextStep} color={COL.green}>ДАЛЕЕ →</CtrlBtn>
                : <CtrlBtn onClick={() => setActiveScenario(null)} color={COL.amber}>ЗАВЕРШИТЬ ✓</CtrlBtn>
              }
            </div>
          </>
        )}
      </div>
    </div>
  )
}
