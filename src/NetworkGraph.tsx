import React, { useEffect, useRef } from 'react'
import * as d3 from 'd3'

type NodeType = 'Router' | 'Switch' | 'CDN' | 'VPN' | 'DNS' | 'ТСПУ'

interface NetNode extends d3.SimulationNodeDatum {
  id: string
  type: NodeType
  label: string
}

interface NetLink extends d3.SimulationLinkDatum<NetNode> {
  source: string | NetNode
  target: string | NetNode
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

const NODES: NetNode[] = [
  { id: 'r1', type: 'Router', label: 'R' },
  { id: 'r2', type: 'Router', label: 'R' },
  { id: 's1', type: 'Switch', label: 'S' },
  { id: 'cdn1', type: 'CDN',  label: 'C' },
  { id: 'vpn1', type: 'VPN',  label: 'V' },
  { id: 'dns1', type: 'DNS',  label: 'D' },
  { id: 'tspu1', type: 'ТСПУ', label: 'T' },
  { id: 's2', type: 'Switch', label: 'S' },
]

const LINKS: NetLink[] = [
  { source: 'r1',   target: 'r2'   },
  { source: 'r1',   target: 's1'   },
  { source: 'r1',   target: 'tspu1' },
  { source: 'r2',   target: 's2'   },
  { source: 'r2',   target: 'vpn1' },
  { source: 's1',   target: 'cdn1' },
  { source: 's1',   target: 'dns1' },
  { source: 's2',   target: 'dns1' },
  { source: 'tspu1', target: 'vpn1' },
  { source: 'cdn1', target: 's2'   },
]

const SIZE = 32

export default function NetworkGraph() {
  const svgRef = useRef<SVGSVGElement>(null)

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

    // Square node body
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

    // Node letter
    nodeSel.append('text')
      .text(d => NODE_LABEL[d.type])
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('fill', d => NODE_COLOR[d.type])
      .attr('font-family', '"Press Start 2P", cursive')
      .attr('font-size', '11px')
      .style('pointer-events', 'none')

    // Node type label below
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
    <svg
      ref={svgRef}
      className="w-full h-full"
      style={{ background: 'transparent' }}
    />
  )
}
