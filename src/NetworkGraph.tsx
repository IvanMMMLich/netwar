import React, { useEffect, useRef, useState, useCallback } from 'react'
import * as d3 from 'd3'

// ─── Types ────────────────────────────────────────────────────────────────────

type NodeType   = 'Router' | 'Switch' | 'CDN' | 'VPN' | 'DNS' | 'ТСПУ'
type PacketType = 'TCP' | 'UDP' | 'DNS_PKT' | 'BLOCKED'

interface NetNode extends d3.SimulationNodeDatum { id: string; type: NodeType }
interface NetLink extends d3.SimulationLinkDatum<NetNode> {
  source: string | NetNode
  target: string | NetNode
}
interface Packet {
  id:        number
  sourceId:  string
  targetId:  string
  ptype:     PacketType
  startTime: number
  bytes:     number
  ttl:       number
}
interface TooltipState   { x: number; y: number; node: NetNode }
interface PktTooltipState { x: number; y: number; pkt: Packet }

// ─── Constants ────────────────────────────────────────────────────────────────

const NODE_COLOR: Record<NodeType, string> = {
  Router: '#00b4ff', Switch: '#5a7090', CDN: '#00e676',
  VPN: '#9c6bff', DNS: '#ffb300', ТСПУ: '#ff4444',
}
const NODE_LABEL: Record<NodeType, string> = {
  Router: 'R', Switch: 'S', CDN: 'C', VPN: 'V', DNS: 'D', ТСПУ: 'T',
}
const PKT_COLOR: Record<PacketType, string> = {
  TCP: '#00b4ff', UDP: '#00e676', DNS_PKT: '#ffb300', BLOCKED: '#ff4444',
}
const PKT_LABEL: Record<PacketType, string> = {
  TCP: 'TCP', UDP: 'UDP', DNS_PKT: 'DNS', BLOCKED: 'BLOCKED',
}

