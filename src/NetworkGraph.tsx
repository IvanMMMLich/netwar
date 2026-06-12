import React, { useEffect, useRef, useState, useCallback } from 'react'
import * as d3 from 'd3'

type NodeType = 'Router' | 'Switch' | 'CDN' | 'VPN' | 'DNS' | 'ТСПУ'

interface NetNode extends d3.SimulationNodeDatum {
  id: string
  type: NodeType
}

interface NetLink extends d3.SimulationLinkDatum<NetNode> {
  source: string | NetNode
  target: string | NetNode
}

interface TooltipState {
  x: number
  y: number
  node: NetNode
}

const NODE_COLOR: Record<NodeType, string> = {
  Router: '#00b4ff',
  Switch: '#5a7090',
  CDN:    '#00e676',
  VPN:    '#9c6bff',
  DNS:    '#ffb300',
  ТСПУ:  '#ff4444',
}

const NODE_LABEL: Record<NodeType, string> = {
  Router: 'R',
  Switch: 'S',
  CDN:    'C',
  VPN:    'V',
  DNS:    'D',
  ТСПУ:  'T',
}

const NODE_INFO: Record<NodeType, { key: string; value: string }[]> = {
  Router: [
    { key: 'СТАТУС',     value: 'АКТИВЕН' },
    { key: 'УРОВЕНЬ',    value: 'L3 — Сетевой' },
    { key: 'ФУНКЦИЯ',    value: 'Пересылает пакеты по IP-адресу' },
    { key: 'ПРОТОКОЛЫ',  value: 'OSPF (внутри AS) / BGP (между AS)' },
    { key: 'МЕХАНИКА',   value: 'Каждый пакет теряет 1 TTL на хопе' },
    { key: 'УГРОЗА',     value: 'BGP Hijack — сосед крадёт маршруты' },
    { key: 'ЗАЩИТА',     value: 'Prefix filtering / Route policy' },
  ],
  Switch: [
    { key: 'СТАТУС',     value: 'АКТИВЕН' },
    { key: 'УРОВЕНЬ',    value: 'L2 — Канальный' },
    { key: 'ФУНКЦИЯ',    value: 'Коммутация по MAC-адресам' },
    { key: 'ТАБЛИЦА',    value: 'CAM — запоминает MAC на портах' },
    { key: 'МЕХАНИКА',   value: 'Первый пакет — flood, потом точно' },
    { key: 'УГРОЗА',     value: 'MAC Flooding — переполнение таблицы' },
    { key: 'ЗАЩИТА',     value: 'Port security / VLAN isolation' },
  ],
  CDN: [
    { key: 'СТАТУС',     value: 'АКТИВЕН' },
    { key: 'УРОВЕНЬ',    value: 'L7 — Прикладной' },
    { key: 'ФУНКЦИЯ',    value: 'Кэширует контент ближе к юзеру' },
    { key: 'МЕХАНИКА',   value: 'Cache HIT — ответ за 5мс локально' },
    { key: 'МЕХАНИКА',   value: 'Cache MISS — запрос к origin серверу' },
    { key: 'УГРОЗА',     value: 'Cache poisoning — подмена контента' },
    { key: 'БОНУС',      value: 'Скрывает реальный IP origin сервера' },
  ],
  VPN: [
    { key: 'СТАТУС',     value: 'АКТИВЕН' },
    { key: 'УРОВЕНЬ',    value: 'L3/L4 — Туннель' },
    { key: 'ФУНКЦИЯ',    value: 'Шифрует весь трафик в конверт' },
    { key: 'МЕХАНИКА',   value: 'Пакет → шифрование → новый IP' },
    { key: 'ПЛЕЧО 1',    value: 'Ты → VPN сервер (зашифровано)' },
    { key: 'ПЛЕЧО 2',    value: 'VPN сервер → сайт (открыто)' },
    { key: 'ПРОТОКОЛЫ',  value: 'WireGuard / VLESS / Shadowsocks' },
    { key: 'УГРОЗА',     value: 'Блокировка IP или DPI сигнатуры' },
  ],
  DNS: [
    { key: 'СТАТУС',     value: 'АКТИВЕН' },
    { key: 'УРОВЕНЬ',    value: 'L7 — Прикладной' },
    { key: 'ФУНКЦИЯ',    value: 'Переводит домен → IP адрес' },
    { key: 'ПОРТ',       value: '53 UDP (быстро) / 53 TCP (надёжно)' },
    { key: 'ЗАПИСИ',     value: 'A / AAAA / MX / CNAME / TXT / NS' },
    { key: 'ЦЕПОЧКА',    value: 'Рекурсор → Root → TLD → Auth' },
    { key: 'УГРОЗА',     value: 'DNS Spoofing — подмена ответа' },
    { key: 'ЗАЩИТА',     value: 'DNSSEC / DoH / DoT' },
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

const THREAT_KEYS = new Set(['УГРОЗА', 'СТАТУС УГРОЗЫ'])
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

const SIZE = 32
const ZOOM_MIN = 0.5
const ZOOM_MAX = 2.0
const ZOOM_STEP = 0.1

function Tooltip({ tip, containerRef }: { tip: TooltipState; containerRef: React.RefObject<HTMLDivElement> }) {
  const color = NODE_COLOR[tip.node.type]
  const rows = NODE_INFO[tip.node.type]
  const PAD = 16
  const cardW = 480

  const rect = containerRef.current?.getBoundingClientRect()
  const cw = rect?.width ?? window.innerWidth
  const ch = rect?.height ?? window.innerHeight
  const cardH = 36 + rows.length * 28

  let left = tip.x + PAD
  let top  = tip.y + PAD
  if (left + cardW > cw) left = tip.x - cardW - PAD
  if (top + cardH > ch)  top  = tip.y - cardH - PAD

  return (
    <div style={{
      position: 'absolute', left, top,
      background: '#0d1424',
      border: `1.5px solid ${color}`,
      boxShadow: `0 0 20px ${color}44`,
      padding: '14px 18px',
      pointerEvents: 'none',
      zIndex: 100,
      width: cardW,
    }}>
      <div style={{
        fontFamily: '"Press Start 2P", cursive',
        fontSize: 13,
        color,
        marginBottom: 14,
        letterSpacing: '0.08em',
        textShadow: `0 0 10px ${color}`,
      }}>
        [{NODE_LABEL[tip.node.type]}]&nbsp;&nbsp;{tip.node.type}
      </div>
      {rows.map((row, i) => {
        const isThreat  = THREAT_KEYS.has(row.key)
        const isProtect = PROTECT_KEYS.has(row.key)
        const keyColor  = isThreat ? '#ff4444' : isProtect ? '#00e676' : '#4a6a8a'
        const valColor  = isThreat ? '#ff8888' : isProtect ? '#88ffcc' : '#c8d8f0'
        return (
          <div key={i} style={{
            display: 'flex',
            gap: 8,
            fontFamily: '"Share Tech Mono", monospace',
            fontSize: 13,
            lineHeight: '2',
          }}>
            <span style={{ color: keyColor, minWidth: 160, flexShrink: 0 }}>{row.key}:</span>
            <span style={{ color: valColor }}>{row.value}</span>
          </div>
        )
      })}
    </div>
  )
}

function ZoomBtn({
  label, disabled, onClick,
}: { label: string; disabled: boolean; onClick: () => void }) {
  const [hovered, setHovered] = React.useState(false)
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        fontFamily: '"Press Start 2P", cursive',
        fontSize: 16,
        background: '#0d1424',
        border: `1.5px solid ${!disabled && hovered ? '#00e676' : '#1e2d4a'}`,
        boxShadow: !disabled && hovered ? '0 0 10px #00e67644' : 'none',
        color: disabled ? '#2a3a4a' : hovered ? '#00e676' : '#c8d8f0',
        width: 48,
        height: 48,
        cursor: disabled ? 'default' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'border-color 0.15s, color 0.15s, box-shadow 0.15s',
        userSelect: 'none',
        flexShrink: 0,
      }}
    >
      {label}
    </button>
  )
}

