import React, { useEffect, useRef, useState, useCallback } from 'react'
import * as d3 from 'd3'
import {
  NODES, LINKS, NetNode, NetLink, NODE_COLOR, NODE_LABEL, NODE_TYPE_MAP,
  edgeKey, nid, linkEdgeKey, ospfCost, utilColor, bwWidth, NodeType,
} from './data/topology'
import { useStore } from './store'
import EncapView from './components/EncapView'
import ControlBar from './components/ControlBar'

// ─── Packet types ──────────────────────────────────────────────────────────────

type PacketType = 'TCP' | 'UDP' | 'DNS' | 'BLOCKED'

interface Packet {
  id: number; sourceId: string; targetId: string; ptype: PacketType
  elapsedMs: number; bytes: number; ttl: number
}

const PKT_COLOR: Record<PacketType, string> = {
  TCP: '#00b4ff', UDP: '#00e676', DNS: '#ffb300', BLOCKED: '#ff4444',
}

const TSPU_IDS = new Set(NODES.filter(n => n.type === 'ТСПУ').map(n => n.id))
const DNS_IDS  = new Set(NODES.filter(n => ['DNS_R','DNS_ROOT','DNS_TLD','DNS_AUTH'].includes(n.type)).map(n => n.id))

function pickPktType(src: string, tgt: string): PacketType {
  if (TSPU_IDS.has(tgt) || TSPU_IDS.has(src)) return 'BLOCKED'
  if (DNS_IDS.has(tgt)  || DNS_IDS.has(src))  return 'DNS'
  return Math.random() < 0.5 ? 'TCP' : 'UDP'
}

function randomPacket(id: number, failedLinks: Set<string>): Packet | null {
  const pool = LINKS.filter(l => {
    const key = edgeKey(nid(l.source), nid(l.target))
    return !failedLinks.has(key)
  })
  if (!pool.length) return null
  const l     = pool[Math.floor(Math.random() * pool.length)]
  const flip  = Math.random() < 0.5
  const srcId = flip ? nid(l.target) : nid(l.source)
  const tgtId = flip ? nid(l.source) : nid(l.target)
  return {
    id, sourceId: srcId, targetId: tgtId,
    ptype: pickPktType(srcId, tgtId), elapsedMs: 0,
    bytes: [64, 128, 256, 512, 1460][Math.floor(Math.random() * 5)],
    ttl:   Math.floor(Math.random() * 50) + 10,
  }
}

// ─── Dijkstra ─────────────────────────────────────────────────────────────────

function dijkstra(
  nodeIds: string[], links: NetLink[], weights: Map<string, number>,
  failed: Set<string>, src: string, dst: string,
): { path: string[]; cost: number } | null {
  const dist = new Map<string, number>(nodeIds.map(n => [n, Infinity]))
  const prev = new Map<string, string>()
  const unvisited = new Set(nodeIds)
  dist.set(src, 0)
  while (unvisited.size > 0) {
    let u = ''; let minD = Infinity
    for (const n of unvisited) { const d = dist.get(n)!; if (d < minD) { minD = d; u = n } }
    if (!u || minD === Infinity) break; if (u === dst) break
    unvisited.delete(u)
    for (const l of links) {
      const s = nid(l.source); const t = nid(l.target)
      const nb = s === u ? t : t === u ? s : null
      if (!nb || !unvisited.has(nb)) continue
      const k = edgeKey(u, nb); if (failed.has(k)) continue
      const alt = dist.get(u)! + (weights.get(k) ?? 10)
      if (alt < dist.get(nb)!) { dist.set(nb, alt); prev.set(nb, u) }
    }
  }
  if (dist.get(dst) === Infinity) return null
  const path: string[] = []; let cur: string | undefined = dst
  while (cur) { path.unshift(cur); cur = prev.get(cur) }
  return { path, cost: dist.get(dst)! }
}

function pathKeys(path: string[]): Set<string> {
  const s = new Set<string>()
  for (let i = 0; i < path.length - 1; i++) s.add(edgeKey(path[i], path[i + 1]))
  return s
}

// ─── HUD counter ─────────────────────────────────────────────────────────────

function Counter({ delivered, blocked }: { delivered: number; blocked: number }) {
  return (
    <div style={{ position: 'absolute', bottom: 16, left: 16, zIndex: 50,
      fontFamily: '"Share Tech Mono", monospace', fontSize: 13,
      display: 'flex', flexDirection: 'column', gap: 4, pointerEvents: 'none' }}>
      <span style={{ color: '#00e676', textShadow: '0 0 8px #00e676', letterSpacing: '0.15em' }}>
        PACKETS DELIVERED: {delivered}
      </span>
      <span style={{ color: '#ff4444', textShadow: '0 0 8px #ff4444', letterSpacing: '0.15em' }}>
        BLOCKED: {blocked}
      </span>
    </div>
  )
}

