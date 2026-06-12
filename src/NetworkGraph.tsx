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
  elapsedMs: number
  bytes:     number
  ttl:       number
}
interface NodeTip  { x: number; y: number; node: NetNode }
interface PktTip   { x: number; y: number; pkt: Packet  }

// ─── Static data ──────────────────────────────────────────────────────────────

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
const PKT_PROTO: Record<PacketType, string> = {
  TCP: 'TCP', UDP: 'UDP', DNS_PKT: 'DNS/UDP', BLOCKED: 'TCP',
}
const PKT_DISPLAY: Record<PacketType, string> = {
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
    { key: 'СТАТУС',         value: 'АКТИВЕН ⚠' },
    { key: 'УРОВЕНЬ',        value: 'L3/L7 — Глубокая инспекция' },
    { key: 'ФУНКЦИЯ',        value: 'Фильтрует трафик по чёрному списку' },
    { key: 'ВИДИТ ОТКРЫТЫМ', value: 'IP назначения / SNI / DNS' },
    { key: 'МЕТОДЫ',         value: 'Блокировка IP / Подмена DNS / RST пакет' },
    { key: 'ОБХОД',          value: 'VPN туннель / Обфускация / ECH' },
    { key: 'ОПЕРАТОР',       value: 'Установлен у каждого провайдера' },
    { key: 'СТАТУС УГРОЗЫ',  value: 'ВЫСОКИЙ' },
  ],
}

const THREAT_KEYS  = new Set(['УГРОЗА', 'СТАТУС УГРОЗЫ'])
const PROTECT_KEYS = new Set(['ЗАЩИТА', 'БОНУС', 'ОБХОД'])

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
const TSPU_IDS      = new Set(NODES.filter(n => n.type === 'ТСПУ').map(n => n.id))
const DNS_IDS       = new Set(NODES.filter(n => n.type === 'DNS' ).map(n => n.id))

const SIZE           = 32
const PKT_SIZE_LIVE  = 6
const PKT_SIZE_PAUSE = 8
const SPAWN_INTERVAL = 800
const PKT_DURATION   = 1500
const MAX_PACKETS    = 15
const ZOOM_MIN       = 0.5
const ZOOM_MAX       = 2.0
const ZOOM_STEP      = 0.1
const SPEEDS         = [0.5, 1, 1.5, 2]

// ─── Packet helpers ───────────────────────────────────────────────────────────

function pickPacketType(srcId: string, tgtId: string): PacketType {
  if (TSPU_IDS.has(srcId) || TSPU_IDS.has(tgtId)) return 'BLOCKED'
  if (DNS_IDS.has(tgtId)  || DNS_IDS.has(srcId))  return 'DNS_PKT'
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
    elapsedMs: 0,
    bytes: [64, 128, 256, 512, 1024, 1460][Math.floor(Math.random() * 6)],
    ttl:   Math.floor(Math.random() * 50) + 10,
  }
}

function getGoal(srcId: string, tgtId: string): string {
  const src = NODE_TYPE_MAP.get(srcId)
  const tgt = NODE_TYPE_MAP.get(tgtId)
  if (tgt === 'ТСПУ' || src === 'ТСПУ') return 'инспекция трафика DPI | РИСК: блокировка'
  if (tgt === 'DNS')    return 'резолюция доменного имени → IP'
  if (tgt === 'VPN')    return 'установка зашифрованного туннеля'
  if (tgt === 'CDN')    return 'запрос кэшированного контента'
  if (src === 'Switch') return 'коммутация по MAC-адресу в таблице CAM'
  if (src === 'Router' && tgt === 'Router') return 'транзитная маршрутизация BGP'
  return 'передача пользовательских данных'
}

// ─── Node tooltip ─────────────────────────────────────────────────────────────

