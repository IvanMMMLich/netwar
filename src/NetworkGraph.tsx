import React, { useEffect, useRef, useState, useCallback } from 'react'
import * as d3 from 'd3'
import {
  NODES, EDGES, NetNode, NetEdge, NODE_COLOR, NODE_TYPE_MAP, NODE_MAP,
  CANVAS_W, CANVAS_H, NODE_SIZE, pairKey, EDGE_BY_PAIR,
  utilColor, bwWidth, bwLabel, ospfCost,
  USER_IDS, VPN_ID, isTunnelSegment,
  buildHttpRoute, buildBlockedRoute, buildTunnelRoute, buildDnsRoute,
  RouteTemplate, PacketKind,
} from './data/topology'
import { useStore } from './store'
import ControlBar from './components/ControlBar'

// ─── Packet model ──────────────────────────────────────────────────────────────

interface Packet {
  id: number
  kind: PacketKind
  nodes: string[]      // route
  seg: number          // current segment index
  segElapsed: number   // ms elapsed within current segment
  bytes: number
  ttl: number
}

interface Shard { x: number; y: number; vx: number; vy: number; start: number; color: string }
interface Bounce { start: number; dur: number; amp: number }

const PKT_COLOR: Record<PacketKind, string> = {
  http: '#00b4ff', blocked: '#ff4444', tunnel: '#00b4ff', dns: '#ffb300',
}
const HALF = NODE_SIZE / 2
const TRIM = HALF + 8
const MAX_PACKETS = 22
const SPAWN_MS = 650

// segment duration influenced by latency, divided by speed
function segDuration(a: string, b: string): number {
  const e = EDGE_BY_PAIR.get(pairKey(a, b))
  const lat = e ? Math.min(e.props.latency, 90) : 1
  return 320 + lat * 2.0
}

function easeOutCubic(t: number): number { return 1 - Math.pow(1 - t, 3) }

// ─── OSPF: Dijkstra over EDGES ───────────────────────────────────────────────────

const ALL_NODE_IDS = NODES.map(n => n.id)

function dijkstra(
  weights: Map<string, number>, failed: Set<string>, src: string, dst: string,
): { path: string[]; cost: number } | null {
  const dist = new Map<string, number>(ALL_NODE_IDS.map(n => [n, Infinity]))
  const prev = new Map<string, string>()
  const unvisited = new Set(ALL_NODE_IDS)
  dist.set(src, 0)
  while (unvisited.size) {
    let u = ''; let min = Infinity
    for (const n of unvisited) { const d = dist.get(n)!; if (d < min) { min = d; u = n } }
    if (!u || min === Infinity) break
    if (u === dst) break
    unvisited.delete(u)
    for (const e of EDGES) {
      if (failed.has(e.id)) continue
      const nb = e.source === u ? e.target : e.target === u ? e.source : null
      if (!nb || !unvisited.has(nb)) continue
      const alt = dist.get(u)! + (weights.get(e.id) ?? 10)
      if (alt < dist.get(nb)!) { dist.set(nb, alt); prev.set(nb, u) }
    }
  }
  if (dist.get(dst) === Infinity) return null
  const path: string[] = []; let cur: string | undefined = dst
  while (cur) { path.unshift(cur); cur = prev.get(cur) }
  return { path, cost: dist.get(dst)! }
}

// edge ids that lie on a node path
function pathEdgeIds(path: string[]): Set<string> {
  const s = new Set<string>()
  for (let i = 0; i < path.length - 1; i++) {
    const e = EDGE_BY_PAIR.get(pairKey(path[i], path[i + 1]))
    if (e) s.add(e.id)
  }
  return s
}

// ─── Counters HUD ───────────────────────────────────────────────────────────────

function Counters({ c }: { c: { delivered: number; blocked: number; dns: number; vpn: number } }) {
  const Row = (label: string, val: number, color: string) => (
    <span style={{ color, textShadow: `0 0 8px ${color}`, letterSpacing: '0.12em' }}>
      {label}: {val}
    </span>
  )
  return (
    <div style={{ position: 'absolute', bottom: 16, left: 16, zIndex: 50,
      fontFamily: '"Share Tech Mono", monospace', fontSize: 13,
      display: 'flex', flexDirection: 'column', gap: 4, pointerEvents: 'none' }}>
      {Row('PACKETS DELIVERED', c.delivered, '#00e676')}
      {Row('BLOCKED BY ТСПУ',  c.blocked,   '#ff4444')}
      {Row('DNS RESOLVED',     c.dns,       '#ffb300')}
      {Row('VPN TUNNELED',     c.vpn,       '#9c6bff')}
    </div>
  )
}

// ─── Edge hover card ────────────────────────────────────────────────────────────

function EdgeCard({ tip, cref }: {
  tip: { x: number; y: number; edge: NetEdge; util: number }
  cref: React.RefObject<HTMLDivElement>
}) {
  const { edge, util } = tip
  const p = edge.props
  const sType = NODE_TYPE_MAP.get(edge.source) ?? edge.source
  const tType = NODE_TYPE_MAP.get(edge.target) ?? edge.target
  const bars  = Math.round(util / 10)
  const bar   = '█'.repeat(bars) + '░'.repeat(10 - bars)
  // threshold colouring per ARCHITECTURE.md block 1
  const latColor  = p.latency > 100 ? '#ff4444' : p.latency > 50 ? '#ffb300' : '#c8d8f0'
  const lossColor = p.loss > 1 ? '#ff4444' : p.loss > 0 ? '#ffb300' : '#c8d8f0'
  const uColor    = util > 80 ? '#ff4444' : util > 60 ? '#ffb300' : utilColor(util)
  const cardW = 340; const cardH = 360; const PAD = 14
  const rect = cref.current?.getBoundingClientRect()
  const cw = rect?.width ?? window.innerWidth; const ch = rect?.height ?? window.innerHeight
  let left = tip.x + PAD; let top = tip.y + PAD
  if (left + cardW > cw) left = tip.x - cardW - PAD
  if (top  + cardH > ch) top  = tip.y - cardH - PAD
  return (
    <div style={{ position: 'absolute', left, top, width: cardW, zIndex: 200,
      background: '#0d1424', border: '1.5px solid #1e2d4a', boxShadow: '0 0 16px #00b4ff22',
      padding: '12px 16px', pointerEvents: 'none' }}>
      <div style={{ fontFamily: '"Press Start 2P", cursive', fontSize: 9, color: '#00b4ff', marginBottom: 8 }}>
        {sType} → {tType}
      </div>
      <div style={{ fontSize: 10, color: '#4a6a8a', marginBottom: 8, letterSpacing: '0.08em' }}>
        {p.channelType}
      </div>
      <div style={{ borderTop: '1px solid #1e2d4a', margin: '8px 0' }} />
      {[
        { k: 'BW',      v: <span style={{ color: '#c8d8f0' }}>{bwLabel(p.bandwidth)}</span>,
          hint: 'пропускная способность канала' },
        { k: 'LATENCY', v: <span style={{ color: latColor }}>{p.latency} мс</span>,
          hint: 'задержка передачи пакета' },
        { k: 'LOSS',    v: <span style={{ color: lossColor }}>{p.loss}%</span>,
          hint: 'процент потерянных пакетов' },
        { k: 'UTIL',    v: <span style={{ color: uColor }}>{bar} {util.toFixed(0)}%</span>,
          hint: 'текущая загрузка канала' },
      ].map(({ k, v, hint }) => (
        <div key={k} style={{ marginBottom: 4 }}>
          <div style={{ display: 'flex', gap: 8,
            fontFamily: '"Share Tech Mono", monospace', fontSize: 11, lineHeight: '1.7' }}>
            <span style={{ color: '#4a6a8a', minWidth: 72, flexShrink: 0 }}>{k}:</span>
            {v}
          </div>
          <div style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 9,
            color: '#5a7090', paddingLeft: 80, lineHeight: '1.4' }}>
            → {hint}
          </div>
        </div>
      ))}
      <div style={{ borderTop: '1px solid #1e2d4a', margin: '8px 0' }} />
      <div style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 10, color: '#4a6a8a' }}>
        OSPF COST: <span style={{ color: '#00e676' }}>{ospfCost(p.bandwidth)}</span>
        <div style={{ fontSize: 9, marginTop: 3, color: '#5a7090', lineHeight: '1.5' }}>
          → чем меньше → тем предпочтительнее маршрут<br />
          → (формула: Cost = 100 000 000 / BW в бит/с)
        </div>
      </div>
    </div>
  )
}

