import React, { useState, useRef, useCallback, useEffect } from 'react'
import { useStore } from '../store'
import {
  SB_CATALOG, SB_BY_TYPE, SbType, SB_NODE_SIZE, SbCatalogItem,
} from '../data/sandbox'

const TOOLBAR_W = 80

export interface SbNode { id: string; type: SbType; x: number; y: number; pinned: boolean; born: number }
export interface SbEdge { id: string; source: string; target: string; bw: number; latency: number; loss: number }

let sbId = 0
const newId = (p: string) => `${p}-${sbId++}`

// ─── Toolbar item ─────────────────────────────────────────────────────────────

function ToolItem({ item, affordable, onStart }: {
  item: SbCatalogItem; affordable: boolean; onStart: (e: React.MouseEvent) => void
}) {
  const [hov, setHov] = useState(false)
  const grey = !affordable && !item.enemy
  const c = item.color
  const priceStr = item.enemy ? 'ВРАГ'
    : item.bits === 0 ? 'free'
    : `${item.bits}⬡${item.ips ? ` +${item.ips}◈` : ''}`
  return (
    <div
      onMouseDown={item.enemy || grey ? undefined : onStart}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
        cursor: item.enemy || grey ? 'not-allowed' : 'grab', userSelect: 'none',
        opacity: grey ? 0.4 : 1,
      }}
    >
      <div style={{
        width: SB_NODE_SIZE, height: SB_NODE_SIZE, borderRadius: 3,
        border: `2px solid ${item.enemy ? '#ff4444' : c}`,
        background: `${c}1a`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: '"Press Start 2P", cursive', fontSize: item.label.length > 2 ? 8 : 14, color: c,
        boxShadow: hov && !grey ? `0 0 10px ${c}aa` : 'none', transition: 'box-shadow .15s',
      }}>{item.label}</div>
      <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 8, color: '#7a9ab8' }}>{item.full}</span>
      <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 8,
        color: item.enemy ? '#ff4444' : grey ? '#ff8c00' : '#ffb300' }}>
        {hov && grey ? `⚠ нужно ${item.bits}⬡` : priceStr}
      </span>
    </div>
  )
}

// ─── Main sandbox ─────────────────────────────────────────────────────────────

interface DragState { type: SbType; x: number; y: number }