// ─── Edge hover card ─────────────────────────────────────────────────────────

function EdgeCard({ tip, cref }: {
  tip: { x: number; y: number; link: NetLink; util: number }
  cref: React.RefObject<HTMLDivElement>
}) {
  const { link, util } = tip
  const props  = link.props
  const srcType = NODE_TYPE_MAP.get(nid(link.source)) ?? nid(link.source)
  const tgtType = NODE_TYPE_MAP.get(nid(link.target)) ?? nid(link.target)
  const cost   = ospfCost(props.bandwidth)
  const bars   = Math.round(util / 10)
  const bar    = '█'.repeat(bars) + '░'.repeat(10 - bars)
  const uColor = utilColor(util)
  const PAD = 12; const cardW = 320; const cardH = 280
  const rect = cref.current?.getBoundingClientRect()
  const cw = rect?.width ?? window.innerWidth; const ch = rect?.height ?? window.innerHeight
  let left = tip.x + PAD; let top = tip.y + PAD
  if (left + cardW > cw) left = tip.x - cardW - PAD
  if (top  + cardH > ch) top  = tip.y - cardH - PAD

  return (
    <div style={{ position: 'absolute', left, top, width: cardW, zIndex: 200,
      background: '#0d1424', border: '1.5px solid #1e2d4a',
      boxShadow: '0 0 16px #00b4ff22', padding: '12px 16px', pointerEvents: 'none' }}>
      <div style={{ fontFamily: '"Press Start 2P", cursive', fontSize: 9,
        color: '#00b4ff', marginBottom: 10 }}>
        {srcType} → {tgtType}
      </div>
      <div style={{ fontSize: 10, color: '#4a6a8a', marginBottom: 8, letterSpacing: '0.1em' }}>
        {props.channelType}
      </div>
      <div style={{ borderTop: '1px solid #1e2d4a', margin: '8px 0' }} />
      {[
        { k: 'BW',      v: `${props.bandwidth >= 1000 ? props.bandwidth / 1000 + ' Гбит/с' : props.bandwidth + ' Мбит/с'}` },
        { k: 'LATENCY', v: `${props.latency} мс` },
        { k: 'LOSS',    v: `${props.loss}%` },
        { k: 'UTIL',    v: <span style={{ color: uColor }}>{bar} {util.toFixed(0)}%</span> },
        { k: 'RTT',     v: `${(props.latency * 2).toFixed(1)} мс` },
      ].map(({ k, v }) => (
        <div key={k} style={{ display: 'flex', gap: 8,
          fontFamily: '"Share Tech Mono", monospace', fontSize: 11, lineHeight: '1.9' }}>
          <span style={{ color: '#4a6a8a', minWidth: 72, flexShrink: 0 }}>{k}:</span>
          <span style={{ color: '#c8d8f0' }}>{v}</span>
        </div>
      ))}
      <div style={{ borderTop: '1px solid #1e2d4a', margin: '8px 0' }} />
      <div style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 10, color: '#4a6a8a' }}>
        OSPF COST = 10G / BW = <span style={{ color: '#00e676' }}>{cost}</span>
      </div>
    </div>
  )
}

// ─── OSPF path banner ─────────────────────────────────────────────────────────

function OspfBanner({ path, cost }: { path: string[]; cost: number }) {
  const names = path.map(id => NODE_TYPE_MAP.get(id) ?? id).join(' → ')
  return (
    <div style={{ position: 'absolute', top: 52, left: '50%', transform: 'translateX(-50%)',
      fontFamily: '"Share Tech Mono", monospace', fontSize: 11, color: '#00e676',
      background: '#0d1424', border: '1.5px solid #00e676',
      boxShadow: '0 0 14px #00e67644', padding: '6px 16px', zIndex: 60,
      pointerEvents: 'none', whiteSpace: 'nowrap' }}>
      МАРШРУТ OSPF&nbsp;|&nbsp;{names}&nbsp;|&nbsp;ВЕС: {cost}
    </div>
  )
}

// ─── OSPF badge / log ─────────────────────────────────────────────────────────

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

function OspfLog({ entries }: { entries: string[] }) {
  if (!entries.length) return null
  return (
    <div style={{ position: 'absolute', bottom: 72, left: '50%', transform: 'translateX(-50%)',
      fontFamily: '"Share Tech Mono", monospace', fontSize: 10, color: '#ff8888',
      background: '#0d1424', border: '1px solid #ff444433', padding: '4px 14px',
      zIndex: 60, pointerEvents: 'none', display: 'flex', flexDirection: 'column', gap: 2 }}>
      {entries.map((e, i) => <span key={i}>{e}</span>)}
    </div>
  )
}