const NODE_INFO: Record<NodeType, { key: string; value: string }[]> = {
  Router: [
    { key: 'СТАТУС',    value: 'АКТИВЕН' },
    { key: 'УРОВЕНЬ',   value: 'L3 — Сетевой' },
    { key: 'ФУНКЦИЯ',   value: 'Пересылает пакеты по IP-адресу' },
    { key: 'ПРОТОКОЛЫ', value: 'OSPF (внутри AS) / BGP (между AS)' },
    { key: 'МЕХАНИКА',  value: 'Каждый пакет теряет 1 TTL на хопе' },
    { key: 'УГРОЗА',    value: 'BGP Hijack — сосед крадёт маршруты' },
    { key: 'ЗАЩИТА',    value: 'Prefix filtering / Route policy' },
  ],
  Switch: [
    { key: 'СТАТУС',   value: 'АКТИВЕН' },
    { key: 'УРОВЕНЬ',  value: 'L2 — Канальный' },
    { key: 'ФУНКЦИЯ',  value: 'Коммутация по MAC-адресам' },
    { key: 'ТАБЛИЦА',  value: 'CAM — запоминает MAC на портах' },
    { key: 'МЕХАНИКА', value: 'Первый пакет — flood, потом точно' },
    { key: 'УГРОЗА',   value: 'MAC Flooding — переполнение таблицы' },
    { key: 'ЗАЩИТА',   value: 'Port security / VLAN isolation' },
  ],
  CDN: [
    { key: 'СТАТУС',   value: 'АКТИВЕН' },
    { key: 'УРОВЕНЬ',  value: 'L7 — Прикладной' },
    { key: 'ФУНКЦИЯ',  value: 'Кэширует контент ближе к юзеру' },
    { key: 'МЕХАНИКА', value: 'Cache HIT — ответ за 5мс локально' },
    { key: 'МЕХАНИКА', value: 'Cache MISS — запрос к origin серверу' },
    { key: 'УГРОЗА',   value: 'Cache poisoning — подмена контента' },
    { key: 'БОНУС',    value: 'Скрывает реальный IP origin сервера' },
  ],
  VPN: [
    { key: 'СТАТУС',    value: 'АКТИВЕН' },
    { key: 'УРОВЕНЬ',   value: 'L3/L4 — Туннель' },
    { key: 'ФУНКЦИЯ',   value: 'Шифрует весь трафик в конверт' },
    { key: 'МЕХАНИКА',  value: 'Пакет → шифрование → новый IP' },
    { key: 'ПЛЕЧО 1',   value: 'Ты → VPN сервер (зашифровано)' },
    { key: 'ПЛЕЧО 2',   value: 'VPN сервер → сайт (открыто)' },
    { key: 'ПРОТОКОЛЫ', value: 'WireGuard / VLESS / Shadowsocks' },
    { key: 'УГРОЗА',    value: 'Блокировка IP или DPI сигнатуры' },
  ],
  DNS: [
    { key: 'СТАТУС',   value: 'АКТИВЕН' },
    { key: 'УРОВЕНЬ',  value: 'L7 — Прикладной' },
    { key: 'ФУНКЦИЯ',  value: 'Переводит домен → IP адрес' },
    { key: 'ПОРТ',     value: '53 UDP (быстро) / 53 TCP (надёжно)' },
    { key: 'ЗАПИСИ',   value: 'A / AAAA / MX / CNAME / TXT / NS' },
    { key: 'ЦЕПОЧКА',  value: 'Рекурсор → Root → TLD → Auth' },
    { key: 'УГРОЗА',   value: 'DNS Spoofing — подмена ответа' },
    { key: 'ЗАЩИТА',   value: 'DNSSEC / DoH / DoT' },
  ],
  ТСПУ: [
    { key: 'СТАТУС',        value: 'АКТИВЕН ⚠' },
    { key: 'УРОВЕНЬ',       value: 'L3/L7 — Глубокая инспекция' },
    { key: 'ФУНКЦИЯ',       value: 'Фильтрует трафик по чёрному списку' },
    { key: 'ВИДИТ ОТКРЫТЫМ',value: 'IP назначения / SNI / DNS' },
    { key: 'МЕТОДЫ',        value: 'Блокировка IP / Подмена DNS / RST пакет' },
    { key: 'ОБХОД',         value: 'VPN туннель / Обфускация / ECH' },
    { key: 'ОПЕРАТОР',      value: 'Установлен у каждого провайдера' },
    { key: 'СТАТУС УГРОЗЫ', value: 'ВЫСОКИЙ' },
  ],
}

const THREAT_KEYS   = new Set(['УГРОЗА', 'СТАТУС УГРОЗЫ'])
const PROTECT_KEYS  = new Set(['ЗАЩИТА', 'БОНУС', 'ОБХОД'])

const NODES: NetNode[] = [
  { id: 'r1',    type: 'Router' },
  { id: 'r2',    type: 'Router' },
  { id: 's1',    type: 'Switch' },
  { id: 'cdn1',  type: 'CDN'   },
  { id: 'vpn1',  type: 'VPN'   },
  { id: 'dns1',  type: 'DNS'   },
  { id: 'tspu1', type: 'ТСПУ'  },
  { id: 's2',    type: 'Switch' },
]

const LINKS: NetLink[] = [
  { source: 'r1',    target: 'r2'    },
  { source: 'r1',    target: 's1'    },
  { source: 'r1',    target: 'tspu1' },
  { source: 'r2',    target: 's2'    },
  { source: 'r2',    target: 'vpn1'  },
  { source: 's1',    target: 'cdn1'  },
  { source: 's1',    target: 'dns1'  },
  { source: 's2',    target: 'dns1'  },
  { source: 'tspu1', target: 'vpn1'  },
  { source: 'cdn1',  target: 's2'    },
]

const NODE_TYPE_MAP = new Map(NODES.map(n => [n.id, n.type]))
const TSPU_IDS = new Set(NODES.filter(n => n.type === 'ТСПУ').map(n => n.id))
const DNS_IDS  = new Set(NODES.filter(n => n.type === 'DNS' ).map(n => n.id))

