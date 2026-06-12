import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useStore } from '../store'
import {
  SCENS, Scen, ScenStep, Difficulty,
  loadProgress, saveProgress, isUnlocked, sendFx,
} from '../data/scenarios'

const COL = {
  bg: '#070b14', panel: '#0d1424', border: '#1e2d4a',
  green: '#00e676', blue: '#00b4ff', amber: '#ffb300',
  red: '#ff4444', purple: '#9c6bff', text: '#c8d8f0', dim: '#4a6a8a',
}

const DIFF_COLOR: Record<Difficulty, string> = { easy: COL.green, medium: COL.amber, hard: COL.red }

function Btn({ children, color = COL.green, onClick, disabled }: {
  children: React.ReactNode; color?: string; onClick?: () => void; disabled?: boolean
}) {
  const [hov, setHov] = useState(false)
  const lit = hov && !disabled
  return (
    <button onClick={onClick} disabled={disabled}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ fontFamily: '"Press Start 2P", cursive', fontSize: 9,
        background: lit ? `${color}18` : COL.panel,
        border: `1.5px solid ${disabled ? '#2a3a4a' : lit ? color : COL.border}`,
        boxShadow: lit ? `0 0 8px ${color}44` : 'none',
        color: disabled ? '#2a3a4a' : lit ? color : '#7a9ab8',
        padding: '8px 14px', cursor: disabled ? 'default' : 'pointer',
        transition: 'all .15s', userSelect: 'none', letterSpacing: '0.04em' }}>
      {children}
    </button>
  )
}

// ─── Scenario card in the menu grid ──────────────────────────────────────────

function ScenCard({ s, unlocked, completed, onStart }: {
  s: Scen; unlocked: boolean; completed: boolean; onStart: () => void
}) {
  const stub = s.steps.length === 0
  const playable = unlocked && !stub
  const dc = DIFF_COLOR[s.difficulty]
  return (
    <div style={{ border: `1.5px solid ${completed ? COL.green : unlocked ? COL.border : '#15203a'}`,
      background: unlocked ? COL.panel : '#0a0f1c', padding: '12px 14px',
      opacity: unlocked ? 1 : 0.55, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontFamily: '"Press Start 2P", cursive', fontSize: 9,
          color: completed ? COL.green : COL.text }}>
          {String(s.id).padStart(2, '0')}&nbsp;&nbsp;{s.title} {completed && '✓'}
        </span>
        <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 10, color: dc,
          border: `1px solid ${dc}55`, padding: '1px 6px' }}>{s.difficulty}</span>
      </div>
      <div style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 11, color: COL.dim, lineHeight: '1.5' }}>
        {s.summary}
      </div>
      <div style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 10, color: '#5a7090',
        display: 'flex', justifyContent: 'space-between' }}>
        <span>Учит: {s.teaches.join(', ')}</span><span>{s.time}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
        <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 10, color: COL.amber }}>
          Награда: +{s.reward} битов
        </span>
        {playable
          ? <Btn color={COL.green} onClick={onStart}>▶ НАЧАТЬ</Btn>
          : <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 10, color: '#3a4a5a' }}>
              {unlocked ? '🔧 в разработке' : '🔒 LOCKED'}
            </span>}
      </div>
    </div>
  )
}

// ─── Step player (compact card, graph stays visible) ────────────────────────

