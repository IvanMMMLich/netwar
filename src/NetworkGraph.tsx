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
  const uColor = utilColor(util)
  const cardW = 320; const cardH = 250; const PAD = 14
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
        { k: 'BW',      v: bwLabel(p.bandwidth) },
        { k: 'LATENCY', v: `${p.latency} мс` },
        { k: 'LOSS',    v: `${p.loss}%` },
        { k: 'UTIL',    v: <span style={{ color: uColor }}>{bar} {util.toFixed(0)}%</span> },
      ].map(({ k, v }) => (
        <div key={k} style={{ display: 'flex', gap: 8,
          fontFamily: '"Share Tech Mono", monospace', fontSize: 11, lineHeight: '1.9' }}>
          <span style={{ color: '#4a6a8a', minWidth: 72, flexShrink: 0 }}>{k}:</span>
          <span style={{ color: '#c8d8f0' }}>{v}</span>
        </div>
      ))}
      <div style={{ borderTop: '1px solid #1e2d4a', margin: '8px 0' }} />
      <div style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 10, color: '#4a6a8a' }}>
        OSPF COST: <span style={{ color: '#00e676' }}>{ospfCost(p.bandwidth)}</span>
        <div style={{ fontSize: 9, marginTop: 2 }}>(Cost = 100M / BW)</div>
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

  const nextIdRef = useRef(0)
  const lastSpawnRef = useRef(0)
  const lastRafRef   = useRef(0)
  const rafRef       = useRef(0)
  const counterRef   = useRef({ delivered: 0, blocked: 0, dns: 0, vpn: 0 })
  const tooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { paused, speed, selectedNodeId } = useStore()
  const isPausedRef = useRef(false)
  const speedRef    = useRef(1)
  useEffect(() => { isPausedRef.current = paused }, [paused])
  useEffect(() => { speedRef.current = speed }, [speed])

  const [zoomLevel, setZoomLevel] = useState(1)
  const [counters, setCounters]   = useState({ delivered: 0, blocked: 0, dns: 0, vpn: 0 })
  const [edgeTip, setEdgeTip]     = useState<{ x: number; y: number; edge: NetEdge; util: number } | null>(null)
  const [nodeTip, setNodeTip]     = useState<{ x: number; y: number; node: NetNode } | null>(null)
  const [statsState, setStatsState] = useState<Map<string, { passed: number; blocked: number }>>(new Map())
  const [log, setLog] = useState<string[]>([])

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
    const p: Packet = { id: nextIdRef.current++, kind: tmpl.kind, nodes: tmpl.nodes, seg: 0, segElapsed: 0 }
    packetsRef.current.push(p)
    bounce(p.nodes[0], 200, 0.2)   // User bounce on send
  }, [bounce])

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

    // ── Zoom ──
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 2])
      .on('zoom', event => {
        g.attr('transform', event.transform)
        setZoomLevel(Math.round(event.transform.k * 100) / 100)
        setEdgeTip(null); setNodeTip(null)
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
        if (b) { const e = EDGE_BY_PAIR.get(pairKey(a, b)); if (e) edgeLoad.set(e.id, (edgeLoad.get(e.id) ?? 0) + 1) }
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
        if (edgeSelRef.current) {
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
              const grp = enter.append('g').attr('class', 'pkt')
              grp.append('rect').attr('class', 'pkt-out').attr('fill', 'none').attr('rx', 1)
              grp.append('rect').attr('class', 'pkt-body').attr('rx', 1)
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
            const size = 8
            const el = d3.select(this)
            el.select('.pkt-body')
              .attr('x', x - size / 2).attr('y', y - size / 2).attr('width', size).attr('height', size)
              .attr('fill', color).style('filter', `drop-shadow(0 0 4px ${color})`)
            el.select('.pkt-out')
              .attr('x', x - size / 2 - 3).attr('y', y - size / 2 - 3)
              .attr('width', size + 6).attr('height', size + 6)
              .attr('stroke', '#9c6bff').attr('stroke-width', tunneled ? 1.5 : 0)
              .attr('opacity', tunneled ? 0.9 : 0)
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
    if (!nodeSelRef.current) return
    nodeSelRef.current.select('.sel-ring').attr('stroke', (d: NetNode) =>
      d.id === selectedNodeId ? NODE_COLOR[d.type] : 'transparent')
  }, [selectedNodeId])

  return (
    <div ref={cref} className="w-full h-full" style={{ position: 'relative' }}>
      <svg ref={svgRef} className="w-full h-full" style={{ background: 'transparent' }} />
      {edgeTip && <EdgeCard tip={edgeTip} cref={cref} />}
      {nodeTip && <NodeTip tip={nodeTip} cref={cref} stats={statsState} />}
      <EventLog entries={log} />
      <Counters c={counters} />
      <ControlBar zoom={zoomLevel} onZoom={applyZoom} onFit={() => fitToView(true)} />
    </div>
  )
}
