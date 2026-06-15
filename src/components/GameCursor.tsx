import React, { useState, useEffect, useRef } from 'react'

// classic pixel arrow — each entry is a row of filled column indices (2px blocks)
const ARROW: number[][] = [
  [0], [0, 1], [0, 1, 2], [0, 1, 2, 3], [0, 1, 2, 3, 4], [0, 1, 2, 3, 4, 5],
  [0, 1, 2, 3, 4, 5, 6], [0, 1, 2, 3], [0, 1, 4, 5], [0, 5, 6], [0, 6],
]
// open-hand glyph for dragging
const HAND: number[][] = [
  [1, 3, 5], [1, 2, 3, 4, 5], [0, 1, 2, 3, 4, 5, 6], [0, 1, 2, 3, 4, 5, 6],
  [1, 2, 3, 4, 5], [2, 3, 4],
]

function isInteractive(el: Element | null): boolean {
  let e: Element | null = el
  for (let i = 0; e && i < 5; i++) {
    const tag = e.tagName.toLowerCase()
    if (tag === 'button' || tag === 'input' || tag === 'a') return true
    if (e.classList?.contains('node') || e.classList?.contains('edge') || e.classList?.contains('pkt')) return true
    try { if (getComputedStyle(e).cursor === 'pointer' || getComputedStyle(e).cursor === 'grab') return true } catch { /* svg */ }
    e = e.parentElement
  }
  return false
}

function Pixels({ grid, color }: { grid: number[][]; color: string }) {
  const px = 2
  return (
    <>
      {grid.map((cols, r) => cols.map(c => (
        <React.Fragment key={`${r}-${c}`}>
          <rect x={c * px - 0.5} y={r * px - 0.5} width={px + 1} height={px + 1} fill="#000" />
          <rect x={c * px} y={r * px} width={px} height={px} fill={color} />
        </React.Fragment>
      )))}
    </>
  )
}

export default function GameCursor() {
  const [pos, setPos] = useState({ x: -100, y: -100 })
  const [hover, setHover] = useState(false)
  const [clicking, setClicking] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [ping, setPing] = useState<{ id: number; x: number; y: number } | null>(null)
  const down = useRef(false)
  const wasInter = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      setPos({ x: e.clientX, y: e.clientY })
      if (down.current) { setDragging(true); return }
      const inter = isInteractive(e.target as Element)
      if (inter && !wasInter.current) {
        setPing({ id: Date.now(), x: e.clientX, y: e.clientY })
        timer.current = setTimeout(() => setHover(true), 300)
      } else if (!inter && wasInter.current) {
        if (timer.current) clearTimeout(timer.current)
        setHover(false); setPing(null)
      }
      wasInter.current = inter
    }
    const onDown = () => { down.current = true; setClicking(true); setTimeout(() => setClicking(false), 80) }
    const onUp = () => { down.current = false; setDragging(false) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mousedown', onDown)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mousedown', onDown); window.removeEventListener('mouseup', onUp) }
  }, [])

  const color = clicking ? '#ffffff' : dragging ? '#ffb300' : hover ? '#00b4ff' : '#00e676'
  const grid = dragging ? HAND : ARROW

  return (
    <>
      {ping && (
        <svg key={ping.id} width="44" height="44" style={{ position: 'fixed', left: ping.x - 22, top: ping.y - 22,
          pointerEvents: 'none', zIndex: 9998 }}>
          <circle cx="22" cy="22" fill="none" stroke="#5a7090" style={{ animation: 'radar-ping 300ms ease-out forwards' }} />
        </svg>
      )}
      <svg width="18" height="26" style={{ position: 'fixed', left: 0, top: 0,
        transform: `translate(${pos.x}px, ${pos.y}px) scale(${clicking ? 0.9 : 1})`,
        pointerEvents: 'none', zIndex: 9999, transition: 'transform 80ms' }}>
        <Pixels grid={grid} color={color} />
      </svg>
      {/* hover dot indicator */}
      {hover && !dragging && (
        <div style={{ position: 'fixed', left: pos.x - 2, top: pos.y + 28, width: 4, height: 4,
          background: '#00b4ff', pointerEvents: 'none', zIndex: 9999, animation: 'cursor-dot 600ms ease-in-out infinite' }} />
      )}
    </>
  )
}