function ZoomControls({ zoom, onZoom }: { zoom: number; onZoom: (delta: number) => void }) {
  return (
    <div style={{
      position: 'absolute',
      right: 16,
      top: '50%',
      transform: 'translateY(-50%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 8,
      zIndex: 50,
    }}>
      <ZoomBtn label="+" disabled={zoom >= ZOOM_MAX} onClick={() => onZoom(ZOOM_STEP)} />

      <div style={{
        fontFamily: '"Press Start 2P", cursive',
        fontSize: 14,
        color: '#7a9ab8',
        background: '#0d1424',
        border: '1.5px solid #1e2d4a',
        width: 48,
        height: 48,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none',
        letterSpacing: '-0.02em',
      }}>
        {zoom.toFixed(1)}
      </div>

      <ZoomBtn label="−" disabled={zoom <= ZOOM_MIN} onClick={() => onZoom(-ZOOM_STEP)} />
    </div>
  )
}

export default function NetworkGraph() {
  const svgRef       = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const zoomRef      = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [zoomLevel, setZoomLevel] = useState(1.0)

  const applyZoom = useCallback((delta: number) => {
    if (!svgRef.current || !zoomRef.current) return
    const svg = d3.select(svgRef.current)
    const current = d3.zoomTransform(svgRef.current).k
    const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((current + delta) * 10) / 10))
    svg.transition().duration(200).call(zoomRef.current.scaleTo, next)
  }, [])

  useEffect(() => {
    const svg = d3.select(svgRef.current!)
    svg.selectAll('*').remove()

    const { width, height } = svgRef.current!.getBoundingClientRect()

    const nodes: NetNode[] = NODES.map(n => ({ ...n }))
    const links: NetLink[] = LINKS.map(l => ({ ...l }))

    const sim = d3.forceSimulation<NetNode>(nodes)
      .force('link', d3.forceLink<NetNode, NetLink>(links).id(d => d.id).distance(120))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide(48))

    const g = svg.append('g')

    const linkSel = g.append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', '#1e2d4a')
      .attr('stroke-width', 1.5)

    const nodeSel = g.append('g')
      .selectAll<SVGGElement, NetNode>('g')
      .data(nodes)
      .join('g')
      .style('cursor', 'grab')
      .on('mouseenter', (event: MouseEvent, d) => {
        const rect = containerRef.current!.getBoundingClientRect()
        setTooltip({ x: event.clientX - rect.left, y: event.clientY - rect.top, node: d })
      })
      .on('mousemove', (event: MouseEvent, d) => {
        const rect = containerRef.current!.getBoundingClientRect()
        setTooltip({ x: event.clientX - rect.left, y: event.clientY - rect.top, node: d })
      })
      .on('mouseleave', () => setTooltip(null))
      .call(
        d3.drag<SVGGElement, NetNode>()
          .on('start', (event, d) => {
            if (!event.active) sim.alphaTarget(0.3).restart()
            d.fx = d.x; d.fy = d.y
          })
          .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y })
          .on('end', (event, d) => {
            if (!event.active) sim.alphaTarget(0)
            d.fx = null; d.fy = null
          })
      )

    nodeSel.append('rect')
      .attr('x', -SIZE / 2).attr('y', -SIZE / 2)
      .attr('width', SIZE).attr('height', SIZE)
      .attr('fill', d => NODE_COLOR[d.type])
      .attr('fill-opacity', 0.15)
      .attr('stroke', d => NODE_COLOR[d.type])
      .attr('stroke-width', 2)
      .style('filter', d => `drop-shadow(0 0 6px ${NODE_COLOR[d.type]}88)`)

    nodeSel.append('text')
      .text(d => NODE_LABEL[d.type])
      .attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
      .attr('fill', d => NODE_COLOR[d.type])
      .attr('font-family', '"Press Start 2P", cursive')
      .attr('font-size', '11px')
      .style('pointer-events', 'none')

    nodeSel.append('text')
      .text(d => d.type)
      .attr('text-anchor', 'middle').attr('y', SIZE / 2 + 14)
      .attr('fill', d => NODE_COLOR[d.type])
      .attr('fill-opacity', 0.7)
      .attr('font-family', '"Share Tech Mono", monospace')
      .attr('font-size', '9px')
      .style('pointer-events', 'none')

    sim.on('tick', () => {
      linkSel
        .attr('x1', d => (d.source as NetNode).x!)
        .attr('y1', d => (d.source as NetNode).y!)
        .attr('x2', d => (d.target as NetNode).x!)
        .attr('y2', d => (d.target as NetNode).y!)
      nodeSel.attr('transform', d => `translate(${d.x},${d.y})`)
    })

    // Zoom + pan
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([ZOOM_MIN, ZOOM_MAX])
      .on('zoom', event => {
        g.attr('transform', event.transform)
        setZoomLevel(Math.round(event.transform.k * 10) / 10)
        setTooltip(null)
      })

    zoomRef.current = zoom
    d3.select(svgRef.current!).call(zoom)

    return () => { sim.stop() }
  }, [])

  return (
    <div ref={containerRef} className="w-full h-full" style={{ position: 'relative' }}>
      <svg ref={svgRef} className="w-full h-full" style={{ background: 'transparent' }} />
      {tooltip && <Tooltip tip={tooltip} containerRef={containerRef} />}
      <ZoomControls zoom={zoomLevel} onZoom={applyZoom} />
    </div>
  )
}