function StepPlayer({ scen, onFinish, onExit }: {
  scen: Scen; onFinish: () => void; onExit: () => void
}) {
  const [stepIdx, setStepIdx] = useState(0)
  const [quizPick, setQuizPick] = useState<number | null>(null)
  const [waitDone, setWaitDone] = useState(false)
  const [actionUsed, setActionUsed] = useState(false)
  const step: ScenStep = scen.steps[stepIdx]
  const isLast = stepIdx === scen.steps.length - 1

  // fire FX on step entry
  useEffect(() => {
    setQuizPick(null); setWaitDone(false); setActionUsed(false)
    step.fx?.forEach((fx, i) => setTimeout(() => sendFx(fx), i * 350))
  }, [stepIdx]) // eslint-disable-line react-hooks/exhaustive-deps

  // wait-for game events (weight-change / link-break)
  useEffect(() => {
    if (!step.waitFor) return
    const onEv = (e: Event) => {
      if ((e as CustomEvent).detail?.type === step.waitFor) setWaitDone(true)
    }
    window.addEventListener('netwar-ev', onEv)
    return () => window.removeEventListener('netwar-ev', onEv)
  }, [stepIdx]) // eslint-disable-line react-hooks/exhaustive-deps

  const canAdvance =
    (!step.quiz || quizPick === step.quiz.correct) &&
    (!step.waitFor || waitDone) &&
    (!step.action || actionUsed)

  const advance = useCallback(() => {
    if (isLast) { sendFx({ type: 'clear' }); sendFx({ type: 'ospf-off' }); onFinish() }
    else setStepIdx(i => i + 1)
  }, [isLast, onFinish])

  return (
    <div style={{ position: 'fixed', left: 16, top: 70, width: 400, zIndex: 600,
      background: COL.panel, border: `2px solid ${COL.purple}`,
      boxShadow: `0 0 24px ${COL.purple}33`, padding: '14px 18px',
      fontFamily: '"Share Tech Mono", monospace', maxHeight: 'calc(100vh - 160px)', overflowY: 'auto' }}>
      {/* header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontFamily: '"Press Start 2P", cursive', fontSize: 9, color: COL.purple }}>
          СЦ.{String(scen.id).padStart(2, '0')} {scen.title}
        </span>
        <button onClick={() => { sendFx({ type: 'clear' }); sendFx({ type: 'ospf-off' }); onExit() }}
          style={{ background: 'none', border: `1px solid ${COL.border}`, color: COL.dim,
            width: 22, height: 22, cursor: 'pointer', fontSize: 10 }}>✕</button>
      </div>
      {/* progress dots */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
        {scen.steps.map((_, i) => (
          <div key={i} style={{ flex: 1, height: 3, background: i <= stepIdx ? COL.purple : COL.border }} />
        ))}
      </div>
      {/* step text */}
      <div style={{ fontSize: 12, color: COL.text, lineHeight: '1.7', marginBottom: 10 }}>
        {step.text}
      </div>
      {/* diagram */}
      {step.diagram && (
        <pre style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 10, color: COL.blue,
          background: '#0a0f1e', border: `1px solid ${COL.border}`, padding: 8,
          overflowX: 'auto', lineHeight: '1.45', marginBottom: 10 }}>
          {step.diagram}
        </pre>
      )}
      {/* interactive action */}
      {step.action && (
        <div style={{ marginBottom: 10 }}>
          <Btn color={COL.blue} onClick={() => { step.action!.fx.forEach((fx, i) => setTimeout(() => sendFx(fx), i * 600)); setActionUsed(true) }}>
            {step.action.label}
          </Btn>
          {actionUsed && <div style={{ fontSize: 10, color: COL.green, marginTop: 6 }}>
            SYN потерян → таймаут → повторная отправка. TCP гарантирует доставку!
          </div>}
        </div>
      )}
      {/* wait-for hint */}
      {step.waitFor && !waitDone && (
        <div style={{ fontSize: 11, color: COL.amber, marginBottom: 10, lineHeight: '1.6' }}>
          ⏳ {step.waitHint}
        </div>
      )}
      {step.waitFor && waitDone && (
        <div style={{ fontSize: 11, color: COL.green, marginBottom: 10 }}>
          ✓ Получилось! OSPF пересчитал маршрут.
        </div>
      )}
      {/* quiz */}
      {step.quiz && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: COL.blue, marginBottom: 8 }}>{step.quiz.q}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {step.quiz.options.map((opt, i) => {
              const picked = quizPick === i
              const isCorrect = i === step.quiz!.correct
              const showState = quizPick !== null && picked
              const c = showState ? (isCorrect ? COL.green : COL.red) : COL.border
              return (
                <button key={i} onClick={() => setQuizPick(i)}
                  style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 11,
                    textAlign: 'left', background: picked ? `${c}15` : 'transparent',
                    border: `1.5px solid ${c}`, color: showState ? c : COL.text,
                    padding: '6px 10px', cursor: 'pointer' }}>
                  {String.fromCharCode(65 + i)}: {opt} {showState && (isCorrect ? '✓' : '✕')}
                </button>
              )
            })}
          </div>
          {quizPick === step.quiz.correct && (
            <div style={{ fontSize: 10, color: COL.green, marginTop: 8, lineHeight: '1.6' }}>
              {step.quiz.explain}
            </div>
          )}
          {quizPick !== null && quizPick !== step.quiz.correct && (
            <div style={{ fontSize: 10, color: COL.red, marginTop: 8 }}>
              Неверно — попробуй ещё раз.
            </div>
          )}
        </div>
      )}
      {/* nav */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        <Btn color={COL.dim} onClick={() => stepIdx > 0 ? setStepIdx(i => i - 1) : onExit()}>
          ← {stepIdx > 0 ? 'НАЗАД' : 'ВЫЙТИ'}
        </Btn>
        <Btn color={isLast ? COL.amber : COL.green} onClick={advance} disabled={!canAdvance}>
          {isLast ? `✓ ЗАВЕРШИТЬ (+${scen.reward})` : 'ДАЛЕЕ →'}
        </Btn>
      </div>
    </div>
  )
}