const SIZE           = 32
const PKT_SIZE       = 6
const SPAWN_INTERVAL = 800
const PKT_DURATION   = 1500
const MAX_PACKETS    = 15
const ZOOM_MIN       = 0.5
const ZOOM_MAX       = 2.0
const ZOOM_STEP      = 0.1

// ─── Packet type picker ───────────────────────────────────────────────────────

function pickPacketType(srcId: string, tgtId: string): PacketType {
  if (TSPU_IDS.has(srcId) || TSPU_IDS.has(tgtId)) return 'BLOCKED'
  if (DNS_IDS.has(tgtId)  || DNS_IDS.has(srcId))   return 'DNS_PKT'
  return Math.random() < 0.5 ? 'TCP' : 'UDP'
}

function randomPacket(id: number): Packet {
  const link  = LINKS[Math.floor(Math.random() * LINKS.length)]
  const flip  = Math.random() < 0.5
  const srcId = (flip ? link.target : link.source) as string
  const tgtId = (flip ? link.source : link.target) as string
  return {
    id, sourceId: srcId, targetId: tgtId,
    ptype: pickPacketType(srcId, tgtId),
    startTime: performance.now(),
    bytes: [64, 128, 256, 512, 1024][Math.floor(Math.random() * 5)],
    ttl:   Math.floor(Math.random() * 50) + 10,
  }
}

// ─── Node tooltip ─────────────────────────────────────────────────────────────

function NodeTooltip({ tip, containerRef }: {
  tip: TooltipState; containerRef: React.RefObject<HTMLDivElement>
}) {
  const color  = NODE_COLOR[tip.node.type]
  const rows   = NODE_INFO[tip.node.type]
  const PAD    = 16
  const cardW  = 480
  const cardH  = 36 + rows.length * 28
  const rect   = containerRef.current?.getBoundingClientRect()
  const cw     = rect?.width  ?? window.innerWidth
  const ch     = rect?.height ?? window.innerHeight
  let left = tip.x + PAD; let top = tip.y + PAD
  if (left + cardW > cw) left = tip.x - cardW - PAD
  if (top  + cardH > ch) top  = tip.y - cardH - PAD
  return (
    <div style={{
      position: 'absolute', left, top, width: cardW,
      background: '#0d1424', border: `1.5px solid ${color}`,
      boxShadow: `0 0 20px ${color}44`, padding: '14px 18px',
      pointerEvents: 'none', zIndex: 100,
    }}>
      <div style={{ fontFamily: '"Press Start 2P", cursive', fontSize: 13, color,
        marginBottom: 14, textShadow: `0 0 10px ${color}` }}>
        [{NODE_LABEL[tip.node.type]}]&nbsp;&nbsp;{tip.node.type}
      </div>
      {rows.map((row, i) => {
        const isThreat  = THREAT_KEYS.has(row.key)
        const isProtect = PROTECT_KEYS.has(row.key)
        return (
          <div key={i} style={{ display: 'flex', gap: 8,
            fontFamily: '"Share Tech Mono", monospace', fontSize: 13, lineHeight: '2' }}>
            <span style={{ color: isThreat ? '#ff4444' : isProtect ? '#00e676' : '#4a6a8a',
              minWidth: 160, flexShrink: 0 }}>{row.key}:</span>
            <span style={{ color: isThreat ? '#ff8888' : isProtect ? '#88ffcc' : '#c8d8f0' }}>
              {row.value}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Packet mini-tooltip ──────────────────────────────────────────────────────

function PktTooltip({ tip, containerRef }: {
  tip: PktTooltipState; containerRef: React.RefObject<HTMLDivElement>
}) {
  const color = PKT_COLOR[tip.pkt.ptype]
  const rect  = containerRef.current?.getBoundingClientRect()
  const cw = rect?.width ?? window.innerWidth
  const PAD = 12; const cardW = 260
  let left = tip.x + PAD
  if (left + cardW > cw) left = tip.x - cardW - PAD
  return (
    <div style={{
      position: 'absolute', left, top: tip.y + PAD, width: cardW,
      background: '#0d1424', border: `1.5px solid ${color}`,
      boxShadow: `0 0 12px ${color}66`, padding: '8px 12px',
      pointerEvents: 'none', zIndex: 200,
    }}>
      <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 12,
        color: '#c8d8f0', lineHeight: '1.8' }}>
        <span style={{ color }}>{PKT_LABEL[tip.pkt.ptype]} пакет</span>
        {' | '}{tip.pkt.bytes} байт{' | '}TTL: {tip.pkt.ttl}
      </span>
    </div>
  )
}

// ─── Zoom controls ────────────────────────────────────────────────────────────

function ZoomBtn({ label, disabled, onClick }: {
  label: string; disabled: boolean; onClick: () => void
}) {
  const [hov, setHov] = React.useState(false)
  return (
    <button disabled={disabled} onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        fontFamily: '"Press Start 2P", cursive', fontSize: 16,
        background: '#0d1424',
        border: `1.5px solid ${!disabled && hov ? '#00e676' : '#1e2d4a'}`,
        boxShadow: !disabled && hov ? '0 0 10px #00e67644' : 'none',
        color: disabled ? '#2a3a4a' : hov ? '#00e676' : '#c8d8f0',
        width: 48, height: 48, cursor: disabled ? 'default' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'border-color .15s, color .15s, box-shadow .15s',
        userSelect: 'none', flexShrink: 0,
      }}>{label}</button>
  )
}

function ZoomControls({ zoom, onZoom }: { zoom: number; onZoom: (d: number) => void }) {
  return (
    <div style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, zIndex: 50 }}>
      <ZoomBtn label="+" disabled={zoom >= ZOOM_MAX} onClick={() => onZoom(ZOOM_STEP)} />
      <div style={{ fontFamily: '"Press Start 2P", cursive', fontSize: 14, color: '#7a9ab8',
        background: '#0d1424', border: '1.5px solid #1e2d4a', width: 48, height: 48,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        userSelect: 'none', letterSpacing: '-0.02em' }}>
        {zoom.toFixed(1)}
      </div>
      <ZoomBtn label="−" disabled={zoom <= ZOOM_MIN} onClick={() => onZoom(-ZOOM_STEP)} />
    </div>
  )
}

