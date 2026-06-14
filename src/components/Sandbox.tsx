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

export interface UserCfg {
  transport: 'TCP' | 'UDP'
  application: 'HTTP' | 'HTTPS' | 'DNS' | 'DoH'
  vpn: 'none' | 'WireGuard' | 'VLESS' | 'Shadowsocks'
  dest: 'ws-google' | 'ws-news' | 'ws-blocked'
}
const DEFAULT_CFG: UserCfg = { transport: 'UDP', application: 'HTTPS', vpn: 'VLESS', dest: 'ws-google' }

// packet colour by protocol/vpn (block 5)
function pktColor(cfg: UserCfg): string {
  if (cfg.vpn === 'WireGuard') return '#9c6bff'
  if (cfg.vpn === 'VLESS') return '#9c6bff'
  if (cfg.vpn === 'Shadowsocks') return '#6b4bbf'
  if (cfg.application === 'HTTP') return '#ff8c00'
  if (cfg.application === 'DoH') return '#00e676'
  if (cfg.application === 'DNS') return '#ffb300'
  return '#00b4ff' // HTTPS
}

export interface SbPacket { id: number; path: string[]; seg: number; elapsed: number; blocked: boolean; color: string; cfg: UserCfg }
let sbPktId = 0

// adjacency (undirected) from edges
function buildAdj(nodes: SbNode[], edges: SbEdge[]): Map<string, string[]> {
  const adj = new Map<string, string[]>(nodes.map(n => [n.id, []]))
  for (const e of edges) { adj.get(e.source)?.push(e.target); adj.get(e.target)?.push(e.source) }
  return adj
}

// BFS shortest path (by hops) from src to first node satisfying pred
function bfsTo(adj: Map<string, string[]>, src: string, pred: (id: string) => boolean): string[] | null {
  const prev = new Map<string, string>(); const seen = new Set([src]); const q = [src]
  while (q.length) {
    const u = q.shift()!
    if (u !== src && pred(u)) { const path = [u]; let c = u; while (prev.has(c)) { c = prev.get(c)!; path.unshift(c) } return path }
    for (const v of adj.get(u) ?? []) if (!seen.has(v)) { seen.add(v); prev.set(v, u); q.push(v) }
  }
  return null
}

export interface CheckResult { ok: boolean; lines: { icon: string; text: string; color: string }[]; advice: string }

function validateTopology(nodes: SbNode[], edges: SbEdge[]): CheckResult {
  const adj = buildAdj(nodes, edges)
  const users = nodes.filter(n => n.type === 'User')
  const servers = nodes.filter(n => n.type === 'WebServer')
  const dns = nodes.filter(n => n.type === 'DNS')
  const tspu = nodes.filter(n => n.type === 'ТСПУ')
  const vpn = nodes.filter(n => n.type === 'VPN')
  const L: CheckResult['lines'] = []
  const G = '#00e676', R = '#ff4444', A = '#ff8c00'
  let ok = true
  L.push(users.length ? { icon: '✓', text: `User найден (${users.length} шт.)`, color: G } : (ok = false, { icon: '✗', text: 'Нет ни одного User!', color: R }))
  L.push(servers.length ? { icon: '✓', text: `WebServer найден (${servers.length} шт.)`, color: G } : (ok = false, { icon: '✗', text: 'Нет WebServer!', color: R }))
  // path
  let pathFound = false; let pathViaTspu = false
  for (const u of users) { const path = bfsTo(adj, u.id, id => nodes.find(n => n.id === id)?.type === 'WebServer'); if (path) { pathFound = true; if (path.some(id => nodes.find(n => n.id === id)?.type === 'ТСПУ')) pathViaTspu = true } }
  L.push(pathFound ? { icon: '✓', text: 'Путь до WebServer существует', color: G } : (ok = false, { icon: '✗', text: 'Нет пути User → WebServer', color: R }))
  // isolated
  const connected = new Set<string>(); if (nodes.length) { const st = [nodes[0].id]; connected.add(nodes[0].id); while (st.length) { const u = st.pop()!; for (const v of adj.get(u) ?? []) if (!connected.has(v)) { connected.add(v); st.push(v) } } }
  const isolated = nodes.filter(n => !connected.has(n.id))
  L.push(isolated.length === 0 ? { icon: '✓', text: 'Изолированных узлов нет', color: G } : { icon: '⚠', text: `Изолированных узлов: ${isolated.length}`, color: A })
  if (pathViaTspu) {
    const bypass = vpn.length > 0
    L.push({ icon: '⚠', text: 'ТСПУ на пути блокирует трафик', color: A })
    L.push(bypass ? { icon: '✓', text: 'VPN обходит ТСПУ', color: G } : { icon: '✗', text: 'VPN не настроен для обхода ТСПУ', color: R })
  }
  if (dns.length === 0) L.push({ icon: '✗', text: 'DNS сервер не настроен!', color: R })
  const advice = !servers.length ? 'Добавь WebServer как цель трафика'
    : !pathFound ? 'Соедини User с WebServer через Switch/Router'
    : isolated.length ? 'Подключи изолированные узлы рёбрами'
    : pathViaTspu && !vpn.length ? 'Добавь VPN параллельно ТСПУ для обхода'
    : dns.length === 0 ? 'Добавь DNS сервер между User и Router'
    : 'Топология готова — нажми RUN'
  return { ok, lines: L, advice }
}