export default function Sandbox() {
  const bits = useStore(s => s.bits)
  const cleanIPs = useStore(s => s.cleanIPs)
  const spend = useStore(s => s.spend)

  const [nodes, setNodes] = useState<SbNode[]>([])
  const [edges] = useState<SbEdge[]>([])      // edges used from block 3
  const [drag, setDrag] = useState<DragState | null>(null)
  const [flash, setFlash] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const canvasRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)

  const pushLog = useCallback((s: string) => setLog(p => [s, ...p].slice(0, 5)), [])

  const counts = useCallback((t: SbType) => nodes.filter(n => n.type === t).length, [nodes])

  const affordable = useCallback((item: SbCatalogItem) => {
    if (item.enemy) return false
    if (item.max && counts(item.type) >= item.max) return false
    return bits >= item.bits && cleanIPs >= item.ips
  }, [bits, cleanIPs, counts])

  // ── drag from toolbar ──
  const startDrag = useCallback((item: SbCatalogItem) => (e: React.MouseEvent) => {
    if (!affordable(item)) {
      setFlash(true); setTimeout(() => setFlash(false), 350)
      pushLog(`⚠ Недостаточно средств: ${item.full} (${item.bits}⬡${item.ips ? ` +${item.ips}◈` : ''})`)
      return
    }
    const d: DragState = { type: item.type, x: e.clientX, y: e.clientY }
    dragRef.current = d; setDrag(d)
  }, [affordable, pushLog])

  useEffect(() => {
    if (!drag) return
    const onMove = (e: MouseEvent) => {
      const d = { ...dragRef.current!, x: e.clientX, y: e.clientY }
      dragRef.current = d; setDrag(d)
    }
    const onUp = (e: MouseEvent) => {
      const d = dragRef.current
      dragRef.current = null; setDrag(null)
      if (!d || !canvasRef.current) return
      const r = canvasRef.current.getBoundingClientRect()
      const x = e.clientX - r.left, y = e.clientY - r.top
      if (x < 8 || y < 8 || x > r.width - 8 || y > r.height - 8) return   // dropped outside
      const item = SB_BY_TYPE.get(d.type)!
      if (!spend(item.bits, item.ips)) {
        setFlash(true); setTimeout(() => setFlash(false), 350)
        pushLog(`⚠ Недостаточно средств для ${item.full}`)
        return
      }
      setNodes(prev => [...prev, { id: newId(d.type), type: d.type, x, y, pinned: false, born: performance.now() }])
      pushLog(`✓ ${item.full} создан (-${item.bits}⬡${item.ips ? ` -${item.ips}◈` : ''})`)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [drag, spend, pushLog])

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', background: '#070b14' }}>
      {/* ── Toolbar ── */}
      <div style={{
        width: TOOLBAR_W, flexShrink: 0, background: '#0d1424', borderRight: '1px solid #1e2d4a',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
        padding: '60px 0 12px', overflowY: 'auto',
        animation: flash ? 'sbflash .35s' : 'none', zIndex: 5,
      }}>
        {SB_CATALOG.map(item => (
          <ToolItem key={item.type} item={item} affordable={affordable(item)} onStart={startDrag(item)} />
        ))}
      </div>

      {/* ── Canvas ── */}
      <div ref={canvasRef} style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
        <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
          <defs>
            <pattern id="sbgrid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#0d1424" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#sbgrid)" />
        </svg>

        {nodes.length === 0 && (
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            fontFamily: '"Share Tech Mono", monospace', color: '#2a3a4a', fontSize: 13,
            letterSpacing: '0.2em', pointerEvents: 'none', textAlign: 'center' }}>
            SANDBOX — перетащи узлы из панели слева
          </div>
        )}

        {/* nodes */}
        {nodes.map(n => {
          const item = SB_BY_TYPE.get(n.type)!
          return (
            <div key={n.id} style={{
              position: 'absolute', left: n.x, top: n.y, width: SB_NODE_SIZE, height: SB_NODE_SIZE,
              transform: 'translate(-50%,-50%)', animation: 'sbpop .2s ease-out',
              border: `2px solid ${item.color}`, borderRadius: 3, background: `${item.color}1a`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: '"Press Start 2P", cursive', fontSize: item.label.length > 2 ? 8 : 14,
              color: item.color, boxShadow: `0 0 8px ${item.color}66`,
            }}>
              {item.label}
              <span style={{ position: 'absolute', bottom: -16, fontFamily: '"Share Tech Mono", monospace',
                fontSize: 9, color: item.color, whiteSpace: 'nowrap' }}>{item.full}</span>
            </div>
          )
        })}

        {/* log */}
        {log.length > 0 && (
          <div style={{ position: 'absolute', bottom: 12, left: 12, zIndex: 10,
            fontFamily: '"Share Tech Mono", monospace', fontSize: 10,
            display: 'flex', flexDirection: 'column', gap: 2, pointerEvents: 'none' }}>
            {log.map((l, i) => (
              <span key={i} style={{ color: l.startsWith('⚠') ? '#ff8c00' : '#00e676', opacity: 1 - i * 0.18 }}>{l}</span>
            ))}
          </div>
        )}
      </div>

      {/* drag preview */}
      {drag && (() => {
        const item = SB_BY_TYPE.get(drag.type)!
        return (
          <div style={{ position: 'fixed', left: drag.x, top: drag.y, width: SB_NODE_SIZE, height: SB_NODE_SIZE,
            transform: 'translate(-50%,-50%)', pointerEvents: 'none', zIndex: 1000, opacity: 0.6,
            border: `2px dashed ${item.color}`, borderRadius: 3, background: `${item.color}22`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: '"Press Start 2P", cursive', fontSize: item.label.length > 2 ? 8 : 14, color: item.color }}>
            {item.label}
          </div>
        )
      })()}
    </div>
  )
}