function NodeTooltip({ tip, cref }: { tip: NodeTip; cref: React.RefObject<HTMLDivElement> }) {
  const color = NODE_COLOR[tip.node.type]
  const rows  = NODE_INFO[tip.node.type]
  const PAD = 16; const cardW = 480; const cardH = 36 + rows.length * 28
  const rect = cref.current?.getBoundingClientRect()
  const cw = rect?.width ?? window.innerWidth; const ch = rect?.height ?? window.innerHeight
  let left = tip.x + PAD; let top = tip.y + PAD
  if (left + cardW > cw) left = tip.x - cardW - PAD
  if (top  + cardH > ch) top  = tip.y - cardH - PAD
  return (
    <div style={{ position: 'absolute', left, top, width: cardW,
      background: '#0d1424', border: `1.5px solid ${color}`,
      boxShadow: `0 0 20px ${color}44`, padding: '14px 18px', pointerEvents: 'none', zIndex: 100 }}>
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

// ─── Packet tooltip ───────────────────────────────────────────────────────────

function PktTooltip({ tip, cref, paused }: {
  tip: PktTip; cref: React.RefObject<HTMLDivElement>; paused: boolean
}) {
  const { pkt } = tip
  const color   = PKT_COLOR[pkt.ptype]
  const srcType = NODE_TYPE_MAP.get(pkt.sourceId) ?? '?'
  const tgtType = NODE_TYPE_MAP.get(pkt.targetId) ?? '?'
  const PAD = 14; const cardW = 380
  const rect = cref.current?.getBoundingClientRect()
  const cw = rect?.width ?? window.innerWidth; const ch = rect?.height ?? window.innerHeight
  const cardH = 160
  let left = tip.x + PAD; let top = tip.y + PAD
  if (left + cardW > cw) left = tip.x - cardW - PAD
  if (top  + cardH > ch) top  = tip.y - cardH - PAD

  const status = pkt.ptype === 'BLOCKED' ? 'ЗАБЛОКИРОВАН' : paused ? 'ЗАМОРОЖЕН' : 'В TRANSIT'
  const statusColor = pkt.ptype === 'BLOCKED' ? '#ff4444' : paused ? '#ffb300' : '#00e676'

  return (
    <div style={{ position: 'absolute', left, top, width: cardW,
      background: '#0d1424', border: `1.5px solid ${color}`,
      boxShadow: `0 0 14px ${color}55`, padding: '12px 16px', pointerEvents: 'none', zIndex: 200 }}>
      <div style={{ fontFamily: '"Press Start 2P", cursive', fontSize: 11, color,
        marginBottom: 10, textShadow: `0 0 8px ${color}` }}>
        {PKT_DISPLAY[pkt.ptype]} пакет
      </div>
      {[
        { k: 'МАРШРУТ',   v: `${srcType} → ${tgtType}`, c: '#c8d8f0' },
        { k: 'ЦЕЛЬ',      v: getGoal(pkt.sourceId, pkt.targetId),
          c: pkt.ptype === 'BLOCKED' ? '#ff8888' : '#88ffcc' },
        { k: 'ПРОТОКОЛ',  v: PKT_PROTO[pkt.ptype], c: '#c8d8f0' },
        { k: 'РАЗМЕР',    v: `${pkt.bytes} байт`, c: '#c8d8f0' },
        { k: 'TTL',       v: String(pkt.ttl), c: '#c8d8f0' },
        { k: 'СТАТУС',    v: status, c: statusColor },
      ].map(({ k, v, c }) => (
        <div key={k} style={{ display: 'flex', gap: 8,
          fontFamily: '"Share Tech Mono", monospace', fontSize: 11, lineHeight: '1.9' }}>
          <span style={{ color: '#4a6a8a', minWidth: 90, flexShrink: 0 }}>{k}:</span>
          <span style={{ color: c }}>{v}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Control panel ────────────────────────────────────────────────────────────

function CtrlBtn({ children, active, onClick, glowColor = '#00e676' }: {
  children: React.ReactNode; active?: boolean; onClick: () => void; glowColor?: string
}) {
  const [hov, setHov] = useState(false)
  const lit = hov || active
  return (
    <button onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        fontFamily: '"Press Start 2P", cursive', fontSize: 10,
        background: lit ? `${glowColor}18` : '#0d1424',
        border: `1.5px solid ${lit ? glowColor : '#1e2d4a'}`,
        boxShadow: lit ? `0 0 10px ${glowColor}55` : 'none',
        color: lit ? glowColor : '#7a9ab8',
        padding: '0 16px', height: 40, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all .15s', userSelect: 'none', whiteSpace: 'nowrap',
        letterSpacing: '0.05em',
      }}>
      {children}
    </button>
  )
}

function ControlPanel({ paused, speed, onTogglePause, onCycleSpeed }: {
  paused: boolean; speed: number;
  onTogglePause: () => void; onCycleSpeed: () => void
}) {
  return (
    <div style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
      display: 'flex', alignItems: 'center', gap: 8, zIndex: 60 }}>
      <div style={{ background: '#070b14', border: '1px solid #1e2d4a',
        display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px' }}>
        <CtrlBtn onClick={onTogglePause} active={paused} glowColor={paused ? '#ffb300' : '#00e676'}>
          {paused ? '▶ PLAY' : '⏸ PAUSE'}
        </CtrlBtn>
        <div style={{ width: 1, height: 28, background: '#1e2d4a' }} />
        <CtrlBtn onClick={onCycleSpeed} glowColor='#00b4ff'>
          {speed}x
        </CtrlBtn>
      </div>
    </div>
  )
}

// ─── Zoom controls ────────────────────────────────────────────────────────────

function ZoomBtn({ label, disabled, onClick }: {
  label: string; disabled: boolean; onClick: () => void
}) {
  const [hov, setHov] = useState(false)
  return (
    <button disabled={disabled} onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        fontFamily: '"Press Start 2P", cursive', fontSize: 16, background: '#0d1424',
        border: `1.5px solid ${!disabled && hov ? '#00e676' : '#1e2d4a'}`,
        boxShadow: !disabled && hov ? '0 0 10px #00e67644' : 'none',
        color: disabled ? '#2a3a4a' : hov ? '#00e676' : '#c8d8f0',
        width: 48, height: 48, cursor: disabled ? 'default' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all .15s', userSelect: 'none', flexShrink: 0,
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

// ─── Packet counter ───────────────────────────────────────────────────────────

function PacketCounter({ delivered, blocked }: { delivered: number; blocked: number }) {
  return (
    <div style={{ position: 'absolute', bottom: 16, left: 16, zIndex: 50,
      fontFamily: '"Share Tech Mono", monospace', fontSize: 13,
      display: 'flex', flexDirection: 'column', gap: 4, pointerEvents: 'none' }}>
      <span style={{ color: '#00e676', textShadow: '0 0 8px #00e676, 0 0 16px #00e67666', letterSpacing: '0.15em' }}>
        PACKETS DELIVERED: {delivered}
      </span>
      <span style={{ color: '#ff4444', textShadow: '0 0 8px #ff4444, 0 0 16px #ff444466', letterSpacing: '0.15em' }}>
        BLOCKED: {blocked}
      </span>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function NetworkGraph() {
  const svgRef       = useRef<SVGSVGElement>(null)
  const cref         = useRef<HTMLDivElement>(null)
  const zoomRef      = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const nodePos      = useRef<Map<string, { x: number; y: number }>>(new Map())
  const packetsRef   = useRef<Packet[]>([])
  const pktGroupRef  = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null)
  const pinnedRef    = useRef<Set<string>>(new Set())
  const nodeSelRef   = useRef<d3.Selection<SVGGElement, NetNode, SVGGElement, unknown> | null>(null)
  const simRef       = useRef<d3.Simulation<NetNode, NetLink> | null>(null)
  const nextIdRef    = useRef(0)
  const lastSpawnRef = useRef(0)
  const lastRafRef   = useRef(0)
  const rafRef       = useRef(0)
  const deliveredRef = useRef(0)
  const blockedRef   = useRef(0)
  const dragMovedRef = useRef(false)

  const isPausedRef  = useRef(false)
  const speedRef     = useRef(1)

  const [zoomLevel,   setZoomLevel]  = useState(1.0)
  const [nodeTip,     setNodeTip]    = useState<NodeTip | null>(null)
  const [pktTip,      setPktTip]     = useState<PktTip | null>(null)
  const [paused,      setPaused]     = useState(false)
  const [speed,       setSpeed]      = useState(1)
  const [speedIdx,    setSpeedIdx]   = useState(1)
  const [counters,    setCounters]   = useState({ delivered: 0, blocked: 0 })

  const applyZoom = useCallback((delta: number) => {
    if (!svgRef.current || !zoomRef.current) return
    const k = d3.zoomTransform(svgRef.current).k
    const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((k + delta) * 10) / 10))
    d3.select(svgRef.current).transition().duration(200).call(zoomRef.current.scaleTo, next)
  }, [])

  const togglePause = useCallback(() => {
    isPausedRef.current = !isPausedRef.current
    setPaused(isPausedRef.current)
  }, [])

  const cycleSpeed = useCallback(() => {
    setSpeedIdx(prev => {
      const next = (prev + 1) % SPEEDS.length
      speedRef.current = SPEEDS[next]
      setSpeed(SPEEDS[next])
      return next
    })
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
    simRef.current = sim

    const g = svg.append('g')

    const linkSel = g.append('g')
      .selectAll('line').data(links).join('line')
      .attr('stroke', '#1e2d4a').attr('stroke-width', 1.5)

    const pktGroup = g.append('g')
    pktGroupRef.current = pktGroup

    const nodeSel = g.append('g')
      .selectAll<SVGGElement, NetNode>('g').data(nodes).join('g')
      .style('cursor', 'pointer')
      .on('click', (_event: MouseEvent, d) => {
        if (dragMovedRef.current) return
        const pinned = pinnedRef.current
        if (pinned.has(d.id)) {
          pinned.delete(d.id)
          d.fx = null; d.fy = null
        } else {
          pinned.add(d.id)
          d.fx = d.x; d.fy = d.y
        }
        updatePinIndicators()
        sim.alphaTarget(0.1).restart()
        setTimeout(() => sim.alphaTarget(0), 300)
      })
      .on('mouseenter', (event: MouseEvent, d) => {
        const r = cref.current!.getBoundingClientRect()
        setNodeTip({ x: event.clientX - r.left, y: event.clientY - r.top, node: d })
      })
      .on('mousemove', (event: MouseEvent, d) => {
        const r = cref.current!.getBoundingClientRect()
        setNodeTip({ x: event.clientX - r.left, y: event.clientY - r.top, node: d })
      })
      .on('mouseleave', () => setNodeTip(null))
      .call(
        d3.drag<SVGGElement, NetNode>()
          .on('start', (ev, d) => {
            dragMovedRef.current = false
            if (!ev.active) sim.alphaTarget(0.3).restart()
            d.fx = d.x; d.fy = d.y
          })
          .on('drag', (ev, d) => {
            dragMovedRef.current = true
            d.fx = ev.x; d.fy = ev.y
            if (pinnedRef.current.has(d.id)) {
              // keep pinned position in sync
            }
          })
          .on('end', (ev, d) => {
            if (!ev.active) sim.alphaTarget(0)
            if (!pinnedRef.current.has(d.id)) { d.fx = null; d.fy = null }
            else { d.fx = ev.x; d.fy = ev.y }
          })
      )
    nodeSelRef.current = nodeSel

    // Node body
    nodeSel.append('rect')
      .attr('x', -SIZE / 2).attr('y', -SIZE / 2)
      .attr('width', SIZE).attr('height', SIZE)
      .attr('fill', d => NODE_COLOR[d.type]).attr('fill-opacity', 0.15)
      .attr('stroke', d => NODE_COLOR[d.type]).attr('stroke-width', 2)
      .style('filter', d => `drop-shadow(0 0 6px ${NODE_COLOR[d.type]}88)`)

    // Node letter
    nodeSel.append('text').attr('class', 'node-letter')
      .text(d => NODE_LABEL[d.type])
      .attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
      .attr('fill', d => NODE_COLOR[d.type])
      .attr('font-family', '"Press Start 2P", cursive').attr('font-size', '11px')
      .style('pointer-events', 'none')

    // Node type label
    nodeSel.append('text').attr('class', 'node-type')
      .text(d => d.type)
      .attr('text-anchor', 'middle').attr('y', SIZE / 2 + 14)
      .attr('fill', d => NODE_COLOR[d.type]).attr('fill-opacity', 0.7)
      .attr('font-family', '"Share Tech Mono", monospace').attr('font-size', '9px')
      .style('pointer-events', 'none')

    // Pin icon (hidden by default)
    nodeSel.append('text').attr('class', 'pin-icon')
      .text('📌')
      .attr('text-anchor', 'middle').attr('y', -SIZE / 2 - 8)
      .attr('font-size', '12px').attr('opacity', 0)
      .style('pointer-events', 'none')

    // Pinned status text
    nodeSel.append('text').attr('class', 'pin-label')
      .text('PINNED')
      .attr('text-anchor', 'middle').attr('y', SIZE / 2 + 26)
      .attr('fill', '#ffb300').attr('fill-opacity', 0)
      .attr('font-family', '"Share Tech Mono", monospace').attr('font-size', '8px')
      .style('pointer-events', 'none')

    function updatePinIndicators() {
      if (!nodeSelRef.current) return
      nodeSelRef.current.select('.pin-icon').attr('opacity', (d: NetNode) =>
        pinnedRef.current.has(d.id) ? 1 : 0)
      nodeSelRef.current.select('.pin-label').attr('fill-opacity', (d: NetNode) =>
        pinnedRef.current.has(d.id) ? 1 : 0)
      nodeSelRef.current.select('rect').attr('stroke-width', (d: NetNode) =>
        pinnedRef.current.has(d.id) ? 2.5 : 2)
    }

    sim.on('tick', () => {
      nodes.forEach(n => nodePos.current.set(n.id, { x: n.x!, y: n.y! }))
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
        setNodeTip(null); setPktTip(null)
      })
    zoomRef.current = zoom
    svg.call(zoom)

    // ── Animation loop ────────────────────────────────────────────────────────
    function animLoop(now: number) {
      const dt      = lastRafRef.current ? now - lastRafRef.current : 0
      lastRafRef.current = now
      const frozen  = isPausedRef.current
      const spd     = speedRef.current
      const pkts    = packetsRef.current
      const pos     = nodePos.current

      // Spawn
      if (!frozen && now - lastSpawnRef.current > SPAWN_INTERVAL && pkts.length < MAX_PACKETS) {
        pkts.push(randomPacket(nextIdRef.current++))
        lastSpawnRef.current = now
      }

      // Advance elapsed / cull
      let dDel = 0, dBlk = 0
      if (!frozen) {
        packetsRef.current = pkts.filter(p => {
          p.elapsedMs += dt * spd
          if (p.elapsedMs >= PKT_DURATION) {
            if (p.ptype === 'BLOCKED') dBlk++; else dDel++
            return false
          }
          return true
        })
      }
      if (dDel || dBlk) {
        deliveredRef.current += dDel
        blockedRef.current   += dBlk
        setCounters({ delivered: deliveredRef.current, blocked: blockedRef.current })
      }

      // Pulse for pause overlay
      const pulse    = frozen ? (Math.sin(now / 300) * 0.5 + 0.5) : 0
      const pktSize  = frozen ? PKT_SIZE_PAUSE : PKT_SIZE_LIVE

      // Render packets
      if (pktGroupRef.current) {
        type PktGEl = SVGGElement
        pktGroupRef.current
          .selectAll<PktGEl, Packet>('g.pkt')
          .data(packetsRef.current, d => d.id)
          .join(
            enter => {
              const grp = enter.append('g').attr('class', 'pkt').style('cursor', 'crosshair')
              // outline rect
              grp.append('rect').attr('class', 'pkt-outline')
                .attr('fill', 'none').attr('rx', 1)
              // body rect
              grp.append('rect').attr('class', 'pkt-body').attr('rx', 1)
              grp
                .on('mouseenter', function(event: MouseEvent, d) {
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
            const x  = src.x + (tgt.x - src.x) * t - pktSize / 2
            const y  = src.y + (tgt.y - src.y) * t - pktSize / 2
            const el = d3.select(this)
            const outlineSize = pktSize + 4
            el.select('.pkt-body')
              .attr('x', x).attr('y', y)
              .attr('width', pktSize).attr('height', pktSize)
              .attr('fill', PKT_COLOR[d.ptype])
              .style('filter', `drop-shadow(0 0 ${frozen ? 5 : 3}px ${PKT_COLOR[d.ptype]})`)
            el.select('.pkt-outline')
              .attr('x', x - 2).attr('y', y - 2)
              .attr('width', outlineSize).attr('height', outlineSize)
              .attr('stroke', PKT_COLOR[d.ptype])
              .attr('stroke-width', frozen ? 1 + pulse * 2 : 0)
              .attr('opacity', frozen ? 0.3 + pulse * 0.7 : 0)
          })
      }

      rafRef.current = requestAnimationFrame(animLoop)
    }

    rafRef.current = requestAnimationFrame(animLoop)
    return () => { sim.stop(); cancelAnimationFrame(rafRef.current) }
  }, [])

  return (
    <div ref={cref} className="w-full h-full" style={{ position: 'relative' }}>
      <svg ref={svgRef} className="w-full h-full" style={{ background: 'transparent' }} />
      {nodeTip && <NodeTooltip tip={nodeTip} cref={cref} />}
      {pktTip  && <PktTooltip  tip={pktTip}  cref={cref} paused={paused} />}
      <ZoomControls zoom={zoomLevel} onZoom={applyZoom} />
      <PacketCounter delivered={counters.delivered} blocked={counters.blocked} />
      <ControlPanel paused={paused} speed={speed}
        onTogglePause={togglePause} onCycleSpeed={cycleSpeed} />
    </div>
  )
}