interface SaveSlot { name: string; ts: number; nodes: SbNode[]; edges: SbEdge[]; bits: number }
const SLOT_KEY = (n: number) => `netwar_sandbox_save_${n}`

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
  const addCleanIPs = useStore(s => s.addCleanIPs)

  const [nodes, setNodes] = useState<SbNode[]>([])
  const [edges, setEdges] = useState<SbEdge[]>([])
  const [drag, setDrag] = useState<DragState | null>(null)         // toolbar drag
  const [selected, setSelected] = useState<string | null>(null)   // node selected for edge creation
  const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null) // for preview line
  const [ctx, setCtx] = useState<CtxMenu | null>(null)
  const [editEdge, setEditEdge] = useState<string | null>(null)
  const [flash, setFlash] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [running, setRunning] = useState(false)
  const [tick, setTick] = useState(0)
  const [confirmClear, setConfirmClear] = useState(false)
  const [check, setCheck] = useState<CheckResult | null>(null)
  const [loadOpen, setLoadOpen] = useState(false)
  const [exploding, setExploding] = useState(false)
  const [shopOpen, setShopOpen] = useState(false)
  const [effects, setEffects] = useState<{ name: string; until: number; dur: number }[]>([])
  const [userCfg, setUserCfg] = useState<Record<string, UserCfg>>({})
  const [userPanel, setUserPanel] = useState<string | null>(null)
  const userCfgRef = useRef<Record<string, UserCfg>>({})
  useEffect(() => { userCfgRef.current = userCfg }, [userCfg])
  const wgStart = useRef<number>(0)  // WireGuard detection timer

  const pktRef = useRef<SbPacket[]>([])
  const runRef = useRef(false)
  const rafRef = useRef(0)
  const lastSpawn = useRef(0)
  const lastFrame = useRef(0)
  const nodesRef = useRef<SbNode[]>([])
  const edgesRef = useRef<SbEdge[]>([])

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
      if (!prevSel) {
        if (nodeById(id)?.type === 'User') setUserPanel(id)   // open settings (block 5)
        return id                                  // select first
      }
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

  // tick shop effect timers
  useEffect(() => {
    if (!effects.length) return
    const iv = setInterval(() => setEffects(prev => prev.filter(e => e.until > Date.now())), 500)
    return () => clearInterval(iv)
  }, [effects.length])

  // keep refs in sync for the sim loop
  useEffect(() => { nodesRef.current = nodes }, [nodes])
  useEffect(() => { edgesRef.current = edges }, [edges])

  // ── RUN / STOP ──
  const startRun = useCallback(() => {
    const adj = buildAdj(nodes, edges)
    const users = nodes.filter(n => n.type === 'User')
    const anyPath = users.some(u => bfsTo(adj, u.id, id => nodes.find(n => n.id === id)?.type === 'WebServer'))
    if (!anyPath) { pushLog('⚠ ОШИБКА: нет маршрута от User до WebServer'); return }
    runRef.current = true; setRunning(true); wgStart.current = performance.now(); logThrottle.current.clear(); pushLog('▶ Симуляция запущена')
  }, [nodes, edges, pushLog])

  const stopRun = useCallback(() => {
    runRef.current = false; setRunning(false); pktRef.current = []; setTick(t => t + 1); pushLog('⏹ Симуляция остановлена')
  }, [pushLog])

  const logThrottle = useRef<Map<string, number>>(new Map())
  useEffect(() => {
    const logOnce = (msg: string) => {
      const t = logThrottle.current.get(msg) ?? 0
      const n = performance.now()
      if (n - t > 4000) { logThrottle.current.set(msg, n); pushLog(msg) }
    }
    const loop = (now: number) => {
      const dt = lastFrame.current ? now - lastFrame.current : 16; lastFrame.current = now
      if (runRef.current) {
        const ns = nodesRef.current, es = edgesRef.current
        const adj = buildAdj(ns, es)
        const users = ns.filter(n => n.type === 'User')
        const hasVpn = ns.some(n => n.type === 'VPN')
        if (now - lastSpawn.current > 700 && pktRef.current.length < 20 && users.length) {
          const u = users[Math.floor(Math.random() * users.length)]
          const target = Math.random() < 0.7 ? 'WebServer' : 'DNS'
          const path = bfsTo(adj, u.id, id => ns.find(n => n.id === id)?.type === target)
            ?? bfsTo(adj, u.id, id => ns.find(n => n.id === id)?.type === 'WebServer')
          if (path && path.length > 1) {
            const cfg = userCfgRef.current[u.id] ?? DEFAULT_CFG
            pktRef.current.push({ id: sbPktId++, path, seg: 0, elapsed: 0, blocked: false, color: pktColor(cfg), cfg })
          }
          lastSpawn.current = now
        }
        const survivors: SbPacket[] = []
        for (const pk of pktRef.current) {
          const a = pk.path[pk.seg], b = pk.path[pk.seg + 1]
          if (!b) continue
          // protocol-aware DPI at ТСПУ (block 5)
          const nb = ns.find(n => n.id === b)
          if (nb?.type === 'ТСПУ') {
            const c = pk.cfg
            let blocked = false
            if (c.vpn === 'WireGuard') {
              // detectable ~30s after run start
              if (wgStart.current && now - wgStart.current > 30000) { blocked = true; logOnce('DPI: WireGuard сигнатура обнаружена') }
            } else if (c.vpn === 'VLESS') {
              logOnce('VLESS маскируется под HTTPS — ТСПУ слеп')
            } else if (c.vpn === 'Shadowsocks') {
              if (Math.random() < 0.5) { blocked = true; logOnce('Shadowsocks: обфускация частично эффективна') }
            } else if (c.application === 'HTTP') {
              logOnce('ТСПУ читает HTTP открыто')
              if (c.dest === 'ws-blocked') blocked = true
            } else if (c.application === 'HTTPS') {
              if (c.dest === 'ws-blocked') { blocked = true; logOnce('ТСПУ видит SNI: blocked.com') }
            } else if (c.application === 'DoH') {
              logOnce('DoH: DNS зашифрован — ТСПУ слеп')
            } else if (c.application === 'DNS') {
              logOnce('ТСПУ видит DNS-запрос')
            }
            if (blocked) continue   // dropped at ТСПУ
          }
          pk.elapsed += dt
          if (pk.elapsed >= 600) { pk.seg++; pk.elapsed = 0; if (pk.seg >= pk.path.length - 1) continue }
          survivors.push(pk)
        }
        pktRef.current = survivors
        setTick(t => (t + 1) % 1000000)
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [pushLog])

  const doClear = useCallback(() => {
    setExploding(true)
    setTimeout(() => { setNodes([]); setEdges([]); pktRef.current = []; runRef.current = false; setRunning(false); setExploding(false); pushLog('🗑 Холст очищен') }, 500)
    setConfirmClear(false)
  }, [pushLog])

  const doSave = useCallback((slot: number) => {
    const data: SaveSlot = { name: `${nodes.length} узлов`, ts: Date.now(), nodes, edges, bits }
    localStorage.setItem(SLOT_KEY(slot), JSON.stringify(data)); pushLog(`💾 Сохранено в слот ${slot}`)
  }, [nodes, edges, bits, pushLog])

  const doLoad = useCallback((slot: number) => {
    const raw = localStorage.getItem(SLOT_KEY(slot)); if (!raw) return
    try { const d: SaveSlot = JSON.parse(raw); setNodes(d.nodes); setEdges(d.edges); pushLog(`📂 Загружено из слота ${slot}`) } catch { pushLog('⚠ Ошибка загрузки') }
    setLoadOpen(false)
  }, [pushLog])

  const selNode = selected ? nodeById(selected) : null
  void tick // re-render trigger

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

          {/* running packets */}
          {running && pktRef.current.map(pk => {
            const a = nodeById(pk.path[pk.seg]), b = nodeById(pk.path[pk.seg + 1]); if (!a || !b) return null
            const t = Math.min(pk.elapsed / 600, 1)
            const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t
            return <rect key={pk.id} x={x - 3} y={y - 3} width={6} height={6} fill={pk.color}
              style={{ filter: `drop-shadow(0 0 4px ${pk.color})` }} />
          })}
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
                transform: 'translate(-50%,-50%)', animation: exploding ? 'sbfade .5s ease-in forwards' : (performance.now() - n.born < 250 ? 'sbpop .2s ease-out' : 'none'),
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

      {/* User settings panel (block 5) */}
      {userPanel && nodeById(userPanel)?.type === 'User' && (
        <UserSettings
          id={userPanel}
          cfg={userCfg[userPanel] ?? DEFAULT_CFG}
          onApply={(c) => { setUserCfg(prev => ({ ...prev, [userPanel]: c })); pushLog('✓ Настройки User применены'); setUserPanel(null) }}
          onClose={() => setUserPanel(null)} />
      )}

      {/* bottom control panel */}
      <div onMouseDown={e => e.stopPropagation()} style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
        zIndex: 40, display: 'flex', gap: 6, background: '#070b14', border: '1px solid #1e2d4a', padding: '4px 10px' }}>
        <SBtn label={running ? '⏸ ПАУЗА' : '▶ RUN'} color="#00e676" onClick={() => running ? stopRun() : startRun()} />
        <SBtn label="⏹ STOP" color="#ff8c00" onClick={stopRun} />
        <SBtn label="🗑 CLEAR" color="#ff4444" onClick={() => setConfirmClear(true)} />
        <SBtn label="✓ CHECK" color="#00b4ff" onClick={() => setCheck(validateTopology(nodes, edges))} />
        <SBtn label="💾 SAVE" color="#9c6bff" onClick={() => doSave(1)} />
        <SBtn label="📂 LOAD" color="#ffb300" onClick={() => setLoadOpen(true)} />
        <SBtn label="⬡ SHOP" color="#ffb300" onClick={() => setShopOpen(true)} />
      </div>

      {/* active effect timers */}
      {effects.length > 0 && (
        <div style={{ position: 'absolute', bottom: 64, left: '50%', transform: 'translateX(-50%)', zIndex: 40,
          fontFamily: '"Share Tech Mono", monospace', fontSize: 10, color: '#ffb300', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {effects.map((e, i) => {
            const left = Math.max(0, Math.ceil((e.until - Date.now()) / 1000))
            const filled = Math.max(0, Math.min(12, Math.round((left / e.dur) * 12)))
            return <span key={i}>{e.name}: {left}с {'█'.repeat(filled)}{'░'.repeat(12 - filled)}</span>
          })}
        </div>
      )}

      {/* SHOP */}
      {shopOpen && (
        <Modal onClose={() => setShopOpen(false)}>
          <div style={{ fontFamily: '"Press Start 2P", cursive', fontSize: 10, color: '#ffb300', marginBottom: 14 }}>⬡ МАГАЗИН АПГРЕЙДОВ</div>
          {[
            { name: 'Апгрейд каналов ×2', desc: 'Все рёбра: BW ×2 на 60с', cost: '500 ⬡', buy: () => spend(500), dur: 60 },
            { name: 'Обфускация трафика', desc: 'ТСПУ не видит протокол 30с', cost: '1 ◈', buy: () => spend(0, 1), dur: 30 },
            { name: 'DNS ускорение', desc: 'DNS RESOLVED +3 (120с)', cost: '300 ⬡', buy: () => spend(300), dur: 120 },
            { name: 'CDN boost', desc: 'CDN доход ×3 (60с)', cost: '800 ⬡', buy: () => spend(800), dur: 60 },
            { name: 'Чистые IP × 3', desc: 'Добавляет 3 чистых IP', cost: '2000 ⬡', buy: () => { if (spend(2000)) { addCleanIPs(3); return true } return false }, dur: 0 },
          ].map(item => (
            <div key={item.name} style={{ borderTop: '1px solid #1e2d4a', padding: '10px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: '#c8d8f0' }}>{item.name}</div>
                <div style={{ fontSize: 9, color: '#5a7090' }}>{item.desc}</div>
                <div style={{ fontSize: 10, color: '#ffb300', marginTop: 2 }}>Цена: {item.cost}</div>
              </div>
              <SBtn label="КУПИТЬ" color="#00e676" onClick={() => {
                if (item.buy()) { pushLog(`✓ Куплено: ${item.name}`); if (item.dur) setEffects(prev => [...prev.filter(e => e.name !== item.name), { name: item.name, until: Date.now() + item.dur * 1000, dur: item.dur }]) }
                else pushLog(`⚠ Недостаточно средств: ${item.name}`)
              }} />
            </div>
          ))}
          <div style={{ marginTop: 12 }}><SBtn label="Закрыть" color="#5a7090" onClick={() => setShopOpen(false)} /></div>
        </Modal>
      )}

      {/* CLEAR confirm */}
      {confirmClear && (
        <Modal onClose={() => setConfirmClear(false)}>
          <div style={{ color: '#c8d8f0', fontSize: 12, lineHeight: 1.7, marginBottom: 14 }}>
            Очистить холст? Все узлы будут удалены.<br />Биты не возвращаются.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <SBtn label="Да, очистить" color="#ff4444" onClick={doClear} />
            <SBtn label="Отмена" color="#5a7090" onClick={() => setConfirmClear(false)} />
          </div>
        </Modal>
      )}

      {/* CHECK result */}
      {check && (
        <Modal onClose={() => setCheck(null)}>
          <div style={{ fontFamily: '"Press Start 2P", cursive', fontSize: 9, color: '#00b4ff', marginBottom: 12 }}>ПРОВЕРКА ТОПОЛОГИИ</div>
          {check.lines.map((l, i) => (
            <div key={i} style={{ fontSize: 11, color: l.color, lineHeight: 1.8 }}>{l.icon} {l.text}</div>
          ))}
          <div style={{ fontSize: 11, color: '#ffb300', marginTop: 12, lineHeight: 1.6, borderLeft: '2px solid #ffb300', paddingLeft: 8 }}>
            РЕКОМЕНДАЦИЯ: {check.advice}
          </div>
          <div style={{ marginTop: 14 }}><SBtn label="Закрыть" color="#5a7090" onClick={() => setCheck(null)} /></div>
        </Modal>
      )}

      {/* LOAD slots */}
      {loadOpen && (
        <Modal onClose={() => setLoadOpen(false)}>
          <div style={{ fontFamily: '"Press Start 2P", cursive', fontSize: 9, color: '#ffb300', marginBottom: 12 }}>ЗАГРУЗИТЬ СОХРАНЕНИЕ</div>
          {[1, 2, 3].map(slot => {
            const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(SLOT_KEY(slot)) : null
            let info = 'пусто'; let has = false
            if (raw) { try { const d: SaveSlot = JSON.parse(raw); info = `"${d.name}" — ${new Date(d.ts).toLocaleTimeString().slice(0, 5)}`; has = true } catch { /* */ } }
            return (
              <div key={slot} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8, fontSize: 11, color: '#c8d8f0' }}>
                <span>Слот {slot}: {info}</span>
                {has ? <SBtn label={`Загр.${slot}`} color="#00e676" onClick={() => doLoad(slot)} />
                     : <span style={{ color: '#3a4a5a', fontSize: 10 }}>—</span>}
              </div>
            )
          })}
          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            <SBtn label="Save→2" color="#9c6bff" onClick={() => doSave(2)} />
            <SBtn label="Save→3" color="#9c6bff" onClick={() => doSave(3)} />
            <SBtn label="Отмена" color="#5a7090" onClick={() => setLoadOpen(false)} />
          </div>
        </Modal>
      )}

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

function UserSettings({ id, cfg, onApply, onClose }: {
  id: string; cfg: UserCfg; onApply: (c: UserCfg) => void; onClose: () => void
}) {
  const [c, setC] = useState<UserCfg>(cfg)
  const Radio = <K extends keyof UserCfg>(key: K, val: UserCfg[K], label: string, hint?: string) => (
    <div onClick={() => setC(p => ({ ...p, [key]: val }))}
      style={{ cursor: 'pointer', display: 'flex', gap: 8, padding: '4px 0', alignItems: 'flex-start' }}>
      <span style={{ color: c[key] === val ? '#00e676' : '#5a7090' }}>{c[key] === val ? '●' : '○'}</span>
      <div>
        <span style={{ color: c[key] === val ? '#c8d8f0' : '#7a9ab8', fontSize: 11 }}>{label}</span>
        {hint && <div style={{ color: '#4a6a8a', fontSize: 9, lineHeight: 1.4 }}>{hint}</div>}
      </div>
    </div>
  )
  const Hdr = (t: string) => <div style={{ fontFamily: '"Press Start 2P", cursive', fontSize: 7, color: '#4a6a8a', margin: '12px 0 4px', letterSpacing: '0.08em' }}>{t}</div>
  return (
    <div onMouseDown={e => e.stopPropagation()} style={{ position: 'fixed', top: 0, right: 0, width: 300, height: '100vh',
      background: '#0d1424', borderLeft: '2px solid #f0f4ff', boxShadow: '-8px 0 24px #f0f4ff11', zIndex: 1150,
      overflowY: 'auto', padding: '16px 18px', fontFamily: '"Share Tech Mono", monospace' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontFamily: '"Press Start 2P", cursive', fontSize: 10, color: '#f0f4ff' }}>[U] {id}</span>
        <button onClick={onClose} style={{ background: 'none', border: '1px solid #1e2d4a', color: '#5a7090', width: 24, height: 24, cursor: 'pointer' }}>✕</button>
      </div>
      <div style={{ fontSize: 10, color: '#4a6a8a', letterSpacing: '0.1em' }}>ИСХОДЯЩИЙ ТРАФИК</div>
      {Hdr('ТРАНСПОРТ')}
      {Radio('transport', 'TCP', 'TCP — надёжно, с подтверждением')}
      {Radio('transport', 'UDP', 'UDP — быстро, без подтверждения')}
      {Hdr('ПРИКЛАДНОЙ')}
      {Radio('application', 'HTTP', 'HTTP — порт 80', 'ТСПУ видит содержимое!')}
      {Radio('application', 'HTTPS', 'HTTPS — порт 443', 'ТСПУ видит только SNI')}
      {Radio('application', 'DNS', 'DNS — порт 53')}
      {Radio('application', 'DoH', 'DoH — DNS over HTTPS', 'ТСПУ не видит DNS!')}
      {Hdr('VPN ПРОТОКОЛ')}
      {Radio('vpn', 'none', 'Нет VPN')}
      {Radio('vpn', 'WireGuard', 'WireGuard', 'быстрый, легко блокируется')}
      {Radio('vpn', 'VLESS', 'VLESS', 'маскируется под HTTPS')}
      {Radio('vpn', 'Shadowsocks', 'Shadowsocks', 'обфускация трафика')}
      {Hdr('НАЗНАЧЕНИЕ')}
      {Radio('dest', 'ws-google', 'google.com')}
      {Radio('dest', 'ws-news', 'news.com')}
      {Radio('dest', 'ws-blocked', 'blocked.com ⚠ заблокирован')}
      <div style={{ marginTop: 16 }}>
        <SBtn label="Применить настройки" color="#00e676" onClick={() => onApply(c)} />
      </div>
    </div>
  )
}

function SBtn({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  const [hov, setHov] = useState(false)
  return (
    <button onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ fontFamily: '"Press Start 2P", cursive', fontSize: 9, padding: '8px 12px', cursor: 'pointer',
        background: hov ? `${color}18` : '#0d1424', border: `1.5px solid ${hov ? color : '#1e2d4a'}`,
        color: hov ? color : '#7a9ab8', whiteSpace: 'nowrap', transition: 'all .15s' }}>{label}</button>
  )
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, background: '#070b1499', zIndex: 1300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onMouseDown={e => e.stopPropagation()} style={{ background: '#0d1424', border: '1.5px solid #1e2d4a',
        boxShadow: '0 0 24px #00000088', padding: '18px 22px', fontFamily: '"Share Tech Mono", monospace', minWidth: 280, maxWidth: 420 }}>
        {children}
      </div>
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