// ─── Packet hover tooltip ──────────────────────────────────────────────────────

// per-segment "ЦЕЛЬ" texts keyed by sourceType::targetType
const SEG_GOAL: Record<string, string> = {
  'User::Switch':        'L2 коммутация по MAC-адресу',
  'Switch::ISP':         'передача на роутер провайдера',
  'ISP::ТСПУ':          '⚠ инспекция DPI — ТСПУ читает IP и SNI',
  'ТСПУ::Firewall':     'пакет прошёл проверку ТСПУ',
  'ТСПУ::VPN':          'туннелирование — ТСПУ видит только IP VPN',
  'VPN::Firewall':       'расшифровка на VPN сервере',
  'Firewall::WebServer': 'доставка на веб-сервер',
  'User::DNS_Stub':      'DNS запрос — резолюция домена в IP',
  'DNS_Stub::DNS_R':     'рекурсивный резолвер ищет ответ',
  'DNS_R::DNS_ROOT':     'запрос к корневым серверам (13 штук)',
  'DNS_ROOT::DNS_TLD':   'корень отвечает: спроси .com сервер',
  'DNS_TLD::DNS_AUTH':   'TLD отвечает: спроси авторитетный NS',
}

function segGoal(p: Packet): string {
  const a = p.nodes[p.seg], b = p.nodes[p.seg + 1]
  if (!b) return 'доставка завершена'
  // FW → WS3 special case
  if (a === 'fw1' && b === 'ws3') return '⛔ ЗАБЛОКИРОВАНО — нужен VPN туннель'
  const ta = NODE_TYPE_MAP.get(a), tb = NODE_TYPE_MAP.get(b)
  return SEG_GOAL[`${ta}::${tb}`] ?? SEG_GOAL[`${tb}::${ta}`] ?? 'передача данных'
}

const PKT_PROTO_HINT: Record<PacketKind, { proto: string; hint: string }> = {
  http:    { proto: 'TCP',          hint: 'надёжная доставка с подтверждением' },
  tunnel:  { proto: 'WireGuard/UDP', hint: 'шифрованный туннель поверх UDP' },
  dns:     { proto: 'DNS / UDP 53', hint: 'быстрый запрос без подтверждения' },
  blocked: { proto: 'TCP',          hint: 'надёжная доставка с подтверждением' },
}

const PKT_TITLE: Record<PacketKind, string> = {
  http: 'TCP пакет', tunnel: 'VPN пакет', dns: 'DNS пакет', blocked: 'TCP пакет',
}

