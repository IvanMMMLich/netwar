import React, { useState, useEffect, useRef } from 'react'

// is the element (or an ancestor) interactive?
function isInteractive(el: Element | null): boolean {
  let e: Element | null = el
  for (let i = 0; e && i < 5; i++) {
    const tag = e.tagName.toLowerCase()
    if (tag === 'button' || tag === 'input' || tag === 'a') return true
    if (e.classList?.contains('node') || e.classList?.contains('edge') || e.classList?.contains('pkt')) return true
    try { if (getComputedStyle(e).cursor === 'pointer') return true } catch { /* svg */ }
    e = e.parentElement
  }
  return false
}

export default function GameCursor() {
  const [pos, setPos] = useState({ x: -100, y: -100 })
  const [active, setActive] = useState(false)   // hovering interactive (after delay)
  const [ping, setPing] = useState<{ id: number; x: number; y: number } | null>(null)
  const [clicking, setClicking] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wasInteractive = useRef(false)

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      setPos({ x: e.clientX, y: e.clientY })
      const inter = isInteractive(e.target as Element)
      if (inter && !wasInteractive.current) {
        // entered an interactive element → radar ping + 400ms delay to "active"
        setPing({ id: Date.now(), x: e.clientX, y: e.clientY })
        timer.current = setTimeout(() => setActive(true), 400)
      } else if (!inter && wasInteractive.current) {
        if (timer.current) clearTimeout(timer.current)
        setActive(false); setPing(null)
      }
      wasInteractive.current = inter
    }
    const onDown = () => { setClicking(true); setTimeout(() => setClicking(false), 100) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mousedown', onDown)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mousedown', onDown) }
  }, [])

  const size = active ? 40 : 32
  const color = clicking ? '#ffffff' : active ? '#00b4ff' : '#00e676'
  const h = size / 2

  return (
    <>
      {/* radar ping when entering an interactive element */}
      {ping && (
        <svg key={ping.id} width="40" height="40" style={{ position: 'fixed', left: ping.x - 20, top: ping.y - 20,
          pointerEvents: 'none', zIndex: 9998 }}>
          <circle cx="20" cy="20" fill="none" stroke="#5a7090" style={{ animation: 'radar-ping 400ms ease-out forwards' }} />
        </svg>
      )}

      {/* cursor crosshair */}
      <svg width={size} height={size} style={{ position: 'fixed', left: 0, top: 0,
        transform: `translate(${pos.x - h}px, ${pos.y - h}px) scale(${clicking ? 1.4 : 1})`,
        pointerEvents: 'none', zIndex: 9999, transition: 'width .2s, height .2s, transform .1s' }}>
        {/* rotating ring when active */}
        {active && (
          <circle cx={h} cy={h} r={h - 3} fill="none" stroke={color} strokeWidth="1" strokeDasharray="6 6"
            style={{ animation: 'cursor-spin 1.5s linear infinite', transformOrigin: 'center' }} opacity="0.7" />
        )}
        {/* crosshair lines */}
        <line x1={h} y1={2} x2={h} y2={10} stroke={color} strokeWidth="1.5" />
        <line x1={h} y1={size - 2} x2={h} y2={size - 10} stroke={color} strokeWidth="1.5" />
        <line x1={2} y1={h} x2={10} y2={h} stroke={color} strokeWidth="1.5" />
        <line x1={size - 2} y1={h} x2={size - 10} y2={h} stroke={color} strokeWidth="1.5" />
        {/* center square */}
        <rect x={h - 2} y={h - 2} width="4" height="4" fill="none" stroke={color} strokeWidth="1" />
      </svg>
    </>
  )
}