// ─── Main panel ──────────────────────────────────────────────────────────────

export default function ScenarioPanel() {
  const { scenarioPanelOpen, setScenarioPanelOpen } = useStore()
  const [progress, setProgress] = useState(loadProgress)
  const [active, setActive] = useState<Scen | null>(null)

  const finish = useCallback(() => {
    if (!active) return
    setProgress(prev => {
      if (prev.completed.includes(active.id)) return prev
      const next = { completed: [...prev.completed, active.id], bits: prev.bits + active.reward }
      saveProgress(next)
      return next
    })
    setActive(null)
    setScenarioPanelOpen(true)   // back to menu
  }, [active, setScenarioPanelOpen])

  // Step player floats over the graph
  if (active) {
    return <StepPlayer scen={active} onFinish={finish}
      onExit={() => { setActive(null); setScenarioPanelOpen(true) }} />
  }

  if (!scenarioPanelOpen) return null

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#070b14ee', zIndex: 600,
      display: 'flex', flexDirection: 'column', padding: '28px 40px', overflowY: 'auto' }}
      onClick={e => { if (e.target === e.currentTarget) setScenarioPanelOpen(false) }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <span style={{ fontFamily: '"Press Start 2P", cursive', fontSize: 14, color: COL.green,
          textShadow: `0 0 12px ${COL.green}` }}>
          ▶ СЦЕНАРИИ
        </span>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 12, color: COL.amber }}>
            БИТЫ: {progress.bits}
          </span>
          <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 12, color: COL.dim }}>
            пройдено {progress.completed.length}/15
          </span>
          <button onClick={() => setScenarioPanelOpen(false)}
            style={{ background: 'none', border: `1px solid ${COL.border}`, color: COL.dim,
              width: 28, height: 28, cursor: 'pointer', fontFamily: '"Press Start 2P", cursive', fontSize: 10 }}>✕</button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: 12 }}>
        {SCENS.map(s => (
          <ScenCard key={s.id} s={s}
            unlocked={isUnlocked(s.id, progress.completed)}
            completed={progress.completed.includes(s.id)}
            onStart={() => { setScenarioPanelOpen(false); setActive(s) }} />
        ))}
      </div>
    </div>
  )
}
