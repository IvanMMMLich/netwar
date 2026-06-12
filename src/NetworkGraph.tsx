import React, { useEffect, useRef, useState } from 'react'
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

const NODE_INFO: Record<NodeType, string[]> = {
  Router: [
    'Маршрутизатор L3',
    'Протокол: OSPF/BGP',
    'Пересылает пакеты по IP-адресу',
    'TTL уменьшается на каждом хопе',
  ],
  Switch: [
    'Коммутатор L2',
    'Работает по MAC-адресам',
    'Строит таблицу CAM',
    'Не видит IP-адреса',
  ],
  CDN: [
    'Сеть доставки контента',
    'Кэширует запросы',
    'Снижает задержку',
    'Ближайший к пользователю сервер',
  ],
  VPN: [
    'Туннель шифрования',
    'Прячет IP и SNI',
    'Два плеча маршрута',
    'Протоколы: WireGuard / VLESS',
  ],
  DNS: [
    'Резолвер имён',
    'Переводит домен в IP',
    'Записи: A / MX / CNAME / TXT',
    'Порт 53 UDP',
  ],
  ТСПУ: [
    'Глубокая инспекция пакетов',
    'Читает IP / SNI / DNS',
    'Блокирует по чёрному списку',
    'Установлен у провайдера',
  ],
}

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

function Tooltip({ tip, containerRef }: { tip: TooltipState; containerRef: React.RefObject<HTMLDivElement> }) {
  const color = NODE_COLOR[tip.node.type]
  const lines = NODE_INFO[tip.node.type]
  const PAD = 16

  const rect = containerRef.current?.getBoundingClientRect()
  const w = rect?.width ?? window.innerWidth
  const h = rect?.height ?? window.innerHeight

  // card dimensions (rough estimate)
  const cardW = 260
  const cardH = 100

  let left = tip.x + PAD
  let top  = tip.y + PAD
  if (left + cardW > w) left = tip.x - cardW - PAD
  if (top + cardH > h)  top  = tip.y - cardH - PAD

  return (
    <div
      style={{
        position: 'absolute',
        left,
        top,
        background: '#0d1424',
        border: `1.5px solid ${color}`,
        boxShadow: `0 0 12px ${color}55`,
        padding: '10px 14px',
        pointerEvents: 'none',
        zIndex: 100,
        minWidth: cardW,
      }}
    >
      {/* Header */}
      <div style={{
        fontFamily: '"Press Start 2P", cursive',
        fontSize: 10,
        color,
        marginBottom: 8,
        letterSpacing: '0.1em',
      }}>
        [{NODE_LABEL[tip.node.type]}] {tip.node.type}
      </div>
      {/* Lines */}
      {lines.map((line, i) => (
        <div key={i} style={{
          fontFamily: '"Share Tech Mono", monospace',
          fontSize: 11,
          color: i === 0 ? '#c8d8f0' : '#7a9ab8',
          lineHeight: '1.7',
          paddingLeft: i === 0 ? 0 : 8,
        }}>
          {i === 0 ? line : `› ${line}`}
        </div>
      ))}
    </div>
  )
}

export default function NetworkGraph() {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

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

    const linkSel = svg.append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', '#1e2d4a')
      .attr('stroke-width', 1.5)

    const nodeSel = svg.append('g')
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
          .on('drag', (event, d) => {
            d.fx = event.x; d.fy = event.y
          })
          .on('end', (event, d) => {
            if (!event.active) sim.alphaTarget(0)
            d.fx = null; d.fy = null
          })
      )

    nodeSel.append('rect')
      .attr('x', -SIZE / 2)
      .attr('y', -SIZE / 2)
      .attr('width', SIZE)
      .attr('height', SIZE)
      .attr('fill', d => NODE_COLOR[d.type])
      .attr('fill-opacity', 0.15)
      .attr('stroke', d => NODE_COLOR[d.type])
      .attr('stroke-width', 2)
      .style('filter', d => `drop-shadow(0 0 6px ${NODE_COLOR[d.type]}88)`)

    nodeSel.append('text')
      .text(d => NODE_LABEL[d.type])
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('fill', d => NODE_COLOR[d.type])
      .attr('font-family', '"Press Start 2P", cursive')
      .attr('font-size', '11px')
      .style('pointer-events', 'none')

    nodeSel.append('text')
      .text(d => d.type)
      .attr('text-anchor', 'middle')
      .attr('y', SIZE / 2 + 14)
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

    return () => { sim.stop() }
  }, [])

  return (
    <div ref={containerRef} className="w-full h-full" style={{ position: 'relative' }}>
      <svg ref={svgRef} className="w-full h-full" style={{ background: 'transparent' }} />
      {tooltip && <Tooltip tip={tooltip} containerRef={containerRef} />}
    </div>
  )
}
