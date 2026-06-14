import React, { useState, useRef, useCallback, useEffect } from 'react'
import { useStore } from '../store'
import {
  SB_CATALOG, SB_BY_TYPE, SbType, SB_NODE_SIZE, SbCatalogItem,
  sbEdgeParams, sbBwWidth, sbBwLabel, SB_UPKEEP, edgeUpkeep, TOOL_INFO,
} from '../data/sandbox'
import {
  buildAdj, bfsToType, findPath, validateTopology, getConnectionHint,
  isTspuOnPath, isVpnBypassingTspu, ValidationResult,
} from '../data/topologyRules'

const TOOLBAR_W = 80

export interface SbNode { id: string; type: SbType; x: number; y: number; pinned: boolean; born: number; disabled?: boolean }
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

// short plaque text shown above a freshly-created edge (block 4, point 4)
function edgePlaque(a: SbType, b: SbType): string {
  const has = (x: SbType, y: SbType) => (a === x && b === y) || (a === y && b === x)
  if (has('Router', 'ТСПУ')) return 'Трафик через DPI — ТСПУ всё видит'
  if (has('Router', 'VPN'))  return 'Туннель — ТСПУ видит только IP VPN'
  if (has('User', 'Switch'))  return 'LAN — домашняя сеть'
  if (has('ТСПУ', 'Firewall')) return 'Через фильтрацию DPI'
  if (has('VPN', 'Firewall'))  return 'Обход ТСПУ — зашифровано'
  return ''
}

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

interface SaveSlot { name: string; ts: number; nodes: SbNode[]; edges: SbEdge[]; bits: number }
const SLOT_KEY = (n: number) => `netwar_sandbox_save_${n}`

// ─── Toolbar item ─────────────────────────────────────────────────────────────

