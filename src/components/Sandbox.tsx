import React, { useState, useRef, useCallback, useEffect } from 'react'
import { useStore } from '../store'
import {
  SB_CATALOG, SB_BY_TYPE, SbType, SB_NODE_SIZE, SbCatalogItem,
  sbEdgeParams, sbBwWidth, sbBwLabel,
} from '../data/sandbox'

const TOOLBAR_W = 80

export interface SbNode { id: string; type: SbType; x: number; y: number; pinned: boolean; born: number }
export interface SbEdge { id: string; source: string; target: string; bw: number; latency: number; loss: number; born: number }

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
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
        cursor: item.enemy || grey ? 'not-allowed' : 'grab', userSelect: 'none', opacity: grey ? 0.4 : 1 }}
    >
      <div style={{ width: SB_NODE_SIZE, height: SB_NODE_SIZE, borderRadius: 3,
        border: `2px solid ${item.enemy ? '#ff4444' : c}`, background: `${c}1a`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: '"Press Start 2P", cursive', fontSize: item.label.length > 2 ? 8 : 14, color: c,
        boxShadow: hov && !grey ? `0 0 10px ${c}aa` : 'none', transition: 'box-shadow .15s' }}>{item.label}</div>
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
interface CtxMenu { kind: 'node' | 'edge'; id: string; x: number; y: number }