function PktTooltip({ tip, cref, paused }: {
  tip: { x: number; y: number; pkt: Packet }
  cref: React.RefObject<HTMLDivElement>
  paused: boolean
}) {
  const { pkt } = tip
  const isBlocked = pkt.kind === 'blocked'
  const color = isBlocked ? '#ff4444' : PKT_COLOR[pkt.kind]
  const a = pkt.nodes[pkt.seg], b = pkt.nodes[pkt.seg + 1]
  const aName = NODE_MAP.get(a)?.sublabel ?? a
  const bName = b ? (NODE_MAP.get(b)?.sublabel ?? b) : '—'
  const { proto, hint } = PKT_PROTO_HINT[pkt.kind]
  const cardW = 340; const cardH = isBlocked ? 200 : 260; const PAD = 14
  const rect = cref.current?.getBoundingClientRect()
  const cw = rect?.width ?? window.innerWidth; const ch = rect?.height ?? window.innerHeight
  let left = tip.x + PAD; let top = tip.y + PAD
  if (left + cardW > cw) left = tip.x - cardW - PAD
  if (top  + cardH > ch) top  = tip.y - cardH - PAD

  const mono = { fontFamily: '"Share Tech Mono", monospace' } as const

  if (isBlocked) {
    return (
      <div style={{ position: 'absolute', left, top, width: cardW, zIndex: 230,
        background: '#0d1424', border: '1.5px solid #ff4444', boxShadow: '0 0 16px #ff444455',
        padding: '12px 16px', pointerEvents: 'none' }}>
        <div style={{ fontFamily: '"Press Start 2P", cursive', fontSize: 10, color: '#ff4444',
          marginBottom: 10, textShadow: '0 0 8px #ff4444' }}>
          ✕ ЗАБЛОКИРОВАНО ТСПУ
        </div>
        {[
          ['ПРИЧИНА',        'SNI содержит blocked.com'],
          ['ЧТО ВИДЕЛ ТСПУ', 'IP назначения + SNI'],
          ['ОБХОД',          'VPN туннель скрывает SNI'],
        ].map(([k, v]) => (
          <div key={k} style={{ ...mono, fontSize: 11, lineHeight: '2', display: 'flex', gap: 8 }}>
            <span style={{ color: '#4a6a8a', minWidth: 130, flexShrink: 0 }}>{k}:</span>
            <span style={{ color: k === 'ОБХОД' ? '#9c6bff' : '#ff8888' }}>{v}</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div style={{ position: 'absolute', left, top, width: cardW, zIndex: 230,
      background: '#0d1424', border: `1.5px solid ${color}`, boxShadow: `0 0 14px ${color}55`,
      padding: '12px 16px', pointerEvents: 'none' }}>
      <div style={{ fontFamily: '"Press Start 2P", cursive', fontSize: 10, color,
        marginBottom: 10, textShadow: `0 0 8px ${color}` }}>
        {PKT_TITLE[pkt.kind]}
      </div>
      <div style={{ borderTop: '1px solid #1e2d4a', marginBottom: 8 }} />
      <div style={{ ...mono, fontSize: 11, lineHeight: '1.9', display: 'flex', gap: 8 }}>
        <span style={{ color: '#4a6a8a', minWidth: 86, flexShrink: 0 }}>МАРШРУТ:</span>
        <span style={{ color: '#c8d8f0' }}>{aName} → {bName}</span>
      </div>
      <div style={{ ...mono, fontSize: 11, lineHeight: '1.9', display: 'flex', gap: 8 }}>
        <span style={{ color: '#4a6a8a', minWidth: 86, flexShrink: 0 }}>ПРОТОКОЛ:</span>
        <span style={{ color: '#c8d8f0' }}>{proto}</span>
      </div>
      <div style={{ ...mono, fontSize: 9, color: '#5a7090', paddingLeft: 94, lineHeight: '1.4' }}>
        → {hint}
      </div>
      <div style={{ ...mono, fontSize: 11, lineHeight: '1.9', display: 'flex', gap: 8 }}>
        <span style={{ color: '#4a6a8a', minWidth: 86, flexShrink: 0 }}>РАЗМЕР:</span>
        <span style={{ color: '#c8d8f0' }}>{pkt.bytes} байт{pkt.bytes === 1460 ? ' (стандартный MTU Ethernet)' : ''}</span>
      </div>
      <div style={{ ...mono, fontSize: 11, lineHeight: '1.9', display: 'flex', gap: 8 }}>
        <span style={{ color: '#4a6a8a', minWidth: 86, flexShrink: 0 }}>TTL:</span>
        <span style={{ color: '#c8d8f0' }}>{pkt.ttl}</span>
      </div>
      <div style={{ ...mono, fontSize: 9, color: '#5a7090', paddingLeft: 94, lineHeight: '1.4' }}>
        → осталось {pkt.ttl} хопов до истечения
      </div>
      <div style={{ ...mono, fontSize: 11, lineHeight: '1.9', display: 'flex', gap: 8 }}>
        <span style={{ color: '#4a6a8a', minWidth: 86, flexShrink: 0 }}>СТАТУС:</span>
        <span style={{ color: paused ? '#ffb300' : '#00e676' }}>{paused ? 'ЗАМОРОЖЕН' : 'TRANSIT'}</span>
      </div>
      <div style={{ borderTop: '1px solid #1e2d4a', margin: '8px 0' }} />
      <div style={{ ...mono, fontSize: 11, color: pkt.kind === 'tunnel' ? '#9c6bff' : '#88ffcc', lineHeight: '1.6' }}>
        ЦЕЛЬ: {segGoal(pkt)}
      </div>
    </div>
  )
}

// ─── Node hover tooltip ──────────────────────────────────────────────────────────

const NODE_HINT: Record<string, string> = {
  User: 'Источник трафика. Отправляет HTTP и DNS запросы.',
  Switch: 'L2 коммутатор. Видит только MAC-адреса.',
  ISP: 'L3 маршрутизатор провайдера. Зеркалит трафик в ТСПУ.',
  ТСПУ: 'DPI враг. Читает IP / SNI / DNS и блокирует.',
  VPN: 'Шифрует трафик в туннель. Обход блокировок.',
  Firewall: 'Фильтр перед серверами. Stateful inspection.',
  WebServer: 'Конечный сайт. Принимает запросы.',
  DNS_Stub: 'Резолвер на компе. Начало DNS-цепочки.',
  DNS_R: 'Рекурсивный DNS. Обходит всю иерархию.',
  DNS_ROOT: 'Корень DNS. Знает TLD серверы.',
  DNS_TLD: 'TLD сервер. Знает зоны .com .ru.',
  DNS_AUTH: 'Авторитативный DNS. Знает реальный IP.',
}

function NodeTip({ tip, cref, stats }: {
  tip: { x: number; y: number; node: NetNode }
  cref: React.RefObject<HTMLDivElement>
  stats: Map<string, { passed: number; blocked: number }>
}) {
  const { node } = tip
  const color = NODE_COLOR[node.type]
  const st = stats.get(node.id) ?? { passed: 0, blocked: 0 }
  const cardW = 250; const PAD = 14
  const rect = cref.current?.getBoundingClientRect()
  const cw = rect?.width ?? window.innerWidth
  let left = tip.x + PAD; let top = tip.y + PAD
  if (left + cardW > cw) left = tip.x - cardW - PAD
  return (
    <div style={{ position: 'absolute', left, top, width: cardW, zIndex: 220,
      background: '#0d1424', border: `1.5px solid ${color}`, boxShadow: `0 0 12px ${color}55`,
      padding: '10px 14px', pointerEvents: 'none' }}>
      <div style={{ fontFamily: '"Press Start 2P", cursive', fontSize: 9, color,
        marginBottom: 8, textShadow: `0 0 8px ${color}` }}>
        {node.label} · {node.sublabel}
      </div>
      <div style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 11, color: '#c8d8f0',
        lineHeight: '1.6', marginBottom: 8 }}>
        {NODE_HINT[node.type]}
      </div>
      <div style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 10, color: '#4a6a8a' }}>
        прошло: <span style={{ color: '#00e676' }}>{st.passed}</span>
        {'   '}блок: <span style={{ color: '#ff4444' }}>{st.blocked}</span>
      </div>
    </div>
  )
}

// ─── Log ─────────────────────────────────────────────────────────────────────────

function EventLog({ entries }: { entries: string[] }) {
  if (!entries.length) return null
  return (
    <div style={{ position: 'absolute', bottom: 72, left: '50%', transform: 'translateX(-50%)',
      fontFamily: '"Share Tech Mono", monospace', fontSize: 10, color: '#ff8888',
      background: '#0d1424', border: '1px solid #ff444433', padding: '4px 14px',
      zIndex: 60, pointerEvents: 'none', display: 'flex', flexDirection: 'column', gap: 2 }}>
      {entries.map((e, i) => <span key={i} style={{ opacity: 1 - i * 0.25 }}>{e}</span>)}
    </div>
  )
}