// ─── Weight editor ────────────────────────────────────────────────────────────

function WeightEditor({ edge, onCommit, onCancel }: {
  edge: { key: string; x: number; y: number; value: string }
  onCommit: (key: string, v: number) => void
  onCancel: () => void
}) {
  const [val, setVal] = useState(edge.value)
  return (
    <input autoFocus value={val} onChange={e => setVal(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter') { const n = parseInt(val, 10); if (!isNaN(n) && n > 0 && n <= 999) onCommit(edge.key, n); else onCancel() }
        if (e.key === 'Escape') onCancel()
      }}
      onBlur={onCancel}
      style={{ position: 'absolute', left: edge.x - 24, top: edge.y - 14, width: 52, height: 28,
        zIndex: 300, fontFamily: '"Press Start 2P", cursive', fontSize: 9,
        background: '#0d1424', border: '1.5px solid #00e676', color: '#00e676',
        textAlign: 'center', outline: 'none', boxShadow: '0 0 10px #00e67666' }}
    />
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

const SIZE = 36
const PKT_SIZE_LIVE  = 6
const PKT_SIZE_PAUSE = 8
const SPAWN_INTERVAL = 700
const PKT_DURATION   = 1500
const MAX_PACKETS    = 18

interface Props {
  onNodeStats: (stats: Map<string, { passed: number; blocked: number }>) => void
}

export default function NetworkGraph({ onNodeStats }: Props) {
  const svgRef      = useRef<SVGSVGElement>(null)
  const cref        = useRef<HTMLDivElement>(null)
  const zoomBehRef  = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const nodePos     = useRef<Map<string, { x: number; y: number }>>(new Map())
  const packetsRef  = useRef<Packet[]>([])
  const pktGroupRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null)
  const linkSelRef  = useRef<d3.Selection<SVGLineElement, NetLink, SVGGElement, unknown> | null>(null)
  const wgtGroupRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null)
  const nodeSelRef  = useRef<d3.Selection<SVGGElement, NetNode, SVGGElement, unknown> | null>(null)
  const pinnedRef   = useRef<Set<string>>(new Set())

  // OSPF
  const ospfWeightsRef = useRef<Map<string, number>>(
    new Map(LINKS.map(l => [edgeKey(nid(l.source), nid(l.target)), ospfCost(l.props.bandwidth)]))
  )
  const failedLinksRef   = useRef<Set<string>>(new Set())
  const ospfPathKeysRef  = useRef<Set<string>>(new Set())
  const ospfPathNodesRef = useRef<string[]>([])
  const ospfCostRef      = useRef(0)
  const updateLinksRef   = useRef<() => void>(() => {})
  const updateNodesRef   = useRef<() => void>(() => {})

  // utilization per edge (0–100)
  const edgeUtilRef = useRef<Map<string, number>>(new Map(LINKS.map(l => [linkEdgeKey(l), 0])))

  // node stats
  const nodeStatsRef = useRef<Map<string, { passed: number; blocked: number }>>(
    new Map(NODES.map(n => [n.id, { passed: 0, blocked: 0 }]))
  )

  // Packet counters
  const nextIdRef    = useRef(0)
  const lastSpawnRef = useRef(0)
  const lastRafRef   = useRef(0)
  const rafRef       = useRef(0)
  const deliveredRef = useRef(0)
  const blockedRef   = useRef(0)
  const dragMovedRef = useRef(false)

  // Store
  const {
    paused, speed, ospfActive, setOspfActive,
    selectedNodeId, setSelectedNode,
    ospfSrcId, ospfDstId, setOspfSrc, setOspfDst, clearOspf,
    protocols,
  } = useStore()

  const isPausedRef = useRef(false)
  const speedRef    = useRef(1)
  const ospfActiveRef = useRef(false)
  const ospfSrcRef  = useRef<string | null>(null)
  const ospfDstRef  = useRef<string | null>(null)
  const protocolsRef = useRef(protocols)

  // Sync refs with store
  useEffect(() => { isPausedRef.current = paused }, [paused])
  useEffect(() => { speedRef.current = speed },     [speed])
  useEffect(() => { ospfActiveRef.current = ospfActive }, [ospfActive])
  useEffect(() => { ospfSrcRef.current = ospfSrcId },  [ospfSrcId])
  useEffect(() => { ospfDstRef.current = ospfDstId },  [ospfDstId])
  useEffect(() => { protocolsRef.current = protocols }, [protocols])

  // React display state
  const [zoomLevel,    setZoomLevel]    = useState(1.0)
  const [pktTip,       setPktTip]       = useState<{ x: number; y: number; pkt: Packet } | null>(null)
  const [edgeTip,      setEdgeTip]      = useState<{ x: number; y: number; link: NetLink; util: number } | null>(null)
  const [editingEdge,  setEditingEdge]  = useState<{ key: string; x: number; y: number; value: string } | null>(null)
  const [counters,     setCounters]     = useState({ delivered: 0, blocked: 0 })
  const [ospfPath,     setOspfPath]     = useState<{ nodes: string[]; cost: number } | null>(null)
  const [ospfLog,      setOspfLog]      = useState<string[]>([])

  const applyZoom = useCallback((delta: number) => {
    if (!svgRef.current || !zoomBehRef.current) return
    const k = d3.zoomTransform(svgRef.current).k
    const next = Math.min(2, Math.max(0.5, Math.round((k + delta) * 10) / 10))
    d3.select(svgRef.current).transition().duration(200).call(zoomBehRef.current.scaleTo, next)
  }, [])

  const runDijkstra = useCallback(() => {
    const src = ospfSrcRef.current; const dst = ospfDstRef.current
    if (!src || !dst) { ospfPathKeysRef.current = new Set(); ospfPathNodesRef.current = []; setOspfPath(null); return }
    const res = dijkstra(NODES.map(n => n.id), LINKS, ospfWeightsRef.current, failedLinksRef.current, src, dst)
    if (res) {
      ospfPathKeysRef.current = pathKeys(res.path)
      ospfPathNodesRef.current = res.path
      ospfCostRef.current = res.cost
      setOspfPath({ nodes: res.path, cost: res.cost })
    } else {
      ospfPathKeysRef.current = new Set(); ospfPathNodesRef.current = []; setOspfPath(null)
    }
    updateLinksRef.current()
  }, [])

  useEffect(() => { if (ospfSrcId && ospfDstId) runDijkstra() }, [ospfSrcId, ospfDstId, runDijkstra])

  useEffect(() => {
    const svg = d3.select(svgRef.current!)
    svg.selectAll('*').remove()
    const { width, height } = svgRef.current!.getBoundingClientRect()
    const nodes: NetNode[] = NODES.map(n => ({ ...n }))
    const links: NetLink[] = LINKS.map(l => ({ ...l }))

    // Initial positions to encourage good layout
    const initPos: Record<string, [number, number]> = {
      user1:    [width * 0.1,  height * 0.45],
      sw1:      [width * 0.22, height * 0.45],
      isp1:     [width * 0.38, height * 0.38],
      tspu1:    [width * 0.5,  height * 0.38],
      vpn1:     [width * 0.65, height * 0.35],
      fw1:      [width * 0.78, height * 0.38],
      ws1:      [width * 0.9,  height * 0.38],
      dnsr1:    [width * 0.2,  height * 0.7],
      dnsroot1: [width * 0.4,  height * 0.78],
      dnstld1:  [width * 0.55, height * 0.72],
      dnsauth1: [width * 0.7,  height * 0.68],
    }
    nodes.forEach(n => {
      const pos = initPos[n.id]
      if (pos) { n.x = pos[0]; n.y = pos[1] }
    })

    const sim = d3.forceSimulation<NetNode>(nodes)
      .force('link',      d3.forceLink<NetNode, NetLink>(links).id(d => d.id).distance(d => {
        const l = d as NetLink; return l.props?.latency > 50 ? 200 : 130
      }))
      .force('charge',    d3.forceManyBody().strength(-350))
      .force('center',    d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide(52))

    const g = svg.append('g')

    // ── Links ──
    const linkSel = g.append('g')
      .selectAll<SVGLineElement, NetLink>('line').data(links).join('line')
      .attr('stroke', '#1e2d4a')
      .attr('stroke-width', d => bwWidth(d.props?.bandwidth ?? 1000))
      .style('cursor', 'pointer')
    linkSelRef.current = linkSel

    const longPressTimers = new Map<string, ReturnType<typeof setTimeout>>()

    linkSel
      .on('mouseenter', function(event: MouseEvent, d) {
        const r = cref.current!.getBoundingClientRect()
        setEdgeTip({ x: event.clientX - r.left, y: event.clientY - r.top, link: d,
          util: edgeUtilRef.current.get(linkEdgeKey(d)) ?? 0 })
      })
      .on('mousemove', function(event: MouseEvent, d) {
        const r = cref.current!.getBoundingClientRect()
        setEdgeTip(prev => prev ? { ...prev, x: event.clientX - r.left, y: event.clientY - r.top,
          util: edgeUtilRef.current.get(linkEdgeKey(d)) ?? 0 } : null)
      })
      .on('mouseleave', () => setEdgeTip(null))
      .on('mousedown', function(event: MouseEvent, d) {
        if (!ospfActiveRef.current) return
        event.stopPropagation()
        const key = linkEdgeKey(d)
        if (failedLinksRef.current.has(key)) return
        const t = setTimeout(() => {
          longPressTimers.delete(key)
          failedLinksRef.current.add(key)
          packetsRef.current = packetsRef.current.filter(p => edgeKey(p.sourceId, p.targetId) !== key)
          const sType = NODE_TYPE_MAP.get(nid(d.source)) ?? nid(d.source)
          const tType = NODE_TYPE_MAP.get(nid(d.target)) ?? nid(d.target)
          const converge = 100 + Math.floor(Math.random() * 400)
          setOspfLog(prev => [`⚠ LINK DOWN: ${sType}→${tType} | OSPF RECONVERGE: ${converge}ms`, ...prev].slice(0, 3))
          runDijkstra(); updateLinksRef.current()
        }, 500)
        longPressTimers.set(key, t)
      })
      .on('mouseup mouseleave', function(_: MouseEvent, d) {
        const key = linkEdgeKey(d); const t = longPressTimers.get(key)
        if (t) { clearTimeout(t); longPressTimers.delete(key) }
      })
      .on('click', function(_: MouseEvent, d) {
        if (!ospfActiveRef.current) return
        const key = linkEdgeKey(d)
        if (failedLinksRef.current.has(key)) {
          failedLinksRef.current.delete(key)
          const sType = NODE_TYPE_MAP.get(nid(d.source)) ?? nid(d.source)
          const tType = NODE_TYPE_MAP.get(nid(d.target)) ?? nid(d.target)
          setOspfLog(prev => [`✓ LINK UP: ${sType}→${tType}`, ...prev].slice(0, 3))
          runDijkstra(); updateLinksRef.current()
        } else if (ospfActiveRef.current) {
          // Click on weight label handled separately
        }
      })

    // ── Packets ──
    const pktGroup = g.append('g'); pktGroupRef.current = pktGroup

    // ── Weight labels ──
    const wgtGroup = g.append('g').attr('opacity', 0)
    wgtGroupRef.current = wgtGroup
    const wgtSel = wgtGroup.selectAll<SVGGElement, NetLink>('g').data(links).join('g')
      .style('cursor', 'text')
    wgtSel.append('rect').attr('x', -14).attr('y', -9).attr('width', 28).attr('height', 17)
      .attr('rx', 2).attr('fill', '#0d1424').attr('stroke', '#1e2d4a').attr('stroke-width', 1)
    wgtSel.append('text').attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
      .attr('fill', '#00b4ff').attr('font-family', '"Press Start 2P", cursive').attr('font-size', '8px')
      .style('pointer-events', 'none')
    wgtSel.on('mousedown', function(event: MouseEvent, d) {
      if (!ospfActiveRef.current) return
      event.stopPropagation()
      const key = linkEdgeKey(d)
      const r = cref.current!.getBoundingClientRect()
      setEditingEdge({ key, x: event.clientX - r.left, y: event.clientY - r.top,
        value: String(ospfWeightsRef.current.get(key) ?? ospfCost(d.props?.bandwidth ?? 1000)) })
    })

    // Drop zone (for ✕ animation)
    const dropGroup = g.append('g')

    // ── Nodes ──
    const nodeSel = g.append('g')
      .selectAll<SVGGElement, NetNode>('g').data(nodes).join('g')
      .style('cursor', 'pointer')
      .on('click', (_: MouseEvent, d) => {
        if (dragMovedRef.current) return
        if (ospfActiveRef.current) {
          if (!ospfSrcRef.current) { setOspfSrc(d.id) }
          else if (ospfSrcRef.current === d.id) { clearOspf(); setOspfPath(null); ospfPathKeysRef.current = new Set() }
          else { setOspfDst(d.id) }
          updateNodesRef.current()
        } else {
          setSelectedNode(selectedNodeId === d.id ? null : d.id)
          const pinned = pinnedRef.current
          if (!pinned.has(d.id)) { pinned.add(d.id); d.fx = d.x; d.fy = d.y }
          else { pinned.delete(d.id); d.fx = null; d.fy = null }
          updateNodesRef.current()
          sim.alphaTarget(0.1).restart(); setTimeout(() => sim.alphaTarget(0), 300)
        }
      })
      .on('mouseenter', (_: MouseEvent, d) => {
        if (!ospfActiveRef.current) setSelectedNode(null)
        // tooltip handled by NodePanel directly
      })
      .call(
        d3.drag<SVGGElement, NetNode>()
          .on('start', (ev, d) => { dragMovedRef.current = false; if (!ev.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y })
          .on('drag',  (ev, d) => { dragMovedRef.current = true; d.fx = ev.x; d.fy = ev.y })
          .on('end',   (ev, d) => { if (!ev.active) sim.alphaTarget(0); if (!pinnedRef.current.has(d.id)) { d.fx = null; d.fy = null } else { d.fx = ev.x; d.fy = ev.y } })
      )
    nodeSelRef.current = nodeSel

    const nodeSize = (type: NodeType) => type === 'DNS_ROOT' || type === 'DNS_TLD' || type === 'DNS_AUTH' ? SIZE - 4 : SIZE

    nodeSel.append('rect')
      .attr('x', d => -nodeSize(d.type) / 2).attr('y', d => -nodeSize(d.type) / 2)
      .attr('width', d => nodeSize(d.type)).attr('height', d => nodeSize(d.type))
      .attr('fill', d => NODE_COLOR[d.type]).attr('fill-opacity', 0.12)
      .attr('stroke', d => NODE_COLOR[d.type]).attr('stroke-width', 2)
      .style('filter', d => `drop-shadow(0 0 6px ${NODE_COLOR[d.type]}88)`)

    nodeSel.append('text')
      .text(d => NODE_LABEL[d.type])
      .attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
      .attr('fill', d => NODE_COLOR[d.type])
      .attr('font-family', '"Press Start 2P", cursive').attr('font-size', '8px')
      .style('pointer-events', 'none')

    nodeSel.append('text')
      .text(d => d.type.replace('_', '-'))
      .attr('text-anchor', 'middle').attr('y', d => nodeSize(d.type) / 2 + 13)
      .attr('fill', d => NODE_COLOR[d.type]).attr('fill-opacity', 0.8)
      .attr('font-family', '"Share Tech Mono", monospace').attr('font-size', '9px')
      .style('pointer-events', 'none')

    // Selection ring
    nodeSel.append('rect').attr('class', 'sel-ring')
      .attr('x', d => -nodeSize(d.type) / 2 - 4).attr('y', d => -nodeSize(d.type) / 2 - 4)
      .attr('width', d => nodeSize(d.type) + 8).attr('height', d => nodeSize(d.type) + 8)
      .attr('fill', 'none').attr('stroke-width', 2).attr('stroke', 'transparent')
      .style('pointer-events', 'none')

    // Pin icon
    nodeSel.append('text').attr('class', 'pin-icon')
      .text('📌').attr('text-anchor', 'middle').attr('y', d => -nodeSize(d.type) / 2 - 8)
      .attr('font-size', '11px').attr('opacity', 0).style('pointer-events', 'none')

    // ── Imperative update functions ──────────────────────────────────────────

    updateLinksRef.current = () => {
      const path  = ospfPathKeysRef.current
      const failed = failedLinksRef.current
      const active = ospfActiveRef.current
      linkSel
        .attr('stroke', (d: NetLink) => {
          const key = linkEdgeKey(d)
          if (failed.has(key)) return '#ff4444'
          if (active && path.has(key)) return '#00e676'
          const util = edgeUtilRef.current.get(key) ?? 0
          return active ? '#1e2d4a' : utilColor(util)
        })
        .attr('stroke-opacity', (d: NetLink) => {
          if (!active || !path.size) return 1
          return path.has(linkEdgeKey(d)) ? 1 : 0.2
        })
        .attr('stroke-width', (d: NetLink) => {
          const key = linkEdgeKey(d)
          if (active && path.has(key)) return bwWidth(d.props?.bandwidth ?? 1000) + 1.5
          return bwWidth(d.props?.bandwidth ?? 1000)
        })
        .attr('stroke-dasharray', (d: NetLink) =>
          failedLinksRef.current.has(linkEdgeKey(d)) ? '6 4' : null)
      wgtGroup.attr('opacity', active ? 1 : 0)
      wgtSel.select('text').text((d: NetLink) =>
        String(ospfWeightsRef.current.get(linkEdgeKey(d)) ?? '?'))
    }

    updateNodesRef.current = () => {
      if (!nodeSelRef.current) return
      nodeSelRef.current.select('.sel-ring').attr('stroke', (d: NetNode) => {
        if (!ospfActiveRef.current) return 'transparent'
        if (d.id === ospfSrcRef.current) return '#00e676'
        if (d.id === ospfDstRef.current) return '#00b4ff'
        return 'transparent'
      })
      nodeSelRef.current.select('.pin-icon').attr('opacity', (d: NetNode) =>
        !ospfActiveRef.current && pinnedRef.current.has(d.id) ? 1 : 0)
    }

    // ── Sim tick ──────────────────────────────────────────────────────────────
    sim.on('tick', () => {
      nodes.forEach(n => nodePos.current.set(n.id, { x: n.x!, y: n.y! }))
      linkSel
        .attr('x1', d => (d.source as NetNode).x!).attr('y1', d => (d.source as NetNode).y!)
        .attr('x2', d => (d.target as NetNode).x!).attr('y2', d => (d.target as NetNode).y!)
      nodeSel.attr('transform', d => `translate(${d.x},${d.y})`)
      wgtSel.attr('transform', (d: NetLink) => {
        const s = nodePos.current.get(nid(d.source)); const t = nodePos.current.get(nid(d.target))
        if (!s || !t) return ''; return `translate(${(s.x + t.x) / 2},${(s.y + t.y) / 2})`
      })
    })

    // ── Zoom ──────────────────────────────────────────────────────────────────
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 2])
      .on('zoom', event => {
        g.attr('transform', event.transform)
        setZoomLevel(Math.round(event.transform.k * 10) / 10)
        setPktTip(null); setEdgeTip(null)
      })
    zoomBehRef.current = zoom; svg.call(zoom)

    // ── Animation loop ────────────────────────────────────────────────────────
    let frameCount = 0

    function animLoop(now: number) {
      const dt     = lastRafRef.current ? now - lastRafRef.current : 0
      lastRafRef.current = now
      const frozen = isPausedRef.current; const spd = speedRef.current
      const pkts   = packetsRef.current;  const pos  = nodePos.current
      const pathK  = ospfPathKeysRef.current
      frameCount++

      // Spawn
      if (!frozen && now - lastSpawnRef.current > SPAWN_INTERVAL && pkts.length < MAX_PACKETS) {
        const p = randomPacket(nextIdRef.current++, failedLinksRef.current)
        if (p) pkts.push(p)
        lastSpawnRef.current = now
      }

      // Update edge packet counts for utilization
      const pktCount = new Map<string, number>()
      for (const p of pkts) {
        const k = edgeKey(p.sourceId, p.targetId)
        pktCount.set(k, (pktCount.get(k) ?? 0) + 1)
      }

      // Update utilization with exponential smoothing
      if (frameCount % 3 === 0) {
        for (const l of LINKS) {
          const k = linkEdgeKey(l)
          const cnt = pktCount.get(k) ?? 0
          const target = Math.min(100, cnt * 22)
          const cur = edgeUtilRef.current.get(k) ?? 0
          edgeUtilRef.current.set(k, cur + 0.08 * (target - cur))
        }
        // Update link colours (not in OSPF mode where path colouring takes priority)
        if (!ospfActiveRef.current) updateLinksRef.current()
      }

      // Advance elapsed / cull / congestion drops
      let dDel = 0, dBlk = 0
      const dropKeys = new Set<string>()
      if (!frozen) {
        packetsRef.current = pkts.filter(p => {
          const k = edgeKey(p.sourceId, p.targetId)
          const util = edgeUtilRef.current.get(k) ?? 0
          // Congestion drop at >80%
          if (util > 80) {
            const dropChance = ((util - 80) / 20) * 0.12
            if (Math.random() < dropChance) {
              dropKeys.add(k + ':' + p.id)
              // log congestion occasionally
              if (Math.random() < 0.03) {
                const sType = NODE_TYPE_MAP.get(p.sourceId) ?? p.sourceId
                const tType = NODE_TYPE_MAP.get(p.targetId) ?? p.targetId
                setOspfLog(prev => [`⚠ CONGESTION: ${sType}→${tType} | LOSS: ${util.toFixed(0)}%`, ...prev].slice(0, 3))
              }
              return false
            }
          }
          const onPathBoost = pathK.size > 0 && pathK.has(k) ? 3 : 1
          p.elapsedMs += dt * spd * onPathBoost
          if (p.elapsedMs >= PKT_DURATION) {
            // Update node stats
            const stat = nodeStatsRef.current.get(p.targetId) ?? { passed: 0, blocked: 0 }
            if (p.ptype === 'BLOCKED') { stat.blocked++; dBlk++ } else { stat.passed++; dDel++ }
            nodeStatsRef.current.set(p.targetId, stat)
            return false
          }
          return true
        })
      }
      if (dDel || dBlk) {
        deliveredRef.current += dDel; blockedRef.current += dBlk
        setCounters({ delivered: deliveredRef.current, blocked: blockedRef.current })
        if (frameCount % 10 === 0) onNodeStats(new Map(nodeStatsRef.current))
      }

      // Drop ✕ animations
      if (dropKeys.size > 0) {
        // Visual ✕ at drop position
        for (const p of pkts) {
          const k = edgeKey(p.sourceId, p.targetId)
          if (!dropKeys.has(k + ':' + p.id)) continue
          const src = pos.get(p.sourceId); const tgt = pos.get(p.targetId)
          if (!src || !tgt) continue
          const t = Math.min(p.elapsedMs / PKT_DURATION, 1)
          const x = src.x + (tgt.x - src.x) * t; const y = src.y + (tgt.y - src.y) * t
          const marker = dropGroup.append('text')
            .text('✕').attr('x', x).attr('y', y)
            .attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
            .attr('fill', '#ff4444').attr('font-family', '"Press Start 2P", cursive').attr('font-size', '10px')
          setTimeout(() => marker.remove(), 600)
        }
      }

      const pulse   = frozen ? (Math.sin(now / 300) * 0.5 + 0.5) : 0
      const pktSize = frozen ? PKT_SIZE_PAUSE : PKT_SIZE_LIVE

      // Render packets
      if (pktGroupRef.current) {
        pktGroupRef.current
          .selectAll<SVGGElement, Packet>('g.pkt')
          .data(packetsRef.current, d => d.id)
          .join(
            enter => {
              const grp = enter.append('g').attr('class', 'pkt').style('cursor', 'crosshair')
              grp.append('rect').attr('class', 'pkt-outline').attr('fill', 'none').attr('rx', 1)
              grp.append('rect').attr('class', 'pkt-body').attr('rx', 1)
              grp.on('mouseenter', function(event: MouseEvent, d) {
                const r = cref.current!.getBoundingClientRect()
                setPktTip({ x: event.clientX - r.left, y: event.clientY - r.top, pkt: d })
              })
              .on('mousemove', function(event: MouseEvent, d) {
                const r = cref.current!.getBoundingClientRect()
                setPktTip({ x: event.clientX - r.left, y: event.clientY - r.top, pkt: d })
              })
              .on('mouseleave', () => setPktTip(null))
              return grp
            },
            update => update,
            exit => exit.remove()
          )
          .each(function(d) {
            const t   = Math.min(d.elapsedMs / PKT_DURATION, 1)
            const src = pos.get(d.sourceId); const tgt = pos.get(d.targetId)
            if (!src || !tgt) return
            const x = src.x + (tgt.x - src.x) * t - pktSize / 2
            const y = src.y + (tgt.y - src.y) * t - pktSize / 2
            const el = d3.select(this)
            el.select('.pkt-body')
              .attr('x', x).attr('y', y).attr('width', pktSize).attr('height', pktSize)
              .attr('fill', PKT_COLOR[d.ptype])
              .style('filter', `drop-shadow(0 0 ${frozen ? 5 : 3}px ${PKT_COLOR[d.ptype]})`)
            el.select('.pkt-outline')
              .attr('x', x - 2).attr('y', y - 2).attr('width', pktSize + 4).attr('height', pktSize + 4)
              .attr('stroke', PKT_COLOR[d.ptype])
              .attr('stroke-width', frozen ? 1 + pulse * 2 : 0)
              .attr('opacity', frozen ? 0.3 + pulse * 0.7 : 0)
          })
      }
      rafRef.current = requestAnimationFrame(animLoop)
    }
    rafRef.current = requestAnimationFrame(animLoop)
    return () => { sim.stop(); cancelAnimationFrame(rafRef.current) }
  }, [runDijkstra, setSelectedNode, clearOspf, setOspfSrc, setOspfDst, onNodeStats])

  // Watch OSPF toggle
  useEffect(() => {
    updateLinksRef.current()
    updateNodesRef.current()
    if (!ospfActive) { clearOspf(); setOspfPath(null); ospfPathKeysRef.current = new Set() }
  }, [ospfActive, clearOspf])

  const commitWeight = useCallback((key: string, val: number) => {
    ospfWeightsRef.current.set(key, val)
    setEditingEdge(null)
    runDijkstra()
    updateLinksRef.current()
  }, [runDijkstra])

  const toggleOspf = useCallback(() => setOspfActive(!ospfActive), [ospfActive, setOspfActive])

  return (
    <div ref={cref} className="w-full h-full" style={{ position: 'relative' }}>
      <svg ref={svgRef} className="w-full h-full" style={{ background: 'transparent' }} />

      {/* Packet encapsulation view */}
      {pktTip && (
        <EncapView
          x={pktTip.x} y={pktTip.y}
          targetId={pktTip.pkt.targetId}
          protocols={protocols}
          cref={cref}
        />
      )}

      {/* Edge hover card */}
      {edgeTip && <EdgeCard tip={edgeTip} cref={cref} />}

      {/* OSPF UI */}
      {ospfActive && <OspfBadge />}
      {ospfActive && ospfPath && <OspfBanner path={ospfPath.nodes} cost={ospfPath.cost} />}
      {ospfLog.length > 0 && <OspfLog entries={ospfLog} />}

      {/* Weight editor */}
      {editingEdge && <WeightEditor edge={editingEdge} onCommit={commitWeight} onCancel={() => setEditingEdge(null)} />}

      {/* Counters */}
      <Counter delivered={counters.delivered} blocked={counters.blocked} />

      {/* Control bar */}
      <ControlBar zoom={zoomLevel} onZoom={applyZoom} onToggleOspf={toggleOspf} />
    </div>
  )
}