export default function Sandbox() {
  const bits = useStore(s => s.bits)
  const cleanIPs = useStore(s => s.cleanIPs)
  const spend = useStore(s => s.spend)

  const [nodes, setNodes] = useState<SbNode[]>([])
  const [edges, setEdges] = useState<SbEdge[]>([])
  const [drag, setDrag] = useState<DragState | null>(null)         // toolbar drag
  const [selected, setSelected] = useState<string | null>(null)   // node selected for edge creation
  const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null) // for preview line
  const [ctx, setCtx] = useState<CtxMenu | null>(null)
  const [editEdge, setEditEdge] = useState<string | null>(null)
  const [flash, setFlash] = useState(false)
  const [log, setLog] = useState<string[]>([])

  const canvasRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const nodeDragRef = useRef<{ id: string; moved: boolean; offX: number; offY: number } | null>(null)

  const pushLog = useCallback((s: string) => setLog(p => [s, ...p].slice(0, 5)), [])
  const counts = useCallback((t: SbType) => nodes.filter(n => n.type === t).length, [nodes])
  const nodeById = useCallback((id: string) => nodes.find(n => n.id === id), [nodes])

  const affordable = useCallback((item: SbCatalogItem) => {
    if (item.enemy) return false
    if (item.max && counts(item.type) >= item.max) return false
    return bits >= item.bits && cleanIPs >= item.ips
  }, [bits, cleanIPs, counts])

  const toCanvas = useCallback((cx: number, cy: number) => {
    const r = canvasRef.current!.getBoundingClientRect()
    return { x: cx - r.left, y: cy - r.top, r }
  }, [])

  // ── toolbar drag-create ──
  const startDrag = useCallback((item: SbCatalogItem) => (e: React.MouseEvent) => {
    if (!affordable(item)) {
      setFlash(true); setTimeout(() => setFlash(false), 350)
      pushLog(`⚠ Недостаточно средств: ${item.full}`)
      return
    }
    const d: DragState = { type: item.type, x: e.clientX, y: e.clientY }
    dragRef.current = d; setDrag(d)
  }, [affordable, pushLog])

  useEffect(() => {
    if (!drag) return
    const onMove = (e: MouseEvent) => { const d = { ...dragRef.current!, x: e.clientX, y: e.clientY }; dragRef.current = d; setDrag(d) }
    const onUp = (e: MouseEvent) => {
      const d = dragRef.current; dragRef.current = null; setDrag(null)
      if (!d || !canvasRef.current) return
      const { x, y, r } = toCanvas(e.clientX, e.clientY)
      if (x < 8 || y < 8 || x > r.width - 8 || y > r.height - 8) return
      const item = SB_BY_TYPE.get(d.type)!
      if (!spend(item.bits, item.ips)) { setFlash(true); setTimeout(() => setFlash(false), 350); pushLog(`⚠ Недостаточно средств для ${item.full}`); return }
      setNodes(prev => [...prev, { id: newId(d.type), type: d.type, x, y, pinned: false, born: performance.now() }])
      pushLog(`✓ ${item.full} создан (-${item.bits}⬡${item.ips ? ` -${item.ips}◈` : ''})`)
    }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [drag, spend, pushLog, toCanvas])

  // ── node drag-move + click ──
  const onNodeMouseDown = useCallback((id: string) => (e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()
    const n = nodeById(id); if (!n) return
    if (n.pinned) { nodeDragRef.current = { id, moved: false, offX: 0, offY: 0 }; return }
    const { x, y } = toCanvas(e.clientX, e.clientY)
    nodeDragRef.current = { id, moved: false, offX: x - n.x, offY: y - n.y }
  }, [nodeById, toCanvas])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const nd = nodeDragRef.current
      if (nd && !nodeById(nd.id)?.pinned) {
        const { x, y } = toCanvas(e.clientX, e.clientY)
        const dx = x - nd.offX, dy = y - nd.offY
        if (!nd.moved) {
          // threshold to distinguish click from drag
          nd.moved = Math.abs(e.movementX) + Math.abs(e.movementY) > 0 && true
        }
        setNodes(prev => prev.map(p => p.id === nd.id ? { ...p, x: dx, y: dy } : p))
        nd.moved = true
      }
      if (selected) { const { x, y } = toCanvas(e.clientX, e.clientY); setMouse({ x, y }) }
    }
    const onUp = (e: MouseEvent) => {
      const nd = nodeDragRef.current; nodeDragRef.current = null
      if (!nd) return
      if (!nd.moved) handleNodeClick(nd.id)   // it was a click, not a drag
    }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }) // eslint-disable-line react-hooks/exhaustive-deps

  // click logic: select → connect
  const handleNodeClick = useCallback((id: string) => {
    setSelected(prevSel => {
      if (!prevSel) return id                      // select first
      if (prevSel === id) return null              // deselect
      // create edge prevSel → id
      const a = nodeById(prevSel), b = nodeById(id)
      if (a && b && !edges.some(e => (e.source === a.id && e.target === b.id) || (e.source === b.id && e.target === a.id))) {
        const pr = sbEdgeParams(a.type, b.type)
        setEdges(prev => [...prev, { id: newId('e'), source: a.id, target: b.id, ...pr, born: performance.now() }])
        pushLog(`✓ Ребро ${SB_BY_TYPE.get(a.type)!.full} → ${SB_BY_TYPE.get(b.type)!.full}`)
      }
      return null
    })
  }, [nodeById, edges, pushLog])

  // Escape deselect
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setSelected(null); setCtx(null); setEditEdge(null) } }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ── context menu actions ──
  const deleteNode = useCallback((id: string) => {
    setNodes(prev => prev.filter(n => n.id !== id))
    setEdges(prev => prev.filter(e => e.source !== id && e.target !== id))
    setCtx(null); pushLog('🗑 Узел удалён (биты не возвращаются)')
  }, [pushLog])
  const togglePin = useCallback((id: string) => {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, pinned: !n.pinned } : n)); setCtx(null)
  }, [])
  const deleteEdge = useCallback((id: string) => { setEdges(prev => prev.filter(e => e.id !== id)); setCtx(null); setEditEdge(null) }, [])

  const selNode = selected ? nodeById(selected) : null

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', background: '#070b14' }}
      onMouseDown={() => { setSelected(null); setCtx(null) }}>
      {/* ── Toolbar ── */}
      <div onMouseDown={e => e.stopPropagation()} style={{ width: TOOLBAR_W, flexShrink: 0, background: '#0d1424',
        borderRight: '1px solid #1e2d4a', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
        padding: '60px 0 12px', overflowY: 'auto', animation: flash ? 'sbflash .35s' : 'none', zIndex: 5 }}>
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
            <marker id="sbarrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#3a4a6a" />
            </marker>
          </defs>
          <rect width="100%" height="100%" fill="url(#sbgrid)" />

          {/* edges */}
          {edges.map(e => {
            const a = nodeById(e.source), b = nodeById(e.target); if (!a || !b) return null
            const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1
            const ux = dx / len, uy = dy / len, trim = SB_NODE_SIZE / 2 + 6
            const x1 = a.x + ux * trim, y1 = a.y + uy * trim, x2 = b.x - ux * trim, y2 = b.y - uy * trim
            const draw = Math.min((performance.now() - e.born) / 300, 1)
            return (
              <g key={e.id}>
                <line x1={x1} y1={y1} x2={x1 + (x2 - x1) * draw} y2={y1 + (y2 - y1) * draw}
                  stroke="#2a4a6a" strokeWidth={sbBwWidth(e.bw)} markerEnd="url(#sbarrow)" />
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={14}
                  style={{ cursor: 'pointer' }}
                  onDoubleClick={ev => { ev.stopPropagation(); setEditEdge(e.id) }}
                  onContextMenu={ev => { ev.preventDefault(); ev.stopPropagation(); setCtx({ kind: 'edge', id: e.id, x: ev.clientX, y: ev.clientY }) }} />
              </g>
            )
          })}

          {/* preview line while a node is selected */}
          {selNode && mouse && (
            <line x1={selNode.x} y1={selNode.y} x2={mouse.x} y2={mouse.y}
              stroke="#00e676" strokeWidth={1.5} strokeDasharray="5 4" opacity={0.7} />
          )}
        </svg>

        {nodes.length === 0 && (
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            fontFamily: '"Share Tech Mono", monospace', color: '#2a3a4a', fontSize: 13,
            letterSpacing: '0.2em', pointerEvents: 'none', textAlign: 'center' }}>
            SANDBOX — перетащи узлы из панели слева, кликами соединяй
          </div>
        )}

        {/* nodes */}
        {nodes.map(n => {
          const item = SB_BY_TYPE.get(n.type)!
          const isSel = selected === n.id
          return (
            <div key={n.id}
              onMouseDown={onNodeMouseDown(n.id)}
              onContextMenu={ev => { ev.preventDefault(); ev.stopPropagation(); setCtx({ kind: 'node', id: n.id, x: ev.clientX, y: ev.clientY }) }}
              style={{ position: 'absolute', left: n.x, top: n.y, width: SB_NODE_SIZE, height: SB_NODE_SIZE,
                transform: 'translate(-50%,-50%)', animation: performance.now() - n.born < 250 ? 'sbpop .2s ease-out' : 'none',
                border: `2px solid ${isSel ? '#00e676' : item.color}`, borderRadius: 3, background: `${item.color}1a`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: n.pinned ? 'default' : 'grab',
                fontFamily: '"Press Start 2P", cursive', fontSize: item.label.length > 2 ? 8 : 14, color: item.color,
                boxShadow: isSel ? '0 0 12px #00e676aa' : `0 0 8px ${item.color}66` }}>
              {item.label}
              {n.pinned && <span style={{ position: 'absolute', top: -16, fontSize: 11 }}>📌</span>}
              <span style={{ position: 'absolute', bottom: -16, fontFamily: '"Share Tech Mono", monospace',
                fontSize: 9, color: item.color, whiteSpace: 'nowrap', pointerEvents: 'none' }}>{item.full}</span>
            </div>
          )
        })}

        {/* log */}
        {log.length > 0 && (
          <div style={{ position: 'absolute', bottom: 12, left: 12, zIndex: 10,
            fontFamily: '"Share Tech Mono", monospace', fontSize: 10,
            display: 'flex', flexDirection: 'column', gap: 2, pointerEvents: 'none' }}>
            {log.map((l, i) => (
              <span key={i} style={{ color: l.startsWith('⚠') ? '#ff8c00' : l.startsWith('🗑') ? '#ff4444' : '#00e676', opacity: 1 - i * 0.18 }}>{l}</span>
            ))}
          </div>
        )}
      </div>

      {/* context menu */}
      {ctx && (
        <div onMouseDown={e => e.stopPropagation()} style={{ position: 'fixed', left: ctx.x, top: ctx.y, zIndex: 1100,
          background: '#0d1424', border: '1px solid #1e2d4a', fontFamily: '"Share Tech Mono", monospace', fontSize: 11,
          minWidth: 120 }}>
          {ctx.kind === 'node' ? (
            <>
              <CtxRow label="🗑 Удалить" color="#ff4444" onClick={() => deleteNode(ctx.id)} />
              <CtxRow label={nodeById(ctx.id)?.pinned ? '📌 Открепить' : '📌 Закрепить'} color="#ffb300" onClick={() => togglePin(ctx.id)} />
              <CtxRow label="ℹ️ Инфо" color="#00b4ff" onClick={() => { const n = nodeById(ctx.id); pushLog(`ℹ️ ${SB_BY_TYPE.get(n!.type)!.full} — ${n!.pinned ? 'закреплён' : 'свободен'}`); setCtx(null) }} />
            </>
          ) : (
            <>
              <CtxRow label="🗑 Удалить" color="#ff4444" onClick={() => deleteEdge(ctx.id)} />
              <CtxRow label="✏️ Изменить" color="#00b4ff" onClick={() => { setEditEdge(ctx.id); setCtx(null) }} />
            </>
          )}
        </div>
      )}

      {/* edge editor */}
      {editEdge && (() => {
        const e = edges.find(x => x.id === editEdge); if (!e) return null
        const a = nodeById(e.source), b = nodeById(e.target)
        return <EdgeEditor edge={e} aLabel={SB_BY_TYPE.get(a!.type)!.full} bLabel={SB_BY_TYPE.get(b!.type)!.full}
          onSave={(bw, lat, loss) => { setEdges(prev => prev.map(x => x.id === e.id ? { ...x, bw, latency: lat, loss } : x)); setEditEdge(null); pushLog('✓ Ребро обновлено') }}
          onDelete={() => deleteEdge(e.id)} onClose={() => setEditEdge(null)} />
      })()}

      {/* toolbar drag preview */}
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