// ─── OSPF badge / banner ─────────────────────────────────────────────────────────

function OspfBadge() {
  return (
    <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
      fontFamily: '"Share Tech Mono", monospace', fontSize: 12, letterSpacing: '0.15em',
      color: '#00e676', textShadow: '0 0 8px #00e676',
      background: '#070b14', border: '1px solid #00e67644', padding: '4px 16px',
      zIndex: 60, pointerEvents: 'none' }}>
      OSPF::ACTIVE&nbsp;&nbsp;|&nbsp;&nbsp;AREA 0&nbsp;&nbsp;|&nbsp;&nbsp;МЕТРИКА: COST
    </div>
  )
}

function OspfBanner({ path, cost }: { path: string[]; cost: number }) {
  const names = path.map(id => NODE_MAP.get(id)?.label ?? id).join(' → ')
  return (
    <div style={{ position: 'absolute', top: 52, left: '50%', transform: 'translateX(-50%)',
      fontFamily: '"Share Tech Mono", monospace', fontSize: 11, color: '#00e676',
      background: '#0d1424', border: '1.5px solid #00e676', boxShadow: '0 0 14px #00e67644',
      padding: '6px 16px', zIndex: 60, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
      МАРШРУТ OSPF&nbsp;|&nbsp;{names}&nbsp;|&nbsp;ВЕС: {cost}
    </div>
  )
}

function WeightEditor({ edge, onCommit, onCancel }: {
  edge: { id: string; x: number; y: number; value: string }
  onCommit: (id: string, v: number) => void; onCancel: () => void
}) {
  const [val, setVal] = useState(edge.value)
  return (
    <input autoFocus value={val} onChange={e => setVal(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter') { const n = parseInt(val, 10); if (!isNaN(n) && n > 0 && n <= 100) onCommit(edge.id, n); else onCancel() }
        if (e.key === 'Escape') onCancel()
      }}
      onBlur={onCancel}
      style={{ position: 'absolute', left: edge.x - 24, top: edge.y - 14, width: 52, height: 28,
        zIndex: 300, fontFamily: '"Press Start 2P", cursive', fontSize: 9,
        background: '#0d1424', border: '1.5px solid #00e676', color: '#00e676',
        textAlign: 'center', outline: 'none', boxShadow: '0 0 10px #00e67666' }} />
  )
}

// ─── Main ──────────────────────────────────────────────────────────────────────

interface Props {
  onNodeStats: (s: Map<string, { passed: number; blocked: number }>) => void
  onTspuBlocked: (n: number) => void
}

export default function NetworkGraph({ onNodeStats, onTspuBlocked }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const cref   = useRef<HTMLDivElement>(null)
  const zoomBehRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const gRef       = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null)

  const packetsRef = useRef<Packet[]>([])
  const shardsRef  = useRef<Shard[]>([])
  const bouncesRef = useRef<Map<string, Bounce>>(new Map())
  const tspuFlashRef = useRef(0)
  const edgeUtilRef  = useRef<Map<string, number>>(new Map(EDGES.map(e => [e.id, 0])))
  const nodeStatsRef = useRef<Map<string, { passed: number; blocked: number }>>(
    new Map(NODES.map(n => [n.id, { passed: 0, blocked: 0 }]))
  )

  const nodeSelRef = useRef<d3.Selection<SVGGElement, NetNode, SVGGElement, unknown> | null>(null)
  const edgeSelRef = useRef<d3.Selection<SVGGElement, NetEdge, SVGGElement, unknown> | null>(null)
  const pktGroupRef   = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null)
  const shardGroupRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null)
  const wgtGroupRef   = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null)
  const wgtSelRef     = useRef<d3.Selection<SVGGElement, NetEdge, SVGGElement, unknown> | null>(null)

  // ── OSPF refs ──
  const edgeWeightsRef = useRef<Map<string, number>>(
    new Map(EDGES.map(e => [e.id, Math.min(100, Math.max(1, ospfCost(e.props.bandwidth)))]))
  )
  const failedEdgesRef = useRef<Set<string>>(new Set())
  const ospfPathIdsRef = useRef<Set<string>>(new Set())
  const ospfActiveRef  = useRef(false)
  const ospfSrcRef     = useRef<string | null>(null)
  const ospfDstRef     = useRef<string | null>(null)
  const styleEdgesRef  = useRef<() => void>(() => {})
  const updateRingsRef = useRef<() => void>(() => {})

  const nextIdRef = useRef(0)
  const lastSpawnRef = useRef(0)
  const lastRafRef   = useRef(0)
  const rafRef       = useRef(0)
  const counterRef   = useRef({ delivered: 0, blocked: 0, dns: 0, vpn: 0 })
  const tooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { paused, speed, selectedNodeId } = useStore()
  const isPausedRef = useRef(false)
  const speedRef    = useRef(1)
  // OSPF store
  const { ospfActive, setOspfActive, ospfSrcId, ospfDstId, setOspfSrc, setOspfDst, clearOspf } = useStore()
  useEffect(() => { isPausedRef.current = paused }, [paused])
  useEffect(() => { speedRef.current = speed }, [speed])
  useEffect(() => { ospfActiveRef.current = ospfActive }, [ospfActive])
  useEffect(() => { ospfSrcRef.current = ospfSrcId }, [ospfSrcId])
  useEffect(() => { ospfDstRef.current = ospfDstId }, [ospfDstId])

  const [zoomLevel, setZoomLevel] = useState(1)
  const [counters, setCounters]   = useState({ delivered: 0, blocked: 0, dns: 0, vpn: 0 })
  const [edgeTip, setEdgeTip]     = useState<{ x: number; y: number; edge: NetEdge; util: number } | null>(null)
  const [nodeTip, setNodeTip]     = useState<{ x: number; y: number; node: NetNode } | null>(null)
  const [pktTip, setPktTip]       = useState<{ x: number; y: number; pkt: Packet } | null>(null)
  const [statsState, setStatsState] = useState<Map<string, { passed: number; blocked: number }>>(new Map())
  const [log, setLog] = useState<string[]>([])
  const [ospfPath, setOspfPath]   = useState<{ nodes: string[]; cost: number } | null>(null)
  const [editingEdge, setEditingEdge] = useState<{ id: string; x: number; y: number; value: string } | null>(null)

  const pos = (id: string) => { const n = NODE_MAP.get(id)!; return { x: n.x, y: n.y } }

  const applyZoom = useCallback((delta: number) => {
    if (!svgRef.current || !zoomBehRef.current) return
    const k = d3.zoomTransform(svgRef.current).k
    const next = Math.min(2, Math.max(0.5, Math.round((k + delta) * 10) / 10))
    d3.select(svgRef.current).transition().duration(200).call(zoomBehRef.current.scaleTo, next)
  }, [])

  const bounce = useCallback((id: string, dur: number, amp: number) => {
    bouncesRef.current.set(id, { start: performance.now(), dur, amp })
  }, [])

  const spawnPacket = useCallback(() => {
    const r = Math.random()
    const u = USER_IDS[Math.floor(Math.random() * USER_IDS.length)]
    let tmpl: RouteTemplate
    if (r < 0.40)      tmpl = buildHttpRoute(u, Math.random() < 0.5 ? 'ws1' : 'ws2')
    else if (r < 0.62) tmpl = buildBlockedRoute(u)
    else if (r < 0.82) tmpl = buildTunnelRoute(u)
    else               tmpl = buildDnsRoute()
    const p: Packet = { id: nextIdRef.current++, kind: tmpl.kind, nodes: tmpl.nodes, seg: 0, segElapsed: 0,
      bytes: [64, 512, 1460][Math.floor(Math.random() * 3)], ttl: 32 + Math.floor(Math.random() * 32) }
    packetsRef.current.push(p)
    bounce(p.nodes[0], 200, 0.2)   // User bounce on send
  }, [bounce])

  // ── OSPF: recompute shortest path between selected source / dest ──
  const runDijkstra = useCallback(() => {
    const src = ospfSrcRef.current, dst = ospfDstRef.current
    if (!src || !dst) { ospfPathIdsRef.current = new Set(); setOspfPath(null); styleEdgesRef.current(); return }
    const res = dijkstra(edgeWeightsRef.current, failedEdgesRef.current, src, dst)
    if (res && res.path.length > 1) {
      ospfPathIdsRef.current = pathEdgeIds(res.path)
      setOspfPath({ nodes: res.path, cost: res.cost })
    } else {
      ospfPathIdsRef.current = new Set(); setOspfPath(null)
    }
    styleEdgesRef.current()
  }, [])

  useEffect(() => { if (ospfActive) runDijkstra() }, [ospfSrcId, ospfDstId, ospfActive, runDijkstra])

  const toggleOspf = useCallback(() => {
    const next = !ospfActiveRef.current
    setOspfActive(next)
    if (next) { useStore.getState().setSelectedNode(null) }   // close side panel
    else { clearOspf(); setOspfPath(null); ospfPathIdsRef.current = new Set() }
    // styling/visibility updates happen via the ospfActive effect below
  }, [setOspfActive, clearOspf])

  const commitWeight = useCallback((id: string, v: number) => {
    edgeWeightsRef.current.set(id, v)
    setEditingEdge(null)
    runDijkstra()
    if (wgtSelRef.current) wgtSelRef.current.select('text').text((d: NetEdge) => String(edgeWeightsRef.current.get(d.id) ?? '?'))
  }, [runDijkstra])

  // ── Build the static scene once ────────────────────────────────────────────
  useEffect(() => {
    const svg = d3.select(svgRef.current!)
    svg.selectAll('*').remove()

    // Arrow marker
    const defs = svg.append('defs')
    defs.append('marker')
      .attr('id', 'arrow').attr('viewBox', '0 0 10 10')
      .attr('refX', 9).attr('refY', 5).attr('markerWidth', 6).attr('markerHeight', 6)
      .attr('orient', 'auto-start-reverse')
      .append('path').attr('d', 'M 0 0 L 10 5 L 0 10 z').attr('fill', '#3a4a6a')

    const g = svg.append('g'); gRef.current = g

    // ── Edges ──
    const edgeSel = g.append('g').selectAll<SVGGElement, NetEdge>('g.edge')
      .data(EDGES).join('g').attr('class', 'edge').style('cursor', 'pointer')
    edgeSelRef.current = edgeSel

    edgeSel.append('line').attr('class', 'edge-line')
      .attr('stroke', d => d.color ?? '#1e2d4a')
      .attr('stroke-width', d => bwWidth(d.props.bandwidth))
      .attr('stroke-dasharray', d => d.dashed ? '8 5' : null)
      .attr('marker-end', 'url(#arrow)')

    // wider invisible hit area for hover
    edgeSel.append('line').attr('class', 'edge-hit')
      .attr('stroke', 'transparent').attr('stroke-width', 14)

    edgeSel
      .on('mouseenter', function(event: MouseEvent, d) {
        const r = cref.current!.getBoundingClientRect()
        setEdgeTip({ x: event.clientX - r.left, y: event.clientY - r.top, edge: d,
          util: edgeUtilRef.current.get(d.id) ?? 0 })
      })
      .on('mousemove', function(event: MouseEvent, d) {
        const r = cref.current!.getBoundingClientRect()
        setEdgeTip({ x: event.clientX - r.left, y: event.clientY - r.top, edge: d,
          util: edgeUtilRef.current.get(d.id) ?? 0 })
      })
      .on('mouseleave', () => setEdgeTip(null))

    // OSPF: long-press a link (500ms) to break it; click a broken link to restore.
    const lpTimers = new Map<string, ReturnType<typeof setTimeout>>()
    edgeSel
      .on('mousedown', function(event: MouseEvent, d) {
        if (!ospfActiveRef.current || failedEdgesRef.current.has(d.id)) return
        event.stopPropagation()   // don't let d3-zoom start a pan; keep the long-press alive
        const tm = setTimeout(() => {
          lpTimers.delete(d.id)
          failedEdgesRef.current.add(d.id)
          // drop packets currently on the broken edge (with ✕ shards)
          packetsRef.current = packetsRef.current.filter(p => {
            const e = EDGE_BY_PAIR.get(pairKey(p.nodes[p.seg], p.nodes[p.seg + 1]))
            if (e && e.id === d.id) { dropShards(p); return false }
            return true
          })
          const sl = NODE_MAP.get(d.source)?.label ?? d.source
          const tl = NODE_MAP.get(d.target)?.label ?? d.target
          const reconv = 100 + Math.floor(Math.random() * 400)
          setLog(prev => [`⚠ LINK DOWN: ${sl}→${tl} | OSPF RECONVERGE: ${reconv}ms`, ...prev].slice(0, 3))
          runDijkstra(); styleEdgesRef.current()
        }, 500)
        lpTimers.set(d.id, tm)
      })
      .on('mouseup mouseleave', function(_event: MouseEvent, d) {
        const tm = lpTimers.get(d.id); if (tm) { clearTimeout(tm); lpTimers.delete(d.id) }
      })
      .on('click', function(_event: MouseEvent, d) {
        if (!ospfActiveRef.current) return
        if (failedEdgesRef.current.has(d.id)) {
          failedEdgesRef.current.delete(d.id)
          const sl = NODE_MAP.get(d.source)?.label ?? d.source
          const tl = NODE_MAP.get(d.target)?.label ?? d.target
          setLog(prev => [`✓ LINK UP: ${sl}→${tl}`, ...prev].slice(0, 3))
          runDijkstra(); styleEdgesRef.current()
        }
      })

    // Position edges (trim endpoints so arrow clears node)
    edgeSel.each(function(d) {
      const s = pos(d.source); const t = pos(d.target)
      const dx = t.x - s.x; const dy = t.y - s.y
      const len = Math.hypot(dx, dy) || 1
      const ux = dx / len; const uy = dy / len
      const x1 = s.x + ux * TRIM, y1 = s.y + uy * TRIM
      const x2 = t.x - ux * TRIM, y2 = t.y - uy * TRIM
      d3.select(this).selectAll('line')
        .attr('x1', x1).attr('y1', y1).attr('x2', x2).attr('y2', y2)
    })

    // ── Packet & shard layers ──
    const pktGroup   = g.append('g'); pktGroupRef.current = pktGroup
    const shardGroup = g.append('g'); shardGroupRef.current = shardGroup

    // ── OSPF weight labels (visible only in OSPF mode) ──
    const wgtGroup = g.append('g').attr('class', 'weights').attr('opacity', 0)
      .style('display', 'none')
    wgtGroupRef.current = wgtGroup
    const wgtSel = wgtGroup.selectAll<SVGGElement, NetEdge>('g').data(EDGES).join('g')
      .style('cursor', 'text')
      .attr('transform', d => { const s = pos(d.source), t = pos(d.target); return `translate(${(s.x + t.x) / 2},${(s.y + t.y) / 2})` })
    wgtSelRef.current = wgtSel
    wgtSel.append('rect').attr('x', -15).attr('y', -10).attr('width', 30).attr('height', 20).attr('rx', 2)
      .attr('fill', '#0d1424').attr('stroke', '#00b4ff').attr('stroke-width', 1)
    wgtSel.append('text').attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
      .attr('fill', '#00b4ff').attr('font-family', '"Press Start 2P", cursive').attr('font-size', '8px')
      .style('pointer-events', 'none')
      .text(d => String(edgeWeightsRef.current.get(d.id) ?? '?'))
    wgtSel.on('mousedown', function(event: MouseEvent, d) {
      if (!ospfActiveRef.current) return
      event.stopPropagation()
      const r = cref.current!.getBoundingClientRect()
      setEditingEdge({ id: d.id, x: event.clientX - r.left, y: event.clientY - r.top,
        value: String(edgeWeightsRef.current.get(d.id) ?? 10) })
    })

    // ── Nodes ──
    const nodeSel = g.append('g').selectAll<SVGGElement, NetNode>('g.node')
      .data(NODES).join('g').attr('class', 'node').style('cursor', 'pointer')
      .attr('transform', d => `translate(${d.x},${d.y})`)
    nodeSelRef.current = nodeSel

    nodeSel.append('rect').attr('class', 'node-body')
      .attr('x', -HALF).attr('y', -HALF).attr('width', NODE_SIZE).attr('height', NODE_SIZE)
      .attr('rx', 3)
      .attr('fill', d => NODE_COLOR[d.type]).attr('fill-opacity', 0.12)
      .attr('stroke', d => d.blocked ? '#ff4444' : NODE_COLOR[d.type])
      .attr('stroke-width', d => d.blocked ? 3 : 2)
      .style('filter', d => `drop-shadow(0 0 6px ${NODE_COLOR[d.type]}88)`)

    // ТСПУ flash overlay rect
    nodeSel.filter(d => d.type === 'ТСПУ').append('rect').attr('class', 'tspu-flash')
      .attr('x', -HALF).attr('y', -HALF).attr('width', NODE_SIZE).attr('height', NODE_SIZE)
      .attr('rx', 3).attr('fill', '#ff4444').attr('opacity', 0).style('pointer-events', 'none')

    // BLOCKED tag
    nodeSel.filter(d => !!d.blocked).append('text')
      .text('BLOCKED').attr('text-anchor', 'middle').attr('y', -HALF - 8)
      .attr('fill', '#ff4444').attr('font-family', '"Share Tech Mono", monospace')
      .attr('font-size', '10px').style('pointer-events', 'none')

    nodeSel.append('text')
      .text(d => d.label).attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
      .attr('fill', d => NODE_COLOR[d.type])
      .attr('font-family', '"Press Start 2P", cursive')
      .attr('font-size', d => d.label.length > 3 ? '9px' : '16px')
      .style('pointer-events', 'none')

    nodeSel.append('text')
      .text(d => d.sublabel).attr('text-anchor', 'middle').attr('y', HALF + 16)
      .attr('fill', d => NODE_COLOR[d.type]).attr('fill-opacity', 0.85)
      .attr('font-family', '"Share Tech Mono", monospace').attr('font-size', '12px')
      .style('pointer-events', 'none')

    // selection ring
    nodeSel.append('rect').attr('class', 'sel-ring')
      .attr('x', -HALF - 5).attr('y', -HALF - 5).attr('width', NODE_SIZE + 10).attr('height', NODE_SIZE + 10)
      .attr('rx', 4).attr('fill', 'none').attr('stroke', 'transparent').attr('stroke-width', 2)
      .style('pointer-events', 'none')

    nodeSel
      .on('click', (_e: MouseEvent, d) => {
        if (ospfActiveRef.current) {
          // OSPF mode: pick SOURCE then DESTINATION
          const st = useStore.getState()
          if (!ospfSrcRef.current)            st.setOspfSrc(d.id)
          else if (ospfSrcRef.current === d.id) { st.clearOspf() }
          else                                st.setOspfDst(d.id)
          updateRingsRef.current()
          return
        }
        useStore.getState().setSelectedNode(useStore.getState().selectedNodeId === d.id ? null : d.id)
      })
      .on('mouseenter', function(event: MouseEvent, d) {
        if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current)
        const cx = event.clientX, cy = event.clientY
        tooltipTimerRef.current = setTimeout(() => {
          const r = cref.current!.getBoundingClientRect()
          setNodeTip({ x: cx - r.left, y: cy - r.top, node: d })
        }, 200)
      })
      .on('mouseleave', () => {
        if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current)
        setNodeTip(null)
      })

    // ── OSPF edge styling + node selection rings ──
    styleEdgesRef.current = () => {
      if (!edgeSelRef.current) return
      const active = ospfActiveRef.current
      const path   = ospfPathIdsRef.current
      edgeSelRef.current.select('.edge-line')
        .attr('stroke', (d: NetEdge) => {
          if (failedEdgesRef.current.has(d.id)) return '#ff4444'
          if (active && path.has(d.id))         return '#00e676'
          if (active)                            return d.color ?? '#1e2d4a'
          return d.color ?? utilColor(edgeUtilRef.current.get(d.id) ?? 0)
        })
        .attr('stroke-opacity', (d: NetEdge) => {
          if (!active || path.size === 0) return 1
          return path.has(d.id) || failedEdgesRef.current.has(d.id) ? 1 : 0.2
        })
        .attr('stroke-width', (d: NetEdge) => {
          const w = bwWidth(d.props.bandwidth)
          return active && path.has(d.id) ? w + 1.5 : w
        })
        .attr('stroke-dasharray', (d: NetEdge) =>
          failedEdgesRef.current.has(d.id) ? '6 5' : (d.dashed ? '8 5' : null))
    }
    updateRingsRef.current = () => {
      if (!nodeSelRef.current) return
      nodeSelRef.current.select('.sel-ring').attr('stroke', (d: NetNode) => {
        if (ospfActiveRef.current) {
          if (d.id === ospfSrcRef.current) return '#00e676'
          if (d.id === ospfDstRef.current) return '#00b4ff'
          return 'transparent'
        }
        return d.id === useStore.getState().selectedNodeId ? NODE_COLOR[d.type] : 'transparent'
      })
    }

    // ── Zoom ──
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 2])
      .on('zoom', event => {
        g.attr('transform', event.transform)
        setZoomLevel(Math.round(event.transform.k * 100) / 100)
        setEdgeTip(null); setNodeTip(null); setPktTip(null)
      })
    zoomBehRef.current = zoom; svg.call(zoom)

    fitToView(false)

    // ── Animation loop ──
    let frame = 0
    function loop(now: number) {
      const dt = lastRafRef.current ? now - lastRafRef.current : 16
      lastRafRef.current = now
      const frozen = isPausedRef.current; const spd = speedRef.current
      frame++

      const pkts = packetsRef.current
      // spawn
      if (!frozen && now - lastSpawnRef.current > SPAWN_MS && pkts.length < MAX_PACKETS) {
        spawnPacket(); lastSpawnRef.current = now
      }

      // advance packets
      const survivors: Packet[] = []
      let cDel = 0, cBlk = 0, cDns = 0, cVpn = 0
      const edgeLoad = new Map<string, number>()
      for (const p of pkts) {
        const a = p.nodes[p.seg], b = p.nodes[p.seg + 1]
        const segEdge = b ? EDGE_BY_PAIR.get(pairKey(a, b)) : undefined
        if (segEdge) edgeLoad.set(segEdge.id, (edgeLoad.get(segEdge.id) ?? 0) + 1)
        // OSPF: drop packets traversing a broken link
        if (segEdge && failedEdgesRef.current.has(segEdge.id)) { dropShards(p); continue }
        if (frozen) { survivors.push(p); continue }
        const dur = segDuration(a, b) / spd
        p.segElapsed += dt
        if (p.segElapsed < dur) { survivors.push(p); continue }
        // segment complete → arrive at b
        p.seg++; p.segElapsed = 0
        const arrived = p.nodes[p.seg]
        if (p.kind === 'dns') bounce(arrived, 150, 0.15)
        if (p.seg >= p.nodes.length - 1) {
          // final arrival
          const stat = nodeStatsRef.current.get(arrived)!
          if (p.kind === 'http')   { cDel++; stat.passed++ }
          if (p.kind === 'tunnel') { cVpn++; cDel++; stat.passed++ }
          if (p.kind === 'dns')    { cDns++; stat.passed++ }
          if (p.kind === 'blocked') {
            // reached ТСПУ → shatter
            cBlk++; stat.blocked++
            spawnShards(arrived)
            tspuFlashRef.current = now
            const uType = NODE_TYPE_MAP.get(p.nodes[0]) ?? p.nodes[0]
            setLog(prev => [`✕ BLOCKED: ${uType}→blocked.com | SNI detected`, ...prev].slice(0, 3))
            counterRef.current.blocked++
            onTspuBlocked(counterRef.current.blocked)
          }
          continue // remove
        }
        survivors.push(p)
      }
      packetsRef.current = survivors

      if (cDel || cBlk || cDns || cVpn) {
        counterRef.current.delivered += cDel
        counterRef.current.dns       += cDns
        counterRef.current.vpn       += cVpn
        setCounters({ ...counterRef.current })
        if (frame % 6 === 0) { onNodeStats(new Map(nodeStatsRef.current)); setStatsState(new Map(nodeStatsRef.current)) }
      }

      // ── Utilization smoothing + edge colour ──
      if (frame % 3 === 0) {
        for (const e of EDGES) {
          const load = edgeLoad.get(e.id) ?? 0
          const target = Math.min(100, load * 26)
          const cur = edgeUtilRef.current.get(e.id) ?? 0
          edgeUtilRef.current.set(e.id, cur + 0.1 * (target - cur))
        }
        // In OSPF mode the path/failure colouring takes priority over utilisation.
        if (ospfActiveRef.current) styleEdgesRef.current()
        else if (edgeSelRef.current) {
          edgeSelRef.current.select('.edge-line').attr('stroke', (d: NetEdge) => {
            if (d.color) return d.color
            return utilColor(edgeUtilRef.current.get(d.id) ?? 0)
          })
        }
      }

      // ── Node bounce + ТСПУ flash ──
      if (nodeSelRef.current) {
        nodeSelRef.current.attr('transform', (d: NetNode) => {
          const bd = bouncesRef.current.get(d.id)
          let s = 1
          if (bd) {
            const age = now - bd.start
            if (age >= bd.dur) bouncesRef.current.delete(d.id)
            else s = 1 + bd.amp * Math.sin(Math.PI * (age / bd.dur))
          }
          return `translate(${d.x},${d.y}) scale(${s})`
        })
        if (tspuFlashRef.current) {
          const age = now - tspuFlashRef.current
          const op = age < 300 ? (1 - age / 300) * 0.85 : 0
          if (age >= 300) tspuFlashRef.current = 0
          nodeSelRef.current.select('.tspu-flash').attr('opacity', op)
        }
      }

      // ── Render packets ──
      if (pktGroupRef.current) {
        pktGroupRef.current.selectAll<SVGGElement, Packet>('g.pkt')
          .data(packetsRef.current, d => d.id)
          .join(
            enter => {
              const grp = enter.append('g').attr('class', 'pkt').style('cursor', 'crosshair')
              grp.append('rect').attr('class', 'pkt-out').attr('fill', 'none').attr('rx', 1)
              grp.append('rect').attr('class', 'pkt-body').attr('rx', 1)
              grp
                .on('mouseenter mousemove', function(event: MouseEvent, d) {
                  const r = cref.current!.getBoundingClientRect()
                  setPktTip({ x: event.clientX - r.left, y: event.clientY - r.top, pkt: d })
                })
                .on('mouseleave', () => setPktTip(null))
              return grp
            },
            update => update, exit => exit.remove()
          )
          .each(function(d) {
            const a = d.nodes[d.seg], b = d.nodes[d.seg + 1]
            if (!b) return
            const pa = pos(a), pb = pos(b)
            const dur = segDuration(a, b) / speedRef.current
            let t = Math.min(d.segElapsed / dur, 1)
            if (d.seg === 0) t = easeOutCubic(t) // "shot" launch from user
            const x = pa.x + (pb.x - pa.x) * t
            const y = pa.y + (pb.y - pa.y) * t
            const tunneled = d.kind === 'tunnel' && isTunnelSegment(a, b)
            const color = tunneled ? '#9c6bff' : PKT_COLOR[d.kind]
            // 6px live, 8px on pause + pulsing outline for easier hover
            const size = frozen ? 8 : 6
            const pulse = frozen ? (Math.sin(now / 300) * 0.5 + 0.5) : 0
            const el = d3.select(this)
            el.select('.pkt-body')
              .attr('x', x - size / 2).attr('y', y - size / 2).attr('width', size).attr('height', size)
              .attr('fill', color).style('filter', `drop-shadow(0 0 4px ${color})`)
            el.select('.pkt-out')
              .attr('x', x - size / 2 - 3).attr('y', y - size / 2 - 3)
              .attr('width', size + 6).attr('height', size + 6)
              .attr('stroke', tunneled ? '#9c6bff' : color)
              .attr('stroke-width', tunneled ? 1.5 : frozen ? 1 + pulse * 1.5 : 0)
              .attr('opacity', tunneled ? 0.9 : frozen ? 0.3 + pulse * 0.6 : 0)
          })
      }

      // ── Render shards ──
      if (shardGroupRef.current) {
        shardsRef.current = shardsRef.current.filter(s => now - s.start < 400)
        shardGroupRef.current.selectAll<SVGRectElement, Shard>('rect')
          .data(shardsRef.current, (_d, i) => i)
          .join('rect')
          .attr('width', 3).attr('height', 3)
          .attr('fill', d => d.color)
          .attr('x', d => { const age = now - d.start; return d.x + d.vx * age - 1.5 })
          .attr('y', d => { const age = now - d.start; return d.y + d.vy * age - 1.5 })
          .attr('opacity', d => { const age = now - d.start; return Math.max(0, 1 - age / 400) })
      }

      rafRef.current = requestAnimationFrame(loop)
    }

    function spawnShards(id: string) {
      const p = pos(id)
      const dirs = [[-1, -1], [1, -1], [-1, 1], [1, 1]]
      for (const [dx, dy] of dirs) {
        shardsRef.current.push({ x: p.x, y: p.y, vx: dx * 0.08, vy: dy * 0.08,
          start: performance.now(), color: '#ff4444' })
      }
    }

    // drop a packet mid-flight on a broken link (✕ burst at its position)
    function dropShards(p: Packet) {
      const a = p.nodes[p.seg], b = p.nodes[p.seg + 1]
      if (!b) return
      const pa = pos(a), pb = pos(b)
      const t = Math.min(p.segElapsed / (segDuration(a, b) / speedRef.current), 1)
      const x = pa.x + (pb.x - pa.x) * t, y = pa.y + (pb.y - pa.y) * t
      const dirs = [[-1, -1], [1, -1], [-1, 1], [1, 1]]
      for (const [dx, dy] of dirs) {
        shardsRef.current.push({ x, y, vx: dx * 0.08, vy: dy * 0.08,
          start: performance.now(), color: '#ff4444' })
      }
    }

    rafRef.current = requestAnimationFrame(loop)

    // resize handling
    const ro = new ResizeObserver(() => fitToView(false))
    if (cref.current) ro.observe(cref.current)

    return () => { cancelAnimationFrame(rafRef.current); ro.disconnect() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Fit the 1280×1000 canvas into the visible container ──
  const fitToView = useCallback((animate: boolean) => {
    if (!svgRef.current || !zoomBehRef.current || !cref.current) return
    const rect = cref.current.getBoundingClientRect()
    if (rect.width < 10) return
    const scale = Math.min(rect.width / CANVAS_W, rect.height / CANVAS_H) * 0.94
    const k = Math.max(0.3, Math.min(2, scale))
    const tx = (rect.width  - CANVAS_W * k) / 2
    const ty = (rect.height - CANVAS_H * k) / 2
    const transform = d3.zoomIdentity.translate(tx, ty).scale(k)
    const sel = d3.select(svgRef.current)
    if (animate) sel.transition().duration(400).call(zoomBehRef.current.transform, transform)
    else sel.call(zoomBehRef.current.transform, transform)
  }, [])

  // ── Selection ring sync ──
  useEffect(() => {
    if (!nodeSelRef.current || ospfActive) return
    nodeSelRef.current.select('.sel-ring').attr('stroke', (d: NetNode) =>
      d.id === selectedNodeId ? NODE_COLOR[d.type] : 'transparent')
  }, [selectedNodeId, ospfActive])

  // ── OSPF mode reactivity: weight visibility, edge styling, rings ──
  useEffect(() => {
    if (wgtGroupRef.current) {
      wgtGroupRef.current.style('display', ospfActive ? 'inline' : 'none').attr('opacity', ospfActive ? 1 : 0)
    }
    styleEdgesRef.current()
    updateRingsRef.current()
  }, [ospfActive, ospfSrcId, ospfDstId, ospfPath])

  return (
    <div ref={cref} className="w-full h-full" style={{ position: 'relative' }}>
      <svg ref={svgRef} className="w-full h-full" style={{ background: 'transparent' }} />
      {edgeTip && <EdgeCard tip={edgeTip} cref={cref} />}
      {nodeTip && <NodeTip tip={nodeTip} cref={cref} stats={statsState} />}
      {pktTip && <PktTooltip tip={pktTip} cref={cref} paused={paused} />}
      {ospfActive && <OspfBadge />}
      {ospfActive && ospfPath && <OspfBanner path={ospfPath.nodes} cost={ospfPath.cost} />}
      {editingEdge && <WeightEditor edge={editingEdge} onCommit={commitWeight} onCancel={() => setEditingEdge(null)} />}
      <EventLog entries={log} />
      <Counters c={counters} />
      <ControlBar zoom={zoomLevel} onZoom={applyZoom} onFit={() => fitToView(true)} onToggleOspf={toggleOspf} ospfActive={ospfActive} />
    </div>
  )
}