// ─── Packet counter HUD ───────────────────────────────────────────────────────

function PacketCounter({ delivered, blocked }: { delivered: number; blocked: number }) {
  return (
    <div style={{ position: 'absolute', bottom: 16, left: 16, zIndex: 50,
      fontFamily: '"Share Tech Mono", monospace', fontSize: 13,
      display: 'flex', flexDirection: 'column', gap: 4, pointerEvents: 'none' }}>
      <span style={{ color: '#00e676', textShadow: '0 0 8px #00e676, 0 0 16px #00e67666',
        letterSpacing: '0.15em' }}>
        PACKETS DELIVERED: {delivered}
      </span>
      <span style={{ color: '#ff4444', textShadow: '0 0 8px #ff4444, 0 0 16px #ff444466',
        letterSpacing: '0.15em' }}>
        BLOCKED: {blocked}
      </span>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function NetworkGraph() {
  const svgRef          = useRef<SVGSVGElement>(null)
  const containerRef    = useRef<HTMLDivElement>(null)
  const zoomRef         = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const nodePositions   = useRef<Map<string, { x: number; y: number }>>(new Map())
  const packetsRef      = useRef<Packet[]>([])
  const pktGroupRef     = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null)
  const nextIdRef       = useRef(0)
  const lastSpawnRef    = useRef(0)
  const rafRef          = useRef(0)
  const deliveredRef    = useRef(0)
  const blockedRef      = useRef(0)

  const [zoomLevel,   setZoomLevel]   = useState(1.0)
  const [nodeTooltip, setNodeTooltip] = useState<TooltipState | null>(null)
  const [pktTooltip,  setPktTooltip]  = useState<PktTooltipState | null>(null)
  const [counters,    setCounters]    = useState({ delivered: 0, blocked: 0 })

  const applyZoom = useCallback((delta: number) => {
    if (!svgRef.current || !zoomRef.current) return
    const k = d3.zoomTransform(svgRef.current).k
    const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((k + delta) * 10) / 10))
    d3.select(svgRef.current).transition().duration(200).call(zoomRef.current.scaleTo, next)
  }, [])

  useEffect(() => {
    const svg = d3.select(svgRef.current!)
    svg.selectAll('*').remove()

    const { width, height } = svgRef.current!.getBoundingClientRect()
    const nodes: NetNode[] = NODES.map(n => ({ ...n }))
    const links: NetLink[] = LINKS.map(l => ({ ...l }))

    const sim = d3.forceSimulation<NetNode>(nodes)
      .force('link',      d3.forceLink<NetNode, NetLink>(links).id(d => d.id).distance(120))
      .force('charge',    d3.forceManyBody().strength(-300))
      .force('center',    d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide(48))

    const g = svg.append('g')

    // Links
    const linkSel = g.append('g')
      .selectAll('line').data(links).join('line')
      .attr('stroke', '#1e2d4a').attr('stroke-width', 1.5)

    // Packets group (below nodes)
    const pktGroup = g.append('g')
    pktGroupRef.current = pktGroup

    // Nodes
    const nodeSel = g.append('g')
      .selectAll<SVGGElement, NetNode>('g').data(nodes).join('g')
      .style('cursor', 'grab')
      .on('mouseenter', (event: MouseEvent, d) => {
        const r = containerRef.current!.getBoundingClientRect()
        setNodeTooltip({ x: event.clientX - r.left, y: event.clientY - r.top, node: d })
      })
      .on('mousemove', (event: MouseEvent, d) => {
        const r = containerRef.current!.getBoundingClientRect()
        setNodeTooltip({ x: event.clientX - r.left, y: event.clientY - r.top, node: d })
      })
      .on('mouseleave', () => setNodeTooltip(null))
      .call(
        d3.drag<SVGGElement, NetNode>()
          .on('start', (ev, d) => { if (!ev.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y })
          .on('drag',  (ev, d) => { d.fx = ev.x; d.fy = ev.y })
          .on('end',   (ev, d) => { if (!ev.active) sim.alphaTarget(0); d.fx = null; d.fy = null })
      )

    nodeSel.append('rect')
      .attr('x', -SIZE / 2).attr('y', -SIZE / 2)
      .attr('width', SIZE).attr('height', SIZE)
      .attr('fill', d => NODE_COLOR[d.type]).attr('fill-opacity', 0.15)
      .attr('stroke', d => NODE_COLOR[d.type]).attr('stroke-width', 2)
      .style('filter', d => `drop-shadow(0 0 6px ${NODE_COLOR[d.type]}88)`)

    nodeSel.append('text')
      .text(d => NODE_LABEL[d.type])
      .attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
      .attr('fill', d => NODE_COLOR[d.type])
      .attr('font-family', '"Press Start 2P", cursive').attr('font-size', '11px')
      .style('pointer-events', 'none')

    nodeSel.append('text')
      .text(d => d.type)
      .attr('text-anchor', 'middle').attr('y', SIZE / 2 + 14)
      .attr('fill', d => NODE_COLOR[d.type]).attr('fill-opacity', 0.7)
      .attr('font-family', '"Share Tech Mono", monospace').attr('font-size', '9px')
      .style('pointer-events', 'none')

    // Sim tick
    sim.on('tick', () => {
      nodes.forEach(n => nodePositions.current.set(n.id, { x: n.x!, y: n.y! }))
      linkSel
        .attr('x1', d => (d.source as NetNode).x!).attr('y1', d => (d.source as NetNode).y!)
        .attr('x2', d => (d.target as NetNode).x!).attr('y2', d => (d.target as NetNode).y!)
      nodeSel.attr('transform', d => `translate(${d.x},${d.y})`)
    })

    // Zoom
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([ZOOM_MIN, ZOOM_MAX])
      .on('zoom', event => {
        g.attr('transform', event.transform)
        setZoomLevel(Math.round(event.transform.k * 10) / 10)
        setNodeTooltip(null); setPktTooltip(null)
      })
    zoomRef.current = zoom
    svg.call(zoom)

    // ── Packet animation loop ─────────────────────────────────────────────────
    function animLoop() {
      const now = performance.now()
      const positions = nodePositions.current
      const pkts = packetsRef.current

      // Spawn
      if (now - lastSpawnRef.current > SPAWN_INTERVAL && pkts.length < MAX_PACKETS) {
        pkts.push(randomPacket(nextIdRef.current++))
        lastSpawnRef.current = now
      }

      // Cull finished, tally counters
      let dDel = 0, dBlk = 0
      packetsRef.current = pkts.filter(p => {
        if ((now - p.startTime) / PKT_DURATION >= 1) {
          if (p.ptype === 'BLOCKED') dBlk++; else dDel++
          return false
        }
        return true
      })
      if (dDel || dBlk) {
        deliveredRef.current += dDel
        blockedRef.current   += dBlk
        setCounters({ delivered: deliveredRef.current, blocked: blockedRef.current })
      }

      // Render packets via D3 data join
      if (pktGroupRef.current) {
        pktGroupRef.current
          .selectAll<SVGRectElement, Packet>('rect')
          .data(packetsRef.current, d => d.id)
          .join(
            enter => enter.append('rect')
              .attr('width', PKT_SIZE).attr('height', PKT_SIZE)
              .attr('fill', d => PKT_COLOR[d.ptype])
              .style('filter', d => `drop-shadow(0 0 4px ${PKT_COLOR[d.ptype]})`)
              .style('cursor', 'crosshair')
              .on('mouseenter', function(event: MouseEvent, d) {
                const r = containerRef.current!.getBoundingClientRect()
                setPktTooltip({ x: event.clientX - r.left, y: event.clientY - r.top, pkt: d })
              })
              .on('mousemove', function(event: MouseEvent, d) {
                const r = containerRef.current!.getBoundingClientRect()
                setPktTooltip({ x: event.clientX - r.left, y: event.clientY - r.top, pkt: d })
              })
              .on('mouseleave', () => setPktTooltip(null)),
            update => update,
            exit => exit.remove()
          )
          .attr('x', d => {
            const t = Math.min((now - d.startTime) / PKT_DURATION, 1)
            const src = positions.get(d.sourceId); const tgt = positions.get(d.targetId)
            if (!src || !tgt) return 0
            return src.x + (tgt.x - src.x) * t - PKT_SIZE / 2
          })
          .attr('y', d => {
            const t = Math.min((now - d.startTime) / PKT_DURATION, 1)
            const src = positions.get(d.sourceId); const tgt = positions.get(d.targetId)
            if (!src || !tgt) return 0
            return src.y + (tgt.y - src.y) * t - PKT_SIZE / 2
          })
      }

      rafRef.current = requestAnimationFrame(animLoop)
    }

    rafRef.current = requestAnimationFrame(animLoop)

    return () => {
      sim.stop()
      cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return (
    <div ref={containerRef} className="w-full h-full" style={{ position: 'relative' }}>
      <svg ref={svgRef} className="w-full h-full" style={{ background: 'transparent' }} />
      {nodeTooltip && <NodeTooltip tip={nodeTooltip} containerRef={containerRef} />}
      {pktTooltip  && <PktTooltip  tip={pktTooltip}  containerRef={containerRef} />}
      <ZoomControls zoom={zoomLevel} onZoom={applyZoom} />
      <PacketCounter delivered={counters.delivered} blocked={counters.blocked} />
    </div>
  )
}
