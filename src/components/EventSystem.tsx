import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useStore } from '../store'
import { audio } from '../services/audioEngine'

// ─── Event definitions ───────────────────────────────────────────────────────

interface EvChoice { label: string; onPick: (api: EvApi) => void; quiz?: { options: string[]; correct: number; explain: string } }
interface GameEvent {
  id: number
  at: number               // seconds after sim start
  icon: string
  title: string
  body: string
  choices: EvChoice[]
  banner?: string          // persistent banner after acknowledging
}

interface EvApi {
  earn: (n: number) => void
  log: (s: string) => void
  setBanner: (s: string | null) => void
  close: () => void
}

const EVENTS: GameEvent[] = [
  {
    id: 1, at: 90, icon: '⚠', title: 'ВОЛНА БЛОКИРОВОК РКН',
    body: 'Новый приказ: заблокировать весь HTTP трафик (порт 80). Пакеты к news.com теперь блокируются если идут без шифрования. ТСПУ получил обновление правил. Время реакции: 30 секунд.',
    banner: '🔴 HTTP порт 80 заблокирован',
    choices: [
      { label: '✓ Понял', onPick: a => { a.setBanner('🔴 HTTP порт 80 заблокирован'); a.log('🔴 ИВЕНТ: HTTP порт 80 заблокирован'); a.close() } },
      { label: '? Как обойти', onPick: a => { a.log('💡 Переключи User на HTTPS или подними VPN'); } },
      { label: 'Игнорировать', onPick: a => { a.setBanner('🔴 HTTP порт 80 заблокирован'); a.close() } },
    ],
  },
  {
    id: 2, at: 180, icon: '🚨', title: 'BGP АТАКА ОБНАРУЖЕНА',
    body: 'Автономная система AS-666 начала анонсировать ТВОИ IP префиксы. 20% пакетов уходит к злоумышленнику и теряется там. Счётчик потерь растёт.',
    choices: [
      { label: 'Контратаковать', quiz: { options: ['/24 — текущий', '/25 — более специфичный', '/32 — максимально специфичный'], correct: 1, explain: 'Роутеры предпочитают более специфичный префикс. /25 перебивает чужой /24 анонс, трафик возвращается.' },
        onPick: a => { a.earn(1000); a.log('✓ BGP Hijack отражён! +1000⬡'); a.setBanner(null); a.close() } },
      { label: '? Объяснение', onPick: a => { a.log('💡 BGP Hijack: чужая AS анонсирует твой префикс с коротким AS-path. Защита — анонс /25.') } },
      { label: 'OK', onPick: a => { a.setBanner('🚨 AS-666 ворует 20% трафика'); a.close() } },
    ],
  },
  {
    id: 3, at: 300, icon: '💥', title: 'DDoS АТАКА',
    body: 'Ботнет атакует твой WebServer. Канал ISP → ТСПУ перегружен: 100%. Легитимные пакеты начинают теряться.',
    choices: [
      { label: 'Заблокировать атакующий IP', onPick: a => { a.earn(300); a.log('✓ Источник DDoS заблокирован +300⬡'); a.setBanner(null); a.close() } },
      { label: 'Купить защиту -1◈', onPick: a => { if (useStore.getState().spend(0, 1)) { a.log('✓ Rate limiting активирован (-1◈)'); a.setBanner(null); a.close() } else a.log('⚠ Нет чистых IP') } },
      { label: '? Как работает DDoS', onPick: a => { a.log('💡 DDoS перегружает канал — rate limiting отсекает лишнее.') } },
    ],
  },
  {
    id: 4, at: 420, icon: '☠', title: 'DNS АТАКА',
    body: 'ТСПУ подменяет DNS ответы! Запросы к google.com получают IP адрес заглушки РКН. DNS пакеты ведут не туда.',
    choices: [
      { label: 'Включить DoH', onPick: a => { a.earn(400); a.log('✓ DoH активирован — ТСПУ не видит DNS +400⬡'); a.setBanner(null); a.close() } },
      { label: 'Включить DNSSEC', onPick: a => { a.earn(300); a.log('✓ DNSSEC: подпись проверяется, подмена не проходит +300⬡'); a.setBanner(null); a.close() } },
      { label: '? Разница DoH/DNSSEC', onPick: a => { a.log('💡 DoH шифрует запрос; DNSSEC подписывает ответ. Лучше оба.') } },
    ],
  },
  {
    id: 5, at: 600, icon: '🌐', title: 'НОВАЯ ВОЗМОЖНОСТЬ',
    body: 'Прокладывается трансатлантический оптоволоконный кабель. Инвестиция: 3000⬡. Результат: +10 Гбит/с международный канал без ТСПУ и +5 битов/сек.',
    choices: [
      { label: 'Инвестировать 3000⬡', onPick: a => { if (useStore.getState().spend(3000)) { a.log('🌐 INTL CABLE проложен — пиринг без ТСПУ +5⬡/сек'); a.setBanner('🌐 INTL CABLE активен'); a.close() } else a.log('⚠ Недостаточно битов (нужно 3000⬡)') } },
      { label: 'Пропустить', onPick: a => a.close() },
    ],
  },
]

// ─── Component ────────────────────────────────────────────────────────────────