function CtxRow({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  const [hov, setHov] = useState(false)
  return (
    <div onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ padding: '7px 12px', cursor: 'pointer', color: hov ? color : '#c8d8f0', background: hov ? `${color}18` : 'transparent' }}>
      {label}
    </div>
  )
}

function EdgeEditor({ edge, aLabel, bLabel, onSave, onDelete, onClose }: {
  edge: SbEdge; aLabel: string; bLabel: string
  onSave: (bw: number, lat: number, loss: number) => void; onDelete: () => void; onClose: () => void
}) {
  const [bw, setBw] = useState(String(edge.bw))
  const [lat, setLat] = useState(String(edge.latency))
  const [loss, setLoss] = useState(String(edge.loss))
  const inp: React.CSSProperties = { width: 64, background: '#070b14', border: '1px solid #1e2d4a', color: '#00b4ff',
    fontFamily: '"Share Tech Mono", monospace', fontSize: 11, padding: '2px 6px', outline: 'none' }
  return (
    <div onMouseDown={e => e.stopPropagation()} style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
      zIndex: 1200, background: '#0d1424', border: '1.5px solid #00b4ff', boxShadow: '0 0 20px #00b4ff44',
      padding: '14px 18px', fontFamily: '"Share Tech Mono", monospace', minWidth: 240 }}>
      <div style={{ fontFamily: '"Press Start 2P", cursive', fontSize: 9, color: '#00b4ff', marginBottom: 12 }}>
        {aLabel} → {bLabel}
      </div>
      {[['BW', bw, setBw, 'Мбит/с'], ['Latency', lat, setLat, 'мс'], ['Loss', loss, setLoss, '%']].map(([k, v, set, u]: any) => (
        <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 11, color: '#c8d8f0' }}>
          <span style={{ minWidth: 64, color: '#4a6a8a' }}>{k}:</span>
          <input value={v} onChange={ev => set(ev.target.value)} style={inp} />
          <span style={{ color: '#5a7090' }}>{u}</span>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <EBtn label="Сохранить" color="#00e676" onClick={() => onSave(+bw || 0, +lat || 0, +loss || 0)} />
        <EBtn label="Удалить" color="#ff4444" onClick={onDelete} />
        <EBtn label="✕" color="#5a7090" onClick={onClose} />
      </div>
    </div>
  )
}

function EBtn({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  const [hov, setHov] = useState(false)
  return (
    <button onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ fontFamily: '"Press Start 2P", cursive', fontSize: 8, padding: '6px 10px', cursor: 'pointer',
        background: hov ? `${color}18` : 'transparent', border: `1px solid ${color}`, color }}>
      {label}
    </button>
  )
}
