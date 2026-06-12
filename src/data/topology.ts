// ─── Node & Link types ────────────────────────────────────────────────────────

import * as d3 from 'd3'

export type NodeType =
  | 'User' | 'Switch' | 'ISP' | 'ТСПУ' | 'VPN'
  | 'WebServer' | 'Firewall'
  | 'DNS_R' | 'DNS_ROOT' | 'DNS_TLD' | 'DNS_AUTH'

export interface NetNode extends d3.SimulationNodeDatum {
  id: string; type: NodeType; label: string
}

export interface EdgeProps {
  bandwidth: number   // Mbps
  latency: number     // ms
  loss: number        // % base packet loss
  channelType: string // human-readable channel description
}

export interface NetLink extends d3.SimulationLinkDatum<NetNode> {
  id: string
  source: string | NetNode
  target: string | NetNode
  props: EdgeProps
}

// ─── Colours ──────────────────────────────────────────────────────────────────

export const NODE_COLOR: Record<NodeType, string> = {
  User:     '#f0f4ff',
  Switch:   '#5a7090',
  ISP:      '#00b4ff',
  ТСПУ:    '#ff4444',
  VPN:      '#9c6bff',
  WebServer:'#8090a0',
  Firewall: '#ff8c00',
  DNS_R:    '#ffb300',
  DNS_ROOT: '#cc8800',
  DNS_TLD:  '#ffd000',
  DNS_AUTH: '#a0cc00',
}

export const NODE_LABEL: Record<NodeType, string> = {
  User:     'U',
  Switch:   'SW',
  ISP:      'ISP',
  ТСПУ:    'T',
  VPN:      'V',
  WebServer:'W',
  Firewall: 'FW',
  DNS_R:    'DNS-R',
  DNS_ROOT: 'ROOT',
  DNS_TLD:  'TLD',
  DNS_AUTH: 'AUTH',
}

export const NODE_FULL_LABEL: Record<NodeType, string> = {
  User:     'User',
  Switch:   'Switch',
  ISP:      'ISP Router',
  ТСПУ:    'ТСПУ',
  VPN:      'VPN',
  WebServer:'WebServer',
  Firewall: 'Firewall',
  DNS_R:    'DNS Recursive',
  DNS_ROOT: 'DNS Root',
  DNS_TLD:  'DNS TLD',
  DNS_AUTH: 'DNS Auth',
}

// ─── Static topology ──────────────────────────────────────────────────────────

export const NODES: NetNode[] = [
  { id: 'user1',    type: 'User',     label: 'U'    },
  { id: 'sw1',      type: 'Switch',   label: 'SW'   },
  { id: 'isp1',     type: 'ISP',      label: 'ISP'  },
  { id: 'tspu1',    type: 'ТСПУ',    label: 'T'    },
  { id: 'vpn1',     type: 'VPN',      label: 'V'    },
  { id: 'fw1',      type: 'Firewall', label: 'FW'   },
  { id: 'ws1',      type: 'WebServer',label: 'W'    },
  { id: 'dnsr1',    type: 'DNS_R',    label: 'DNS-R'},
  { id: 'dnsroot1', type: 'DNS_ROOT', label: 'ROOT' },
  { id: 'dnstld1',  type: 'DNS_TLD',  label: 'TLD'  },
  { id: 'dnsauth1', type: 'DNS_AUTH', label: 'AUTH' },
]

export const NODE_TYPE_MAP = new Map(NODES.map(n => [n.id, n.type]))

export const LINKS: NetLink[] = [
  { id: 'l-user-sw',       source: 'user1',    target: 'sw1',
    props: { bandwidth: 1000,  latency: 0.1, loss: 0,    channelType: 'Домашний Ethernet' }},
  { id: 'l-sw-isp',        source: 'sw1',      target: 'isp1',
    props: { bandwidth: 1000,  latency: 1,   loss: 0.01, channelType: 'Абонентский канал' }},
  { id: 'l-isp-tspu',      source: 'isp1',     target: 'tspu1',
    props: { bandwidth: 10000, latency: 0.5, loss: 0,    channelType: 'Магистраль ISP' }},
  { id: 'l-tspu-vpn',      source: 'tspu1',    target: 'vpn1',
    props: { bandwidth: 10000, latency: 2,   loss: 0,    channelType: 'Магистраль / DPI' }},
  { id: 'l-vpn-fw',        source: 'vpn1',     target: 'fw1',
    props: { bandwidth: 1000,  latency: 45,  loss: 0.1,  channelType: 'Международный канал' }},
  { id: 'l-fw-ws',         source: 'fw1',      target: 'ws1',
    props: { bandwidth: 1000,  latency: 1,   loss: 0,    channelType: 'Датацентр LAN' }},
  { id: 'l-user-dnsr',     source: 'user1',    target: 'dnsr1',
    props: { bandwidth: 100,   latency: 5,   loss: 0.1,  channelType: 'DNS запрос' }},
  { id: 'l-dnsr-root',     source: 'dnsr1',    target: 'dnsroot1',
    props: { bandwidth: 1000,  latency: 80,  loss: 0,    channelType: 'Трансатлантический' }},
  { id: 'l-root-tld',      source: 'dnsroot1', target: 'dnstld1',
    props: { bandwidth: 1000,  latency: 20,  loss: 0,    channelType: 'DNS иерархия' }},
  { id: 'l-tld-auth',      source: 'dnstld1',  target: 'dnsauth1',
    props: { bandwidth: 1000,  latency: 10,  loss: 0,    channelType: 'DNS иерархия' }},
  { id: 'l-auth-dnsr',     source: 'dnsauth1', target: 'dnsr1',
    props: { bandwidth: 1000,  latency: 5,   loss: 0,    channelType: 'DNS ответ' }},
]

export function edgeKey(a: string, b: string): string { return [a, b].sort().join('::') }
export const nid = (n: string | NetNode): string => typeof n === 'string' ? n : n.id

export function linkEdgeKey(l: NetLink): string {
  return edgeKey(nid(l.source), nid(l.target))
}

// OSPF cost: reference = 10 Gbps = 10000 Mbps → cost = 10000 / bw_mbps
export function ospfCost(bw: number): number { return Math.max(1, Math.round(10000 / bw)) }

// Edge colour by utilization
export function utilColor(util: number): string {
  if (util < 30) return '#1e2d4a'
  if (util < 60) return '#00b4ff'
  if (util < 80) return '#ffb300'
  return '#ff4444'
}

// Edge width by bandwidth
export function bwWidth(bw: number): number {
  if (bw >= 10000) return 4
  if (bw >= 1000)  return 2.5
  return 1.5
}