export default function EventSystem() {
  const mode = useStore(s => s.mode)
  const paused = useStore(s => s.paused)
  const earn = useStore(s => s.earn)

  const [active, setActive] = useState<GameEvent | null>(null)
  const [banner, setBanner] = useState<string | null>(null)
  const [quiz, setQuiz] = useState<{ choiceIdx: number } | null>(null)
  const [quizPick, setQuizPick] = useState<number | null>(null)
  const [log, setLog] = useState<string[]>([])

  const elapsed = useRef(0)
  const fired = useRef<Set<number>>(new Set())
  const lastTick = useRef(0)

  const pushLog = useCallback((s: string) => setLog(p => [s, ...p].slice(0, 4)), [])

  // sim-time accumulator (topology, not paused)
  useEffect(() => {
    let raf = 0
    const loop = (now: number) => {
      const dt = lastTick.current ? now - lastTick.current : 0; lastTick.current = now
      if (mode === 'topology' && !paused && !active) {
        elapsed.current += dt
        const ev = EVENTS.find(e => !fired.current.has(e.id) && elapsed.current / 1000 >= e.at)
        if (ev) { fired.current.add(ev.id); setActive(ev); setQuiz(null); setQuizPick(null); audio.sfxEvent() }
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [mode, paused, active])

  // manual trigger for testing / debug
  useEffect(() => {
    const onTrig = (e: Event) => { const n = (e as CustomEvent).detail?.n; const ev = EVENTS.find(x => x.id === n); if (ev) { fired.current.add(ev.id); setActive(ev); setQuiz(null); setQuizPick(null) } }
    window.addEventListener('netwar-trigger-event', onTrig)
    return () => window.removeEventListener('netwar-trigger-event', onTrig)
  }, [])

  const api: EvApi = { earn, log: pushLog, setBanner, close: () => { setActive(null); setQuiz(null); setQuizPick(null) } }

  return (
    <>
      {/* persistent banner */}
      {banner && mode === 'topology' && (
        <div style={{ position: 'absolute', top: 64, left: '50%', transform: 'translateX(-50%)', zIndex: 70,
          fontFamily: '"Share Tech Mono", monospace', fontSize: 11, color: '#ff8c00',
          background: '#0d1424', border: '1px solid #ff8c0055', padding: '4px 14px', pointerEvents: 'none' }}>
          {banner}
        </div>
      )}

      {/* event log (top-left, below SYS label, away from the HUD log) */}
      {log.length > 0 && mode === 'topology' && (
        <div style={{ position: 'absolute', top: 96, left: 16, zIndex: 55,
          fontFamily: '"Share Tech Mono", monospace', fontSize: 10, display: 'flex', flexDirection: 'column', gap: 2, pointerEvents: 'none' }}>
          {log.map((l, i) => <span key={i} style={{ color: l.startsWith('⚠') ? '#ff8c00' : l.startsWith('💡') ? '#00b4ff' : '#00e676', opacity: 1 - i * 0.2 }}>{l}</span>)}
        </div>
      )}

      {/* event modal */}
      {active && (
        <div style={{ position: 'fixed', inset: 0, background: '#070b1499', zIndex: 1500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#0d1424', border: '2px solid #ff8c00', boxShadow: '0 0 30px #ff8c0044',
            width: 460, padding: '20px 24px', fontFamily: '"Share Tech Mono", monospace' }}>
            <div style={{ fontFamily: '"Press Start 2P", cursive', fontSize: 11, color: '#ff8c00',
              textShadow: '0 0 10px #ff8c00', marginBottom: 14, textAlign: 'center' }}>
              {active.icon}  ВХОДЯЩИЙ ИВЕНТ  {active.icon}
            </div>
            <div style={{ fontFamily: '"Press Start 2P", cursive', fontSize: 10, color: '#c8d8f0', marginBottom: 12, textAlign: 'center' }}>
              {active.title}
            </div>
            <div style={{ fontSize: 12, color: '#c8d8f0', lineHeight: 1.7, marginBottom: 16 }}>{active.body}</div>

            {/* quiz mode */}
            {quiz !== null && active.choices[quiz.choiceIdx].quiz ? (() => {
              const q = active.choices[quiz.choiceIdx].quiz!
              return (
                <div>
                  <div style={{ fontSize: 11, color: '#00b4ff', marginBottom: 8 }}>Какой анонс отправить в BGP?</div>
                  {q.options.map((o, i) => {
                    const picked = quizPick === i; const correct = i === q.correct
                    const c = picked ? (correct ? '#00e676' : '#ff4444') : '#1e2d4a'
                    return (
                      <button key={i} onClick={() => setQuizPick(i)} style={{ display: 'block', width: '100%', textAlign: 'left',
                        fontFamily: '"Share Tech Mono", monospace', fontSize: 11, margin: '5px 0', padding: '6px 10px',
                        background: picked ? `${c}15` : 'transparent', border: `1.5px solid ${c}`, color: picked ? c : '#c8d8f0', cursor: 'pointer' }}>
                        {o} {picked && (correct ? '✓' : '✕')}
                      </button>
                    )
                  })}
                  {quizPick === q.correct && (
                    <>
                      <div style={{ fontSize: 10, color: '#00e676', margin: '8px 0', lineHeight: 1.5 }}>{q.explain}</div>
                      <EvBtn label="Применить" color="#00e676" onClick={() => active.choices[quiz.choiceIdx].onPick(api)} />
                    </>
                  )}
                </div>
              )
            })() : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {active.choices.map((ch, i) => (
                  <EvBtn key={i} label={ch.label}
                    color={ch.label.startsWith('?') ? '#00b4ff' : i === 0 ? '#00e676' : '#5a7090'}
                    onClick={() => { if (ch.quiz) { setQuiz({ choiceIdx: i }); setQuizPick(null) } else ch.onPick(api) }} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function EvBtn({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  const [hov, setHov] = useState(false)
  return (
    <button onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ fontFamily: '"Press Start 2P", cursive', fontSize: 8, padding: '8px 12px', cursor: 'pointer',
        background: hov ? `${color}18` : '#0d1424', border: `1.5px solid ${color}`, color, lineHeight: 1.4 }}>
      {label}
    </button>
  )
}