function ToolItem({ item, affordable, onStart }: {
  item: SbCatalogItem; affordable: boolean; onStart: (e: React.MouseEvent) => void
}) {
  const [hov, setHov] = useState(false)
  const [cardTop, setCardTop] = useState(0)
  const grey = !affordable && !item.enemy
  const c = item.color
  const info = TOOL_INFO[item.type]
  const priceStr = item.enemy ? 'ВРАГ'
    : item.bits === 0 ? 'free'
    : `${item.bits}⬡${item.ips ? ` +${item.ips}◈` : ''}`
  return (
    <div
      onMouseDown={item.enemy || grey ? undefined : onStart}
      onMouseEnter={e => { setHov(true); setCardTop(e.currentTarget.getBoundingClientRect().top) }}
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
      {/* educational hover card to the right of the toolbar */}
      {hov && (
        <div style={{ position: 'fixed', left: 88, top: Math.min(cardTop, window.innerHeight - 170), zIndex: 1200,
          width: 280, background: '#0d1424', border: `1.5px solid ${c}`, boxShadow: `0 0 14px ${c}44`,
          padding: '10px 14px', pointerEvents: 'none', fontFamily: '"Share Tech Mono", monospace' }}>
          <div style={{ fontFamily: '"Press Start 2P", cursive', fontSize: 9, color: c, marginBottom: 8 }}>
            [{item.label}] {item.full.toUpperCase()}
          </div>
          {[['Уровень', info.level], ['Функция', info.func], ['Стоимость', item.enemy ? '— враг' : priceStr],
            ['Содержание', `-${SB_UPKEEP[item.type]} ⬡/сек`], ['Протоколы', info.protocols]].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', gap: 6, fontSize: 10, lineHeight: '1.7' }}>
              <span style={{ color: '#4a6a8a', minWidth: 78, flexShrink: 0 }}>{k}:</span>
              <span style={{ color: '#c8d8f0' }}>{v}</span>
            </div>
          ))}
          <div style={{ fontSize: 9, color: '#ffb300', marginTop: 6, lineHeight: 1.4 }}>{info.note}</div>
        </div>
      )}
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
  const earnPacket = useStore(s => s.earnPacket)
  const chargeUpkeep = useStore(s => s.chargeUpkeep)
  const setRates = useStore(s => s.setRates)
  const mode = useStore(s => s.mode)
  const earnPacketRef = useRef(earnPacket)
  useEffect(() => { earnPacketRef.current = earnPacket }, [earnPacket])
  const incomeAccum = useRef(0)
  const negativeSince = useRef(0)
  const [costFloat, setCostFloat] = useState<{ id: number; x: number; y: number; amt: number } | null>(null)

  // ── git save system (block 1) ──
  const repository = useStore(s => s.repository)
  const asLevel = useStore(s => s.asLevel)
  const gitCommit = useStore(s => s.gitCommit)
  const gitBranch = useStore(s => s.gitBranch)
  const gitCheckout = useStore(s => s.gitCheckout)
  const gitMerge = useStore(s => s.gitMerge)
  const [termInput, setTermInput] = useState('')
  const [termOut, setTermOut] = useState<string[]>(['NetWars shell — введи "help" для списка команд'])
  const [mergeFlash, setMergeFlash] = useState(false)
  const onMain = repository.currentBranch === 'main'

  const [nodes, setNodes] = useState<SbNode[]>([])
  const [edges, setEdges] = useState<SbEdge[]>([])
  const [drag, setDrag] = useState<DragState | null>(null)         // toolbar drag
  const [selected, setSelected] = useState<string | null>(null)   // node selected for edge creation
  const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null) // for preview line
  const [hoverNode, setHoverNode] = useState<string | null>(null) // node under cursor (for hint badge)
  const [hoverEdge, setHoverEdge] = useState<string | null>(null) // edge under cursor (violation highlight)
  const [toast, setToast] = useState<{ msg: string; until: number } | null>(null)
  const [edgePlaqueState, setEdgePlaque] = useState<{ x: number; y: number; text: string; until: number } | null>(null)
  const [ctx, setCtx] = useState<CtxMenu | null>(null)
  const [editEdge, setEditEdge] = useState<string | null>(null)
  const [flash, setFlash] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [running, setRunning] = useState(false)
  const [tick, setTick] = useState(0)
  const [confirmClear, setConfirmClear] = useState(false)
  const [check, setCheck] = useState<ValidationResult | null>(null)
  const [loadOpen, setLoadOpen] = useState(false)
  const [exploding, setExploding] = useState(false)
  const [shopOpen, setShopOpen] = useState(false)
  const [effects, setEffects] = useState<{ name: string; until: number; dur: number }[]>([])
  const [userCfg, setUserCfg] = useState<Record<string, UserCfg>>({})
  const [userPanel, setUserPanel] = useState<string | null>(null)
  const [mission, setMission] = useState<number | null>(null)
  const [missionIntro, setMissionIntro] = useState(false)
  const [missionsDone, setMissionsDone] = useState<number[]>(() => {
    try { return JSON.parse(localStorage.getItem('netwar_missions') ?? '[]') } catch { return [] }
  })
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
      // create edge prevSel → id — validated via topologyRules
      const a = nodeById(prevSel), b = nodeById(id)
      if (a && b) {
        const dup = edges.some(e => (e.source === a.id && e.target === b.id) || (e.source === b.id && e.target === a.id))
        if (dup) return null
        const hint = getConnectionHint(a.type, b.type)
        if (hint.level === 'error') {
          setToast({ msg: `${hint.message} Добавь Router/Switch между ними.`, until: Date.now() + 3000 })
          pushLog('Отменено — соединение запрещено')
          return null   // do not create the edge
        }
        const pr = sbEdgeParams(a.type, b.type)
        setEdges(prev => [...prev, { id: newId('e'), source: a.id, target: b.id, ...pr, born: performance.now() }])
        if (hint.level === 'warn') pushLog(`⚠ Ребро создано: ${hint.message}`)
        else pushLog(`✓ Ребро ${SB_BY_TYPE.get(a.type)!.full} → ${SB_BY_TYPE.get(b.type)!.full}`)
        const plaque = edgePlaque(a.type, b.type)
        if (plaque) setEdgePlaque({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, text: plaque, until: Date.now() + 2000 })
      }
      return null
    })
  }, [nodeById, edges, pushLog])

  // auto-clear error toast
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t) }, [toast])
  // auto-clear edge plaque
  useEffect(() => { if (!edgePlaqueState) return; const t = setTimeout(() => setEdgePlaque(null), 2000); return () => clearTimeout(t) }, [edgePlaqueState])

  // Escape deselect
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (selected) pushLog('Отменено'); setSelected(null); setCtx(null); setEditEdge(null) } }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  }, [selected, pushLog])

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

  // brief animation ticker so SVG edge draw/flash animates after add/remove
  useEffect(() => {
    let raf = 0; const start = performance.now()
    const t = () => { setTick(v => v + 1); if (performance.now() - start < 600) raf = requestAnimationFrame(t) }
    raf = requestAnimationFrame(t)
    return () => cancelAnimationFrame(raf)
  }, [nodes.length, edges.length])

  // keep refs in sync for the sim loop
  useEffect(() => { nodesRef.current = nodes }, [nodes])
  useEffect(() => { edgesRef.current = edges }, [edges])

  // ── per-second economy: upkeep (always) + income rate (while RUN) ──
  useEffect(() => {
    const iv = setInterval(() => {
      if (mode !== 'sandbox') return
      const ns = nodesRef.current, es = edgesRef.current
      const upkeep = ns.reduce((s, n) => s + (n.disabled ? 0 : SB_UPKEEP[n.type]), 0)
                   + es.reduce((s, e) => s + edgeUpkeep(e.bw), 0)
      const income = incomeAccum.current; incomeAccum.current = 0
      if (upkeep > 0) chargeUpkeep(upkeep)
      setRates(upkeep, income)
      // negative-balance shutdown after 30s
      if (useStore.getState().bits < 0) {
        if (!negativeSince.current) negativeSince.current = Date.now()
        else if (Date.now() - negativeSince.current > 30000) {
          const candidates = ns.filter(n => !n.disabled && n.type !== 'User')
          if (candidates.length) {
            const victim = candidates[Math.floor(Math.random() * candidates.length)]
            setNodes(prev => prev.map(p => p.id === victim.id ? { ...p, disabled: true } : p))
            pushLog(`💸 ${SB_BY_TYPE.get(victim.type)!.full} отключён — нет средств на содержание`)
            negativeSince.current = Date.now()
          }
        }
      } else negativeSince.current = 0
    }, 1000)
    return () => clearInterval(iv)
  }, [mode, chargeUpkeep, setRates, pushLog])

  // ── cost float over the most expensive node every 5s ──
  useEffect(() => {
    const iv = setInterval(() => {
      if (mode !== 'sandbox') return
      const ns = nodesRef.current
      let max: SbNode | null = null; let maxCost = 0
      for (const n of ns) { const c = SB_UPKEEP[n.type]; if (c > maxCost) { maxCost = c; max = n } }
      if (max && maxCost > 0) { setCostFloat({ id: Date.now(), x: max.x, y: max.y, amt: maxCost }); setTimeout(() => setCostFloat(null), 1000) }
    }, 5000)
    return () => clearInterval(iv)
  }, [mode])

  // ── RUN / STOP ──
  const startRun = useCallback(() => {
    const users = nodes.filter(n => n.type === 'User')
    const anyPath = users.some(u => bfsToType(nodes, edges, u.id, 'WebServer'))
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
        const users = ns.filter(n => n.type === 'User')
        const hasVpn = ns.some(n => n.type === 'VPN')
        if (now - lastSpawn.current > 700 && pktRef.current.length < 20 && users.length) {
          const u = users[Math.floor(Math.random() * users.length)]
          const target: SbType = Math.random() < 0.7 ? 'WebServer' : 'DNS'
          const path = bfsToType(ns, es, u.id, target) ?? bfsToType(ns, es, u.id, 'WebServer')
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
          if (nb?.disabled) continue   // disabled node drops traffic (point 3)
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
          if (pk.elapsed >= 600) {
            pk.seg++; pk.elapsed = 0
            if (pk.seg >= pk.path.length - 1) {
              // delivered → earn bits (income only while RUN)
              const c = pk.cfg
              const kind = c.vpn !== 'none' ? 'tunnel' : c.application === 'DNS' || c.application === 'DoH' ? 'dns' : c.transport === 'UDP' ? 'udp' : 'tcp'
              earnPacketRef.current(kind); incomeAccum.current += (kind === 'tunnel' ? 8 : kind === 'dns' ? 2 : kind === 'udp' ? 3 : 5)
              continue
            }
          }
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

  // ── terminal command handler (block 1) ──
  const termPrint = useCallback((...lines: string[]) => setTermOut(p => [...p, ...lines].slice(-40)), [])
  const runCmd = useCallback((raw: string) => {
    const line = raw.trim()
    termPrint(`netwar@sandbox:~/${repository.currentBranch} $ ${line}`)
    if (!line) return
    const m = line.match(/^(\w+)\s*(.*)$/); const cmd = m?.[1]?.toLowerCase(); const arg = m?.[2]?.trim() ?? ''
    const buildState = () => ({ nodes, edges, economy: { bits: Math.round(bits), cleanIPs, asLevel }, stats: { delivered: 0, blocked: 0 } })
    if (cmd === 'save') {
      const msg = arg.replace(/^["']|["']$/g, '') || 'без описания'
      const hash = gitCommit(msg, buildState()); termPrint(`Committed ${hash} '${msg}'`)
    } else if (cmd === 'branch') {
      if (!arg) { termPrint('usage: branch <имя>'); return }
      gitBranch(arg); termPrint(`Switched to new branch '${arg}'`)
    } else if (cmd === 'checkout') {
      const c = repository.commits.find(x => x.hash === arg)
      if (!c) { termPrint(`commit ${arg} не найден`); return }
      gitCheckout(arg); setNodes(c.state.nodes as SbNode[]); setEdges(c.state.edges as SbEdge[]); termPrint(`HEAD → ${arg} (узлы восстановлены)`)
    } else if (cmd === 'merge') {
      if (!arg) { termPrint('usage: merge <ветка>'); return }
      const res = gitMerge(arg)
      if (res.ok) { termPrint(res.msg); setMergeFlash(true); setTimeout(() => setMergeFlash(false), 2300) }
      else termPrint(`⚠ CONFLICT: ${res.msg}`)
    } else if (cmd === 'log') {
      const hist = [...repository.commits].reverse().slice(0, 10)
      if (!hist.length) termPrint('нет коммитов'); else hist.forEach(c => termPrint(`${c.hash} [${c.branch}] ${c.message}`))
    } else if (cmd === 'status') {
      termPrint(`На ветке ${repository.currentBranch}`, `HEAD: ${repository.head || '(нет коммитов)'}`, `Узлов: ${nodes.length}  Рёбер: ${edges.length}`)
    } else if (cmd === 'help') {
      termPrint('save "msg" — коммит', 'branch <имя> — новая ветка', 'checkout <хэш> — загрузить коммит',
        'merge <ветка> — смержить в текущую', 'log — история', 'status — статус', 'clear — очистить терминал')
    } else if (cmd === 'clear') {
      setTermOut([])
    } else {
      termPrint(`unknown command: ${cmd}. Type 'help' for commands`)
    }
  }, [repository, nodes, edges, bits, cleanIPs, asLevel, gitCommit, gitBranch, gitCheckout, gitMerge, termPrint])

  // apply a state loaded from HISTORY view
  useEffect(() => {
    const onLoad = (e: Event) => { const st = (e as CustomEvent).detail; if (st) { setNodes(st.nodes as SbNode[]); setEdges(st.edges as SbEdge[]); pushLog('📂 Состояние коммита загружено') } }
    window.addEventListener('netwar-load-state', onLoad); return () => window.removeEventListener('netwar-load-state', onLoad)
  }, [pushLog])

  // ── tutorial missions (block 8) ──
  const earn = useStore(s => s.earn)
  useEffect(() => {
    if (!localStorage.getItem('netwar_tutorial_seen')) { setMission(1); setMissionIntro(true) }
  }, [])

  const has = useCallback((t: SbType, n = 1) => counts(t) >= n, [counts])
  const missionSteps = useCallback((m: number): { label: string; done: boolean }[] => {
    if (m === 1) return [
      { label: 'Добавь User', done: has('User') },
      { label: 'Добавь Switch (50⬡)', done: has('Switch') },
      { label: 'Добавь Router (150⬡)', done: has('Router') },
      { label: 'Добавь Firewall (200⬡)', done: has('Firewall') },
      { label: 'Добавь WebServer (200⬡)', done: has('WebServer') },
      { label: 'Соедини их рёбрами (≥4)', done: edges.length >= 4 },
      { label: 'Нажми RUN', done: running },
    ]
    if (m === 2) return [
      { label: 'ТСПУ добавлен между сетью', done: has('ТСПУ') },
      { label: 'Добавь VPN параллельно ТСПУ (300⬡+1◈)', done: has('VPN') },
      { label: 'Соедини VPN с сетью', done: has('VPN') && edges.some(e => nodeById(e.source)?.type === 'VPN' || nodeById(e.target)?.type === 'VPN') },
      { label: 'Запусти RUN', done: running && has('VPN') },
    ]
    return [
      { label: 'Добавь DNS сервер (100⬡)', done: has('DNS') },
      { label: 'Соедини DNS с User/Router', done: has('DNS') && edges.some(e => nodeById(e.source)?.type === 'DNS' || nodeById(e.target)?.type === 'DNS') },
      { label: 'Запусти RUN — DNS пакеты летят', done: running && has('DNS') },
    ]
  }, [has, edges, running, nodeById])

  const missionReward: Record<number, { bits: number; ips: number }> = { 1: { bits: 500, ips: 1 }, 2: { bits: 1000, ips: 2 }, 3: { bits: 800, ips: 0 } }

  // completion watcher
  useEffect(() => {
    if (mission == null || missionIntro || missionsDone.includes(mission)) return
    const steps = missionSteps(mission)
    if (steps.every(s => s.done)) {
      const r = missionReward[mission]
      earn(r.bits); if (r.ips) addCleanIPs(r.ips)
      const done = [...missionsDone, mission]; setMissionsDone(done); localStorage.setItem('netwar_missions', JSON.stringify(done))
      pushLog(`🏆 Задание ${mission} выполнено! +${r.bits}⬡${r.ips ? ` +${r.ips}◈` : ''}`)
      if (mission === 1) { setTimeout(() => { addTspuForMission2(); setMission(2); setMissionIntro(true) }, 800) }
      else if (mission === 2) setTimeout(() => { setMission(3); setMissionIntro(true) }, 800)
      else setMission(null)
    }
  }, [nodes, edges, running, mission, missionIntro, missionsDone]) // eslint-disable-line

  // Smart ТСПУ injection: splice ТСПУ onto an edge of the User→WebServer path.
  const addTspuForMission2 = useCallback(() => {
    setNodes(curNodes => {
      const user = curNodes.find(n => n.type === 'User')
      const ws = curNodes.find(n => n.type === 'WebServer')
      if (!user || !ws) {
        pushLog('⚠ ТСПУ не внедрён — нет маршрута User→WebServer')
        return curNodes
      }
      let injected = false
      setEdges(curEdges => {
        const path = findPath(curNodes, curEdges, user.id, ws.id)
        if (!path) { pushLog('⚠ ТСПУ не внедрён — нет пути'); return curEdges }
        // pick the edge on the path, preferring Router→Firewall, else last hop before WS
        const typeOf = (id: string) => curNodes.find(n => n.id === id)?.type
        let cut = -1
        for (let i = 0; i < path.length - 1; i++) {
          const a = typeOf(path[i]), b = typeOf(path[i + 1])
          if ((a === 'Router' && b === 'Firewall') || (a === 'Firewall' && b === 'Router')) { cut = i; break }
        }
        if (cut < 0) cut = Math.max(0, path.length - 2)   // fallback: hop before WS
        const aId = path[cut], bId = path[cut + 1]
        const a = curNodes.find(n => n.id === aId)!, b = curNodes.find(n => n.id === bId)!
        const tspuId = newId('ТСПУ')
        const tx = (a.x + b.x) / 2, ty = (a.y + b.y) / 2
        // add ТСПУ node at the midpoint
        setNodes(ns => [...ns, { id: tspuId, type: 'ТСПУ', x: tx, y: ty, pinned: false, born: performance.now() }])
        injected = true
        pushLog(`⚠ ТСПУ внедрён между ${SB_BY_TYPE.get(a.type)!.full} и ${SB_BY_TYPE.get(b.type)!.full}`)
        const now = performance.now()
        // remove the cut edge, add aId→ТСПУ and ТСПУ→bId
        const kept = curEdges.filter(e => !((e.source === aId && e.target === bId) || (e.source === bId && e.target === aId)))
        const p1 = sbEdgeParams(a.type, 'ТСПУ'), p2 = sbEdgeParams('ТСПУ', b.type)
        return [...kept,
          { id: newId('e'), source: aId, target: tspuId, ...p1, born: now },
          { id: newId('e'), source: tspuId, target: bId, ...p2, born: now }]
      })
      return curNodes
    })
  }, [pushLog])

  const startMission = useCallback(() => {
    setMissionIntro(false); localStorage.setItem('netwar_tutorial_seen', '1')
  }, [])
  const skipTutorial = useCallback(() => { setMission(null); setMissionIntro(false); localStorage.setItem('netwar_tutorial_seen', '1') }, [])

  const selNode = selected ? nodeById(selected) : null
  void tick // re-render trigger

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', background: '#070b14',
        border: mergeFlash ? '2px solid #00e676' : onMain ? 'none' : '2px solid #ffb300',
        boxShadow: mergeFlash ? 'inset 0 0 40px #ffffff44' : 'none', transition: 'border-color .3s' }}
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
            const age = performance.now() - e.born
            const draw = Math.min(age / 300, 1)
            const flashing = age < 400   // red flash on freshly-created edges
            const violates = getConnectionHint(a.type, b.type).level !== 'ok'
            const hovered = hoverEdge === e.id
            const stroke = flashing ? '#ff4444' : (hovered && violates) ? '#ffb300' : '#2a4a6a'
            return (
              <g key={e.id}>
                <line x1={x1} y1={y1} x2={x1 + (x2 - x1) * draw} y2={y1 + (y2 - y1) * draw}
                  stroke={stroke} strokeWidth={sbBwWidth(e.bw)} markerEnd="url(#sbarrow)"
                  strokeDasharray={hovered && violates ? '6 4' : undefined} />
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={14}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setHoverEdge(e.id)} onMouseLeave={() => setHoverEdge(h => h === e.id ? null : h)}
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

        {/* edge-creation plaque (2s) */}
        {edgePlaqueState && Date.now() < edgePlaqueState.until && (
          <div style={{ position: 'absolute', left: edgePlaqueState.x, top: edgePlaqueState.y - 22, transform: 'translate(-50%,-50%)',
            fontFamily: '"Share Tech Mono", monospace', fontSize: 10, color: '#00b4ff', pointerEvents: 'none', zIndex: 18,
            background: '#0d1424', border: '1px solid #00b4ff55', padding: '2px 8px', whiteSpace: 'nowrap' }}>
            {edgePlaqueState.text}
          </div>
        )}

        {/* cost float (-N⬡) over most expensive node */}
        {costFloat && (
          <div style={{ position: 'absolute', left: costFloat.x, top: costFloat.y - 6, transform: 'translate(-50%,0)',
            fontFamily: '"Share Tech Mono", monospace', fontSize: 12, color: '#ff4444', pointerEvents: 'none',
            animation: 'costFloat 1s ease-out forwards', zIndex: 20 }}>
            -{costFloat.amt} ⬡
          </div>
        )}

        {/* nodes */}
        {nodes.map(n => {
          const item = SB_BY_TYPE.get(n.type)!
          const isSel = selected === n.id
          const col = n.disabled ? '#3a4a5a' : item.color
          return (
            <div key={n.id}
              onMouseDown={onNodeMouseDown(n.id)}
              onMouseEnter={() => setHoverNode(n.id)}
              onMouseLeave={() => setHoverNode(h => h === n.id ? null : h)}
              onContextMenu={ev => { ev.preventDefault(); ev.stopPropagation(); setCtx({ kind: 'node', id: n.id, x: ev.clientX, y: ev.clientY }) }}
              style={{ position: 'absolute', left: n.x, top: n.y, width: SB_NODE_SIZE, height: SB_NODE_SIZE,
                transform: 'translate(-50%,-50%)', animation: exploding ? 'sbfade .5s ease-in forwards'
                  : (performance.now() - n.born < 450 ? (n.type === 'ТСПУ' ? 'sbinject .4s ease-out' : 'sbpop .2s ease-out') : 'none'),
                border: `2px solid ${isSel ? '#00e676' : col}`, borderRadius: 3, background: `${col}1a`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: n.pinned ? 'default' : 'grab',
                fontFamily: '"Press Start 2P", cursive', fontSize: item.label.length > 2 ? 8 : 14, color: col,
                boxShadow: isSel ? '0 0 12px #00e676aa' : `0 0 8px ${col}66` }}>
              {item.label}
              {n.pinned && <span style={{ position: 'absolute', top: -16, fontSize: 11 }}>📌</span>}
              {n.disabled && <span style={{ position: 'absolute', top: -16, fontSize: 9, color: '#ff4444' }}>OFF</span>}
              <span style={{ position: 'absolute', bottom: -16, fontFamily: '"Share Tech Mono", monospace',
                fontSize: 9, color: col, whiteSpace: 'nowrap', pointerEvents: 'none' }}>{item.full}</span>
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

      {/* mission intro */}
      {mission != null && missionIntro && (
        <Modal onClose={skipTutorial}>
          <div style={{ fontFamily: '"Press Start 2P", cursive', fontSize: 10, color: '#9c6bff', marginBottom: 12 }}>
            📋 ЗАДАНИЕ {mission}
          </div>
          <div style={{ fontSize: 12, color: '#c8d8f0', lineHeight: 1.7, marginBottom: 12 }}>
            {mission === 1 && 'Построй сеть чтобы User мог достучаться до WebServer. Минимум: User → Switch → Router → Firewall → WebServer. Нужно ~600⬡.'}
            {mission === 2 && 'ТСПУ внедрён между Router и WebServer и блокирует трафик. Добавь VPN параллельно ТСПУ и направь трафик в обход.'}
            {mission === 3 && 'Настрой DNS инфраструктуру: добавь DNS сервер, соедини с сетью и проверь что DNS пакеты летят.'}
          </div>
          <div style={{ fontSize: 11, color: '#ffb300', marginBottom: 14 }}>
            Награда: +{missionReward[mission].bits}⬡{missionReward[mission].ips ? ` +${missionReward[mission].ips}◈` : ''}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <SBtn label="Начать" color="#00e676" onClick={startMission} />
            <SBtn label="Пропустить туториал" color="#5a7090" onClick={skipTutorial} />
          </div>
        </Modal>
      )}

      {/* live mission checklist */}
      {mission != null && !missionIntro && !missionsDone.includes(mission) && (
        <div style={{ position: 'absolute', top: 70, right: 16, zIndex: 45, width: 260,
          background: '#0d1424', border: '1.5px solid #9c6bff', boxShadow: '0 0 14px #9c6bff33',
          padding: '12px 14px', fontFamily: '"Share Tech Mono", monospace' }}>
          <div style={{ fontFamily: '"Press Start 2P", cursive', fontSize: 8, color: '#9c6bff', marginBottom: 10 }}>
            ЗАДАНИЕ {mission}
          </div>
          {missionSteps(mission).map((s, i) => (
            <div key={i} style={{ fontSize: 11, color: s.done ? '#00e676' : '#7a9ab8', lineHeight: 1.8,
              transition: 'color .2s' }}>
              {s.done ? '☑' : '□'} {s.label}
            </div>
          ))}
        </div>
      )}

      {/* User settings panel (block 5) */}
      {userPanel && nodeById(userPanel)?.type === 'User' && (
        <UserSettings
          id={userPanel}
          cfg={userCfg[userPanel] ?? DEFAULT_CFG}
          onApply={(c) => { setUserCfg(prev => ({ ...prev, [userPanel]: c })); pushLog('✓ Настройки User применены'); setUserPanel(null) }}
          onClose={() => setUserPanel(null)} />
      )}

      {/* terminal line (above bottom controls) */}
      <div onMouseDown={e => e.stopPropagation()} style={{ position: 'absolute', bottom: 76, left: 90, right: 16, zIndex: 42,
        background: '#070b14', border: `1px solid ${onMain ? '#1e2d4a' : '#ffb30055'}`, fontFamily: '"Share Tech Mono", monospace' }}>
        {termOut.length > 0 && (
          <div style={{ maxHeight: 110, overflowY: 'auto', padding: '6px 10px', fontSize: 11, color: '#7a9ab8', lineHeight: 1.6 }}>
            {termOut.slice(-8).map((l, i) => (
              <div key={i} style={{ color: l.startsWith('Committed') || l.startsWith('Merge') || l.startsWith('Switched') ? '#00e676'
                : l.includes('CONFLICT') || l.startsWith('unknown') ? '#ff8c00' : l.startsWith('netwar@') ? '#00b4ff' : '#7a9ab8' }}>{l}</div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', height: 32, padding: '0 10px', borderTop: termOut.length ? '1px solid #1e2d4a' : 'none' }}>
          <span style={{ color: '#00e676', fontSize: 11, marginRight: 6, whiteSpace: 'nowrap' }}>netwar@sandbox:~/{repository.currentBranch} $</span>
          <input value={termInput} onChange={e => setTermInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { runCmd(termInput); setTermInput('') } }}
            placeholder='save "описание"  |  help'
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#00e676',
              fontFamily: '"Share Tech Mono", monospace', fontSize: 11 }} />
        </div>
      </div>

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
          {check.errors.length === 0 && check.warnings.length === 0 && (
            <div style={{ fontSize: 11, color: '#00e676', lineHeight: 1.8 }}>✓ Ошибок не найдено</div>
          )}
          {check.errors.map((l, i) => <div key={`e${i}`} style={{ fontSize: 11, color: '#ff4444', lineHeight: 1.8 }}>{l}</div>)}
          {check.warnings.map((l, i) => <div key={`w${i}`} style={{ fontSize: 11, color: '#ff8c00', lineHeight: 1.8 }}>{l}</div>)}
          {check.tips.length > 0 && (
            <div style={{ marginTop: 12, borderLeft: '2px solid #ffb300', paddingLeft: 8 }}>
              {check.tips.map((t, i) => <div key={`t${i}`} style={{ fontSize: 11, color: '#ffb300', lineHeight: 1.6 }}>💡 {t}</div>)}
            </div>
          )}
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

      {/* connection hint badge (selected + hovering another node) */}
      {selected && hoverNode && hoverNode !== selected && mouse && (() => {
        const a = nodeById(selected), b = nodeById(hoverNode); if (!a || !b) return null
        const hint = getConnectionHint(a.type, b.type)
        const r = canvasRef.current?.getBoundingClientRect()
        const col = hint.level === 'ok' ? '#00e676' : hint.level === 'warn' ? '#ffb300' : '#ff4444'
        return (
          <div style={{ position: 'fixed', left: (r?.left ?? 0) + mouse.x + 16, top: (r?.top ?? 0) + mouse.y + 16,
            zIndex: 1250, pointerEvents: 'none', background: '#0d1424', border: `1.5px solid ${col}`,
            color: col, fontFamily: '"Share Tech Mono", monospace', fontSize: 11, padding: '4px 10px', maxWidth: 240 }}>
            {hint.message}
          </div>
        )
      })()}

      {/* error toast */}
      {toast && Date.now() < toast.until && (
        <div style={{ position: 'absolute', bottom: 70, left: '50%', transform: 'translateX(-50%)', zIndex: 1250,
          background: '#0d1424', border: '1.5px solid #ff4444', boxShadow: '0 0 14px #ff444444',
          color: '#ff8888', fontFamily: '"Share Tech Mono", monospace', fontSize: 11, padding: '8px 16px', maxWidth: 420, textAlign: 'center' }}>
          {toast.msg}
        </div>
      )}

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
