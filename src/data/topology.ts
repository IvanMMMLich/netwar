// ─── Fixed-coordinate topology for NetWar ───────────────────────────────────────

export type NodeType =
  | 'User' | 'Switch' | 'ISP' | 'ТСПУ' | 'VPN' | 'Firewall' | 'WebServer'
  | 'DNS_Stub' | 'DNS_R' | 'DNS_ROOT' | 'DNS_TLD' | 'DNS_AUTH'

export interface NetNode {
  id: string
  type: NodeType
  x: number
  y: number
  label: string
  sublabel: string
  blocked?: boolean
}

export interface EdgeProps {
  bandwidth: number   // Mbps
  latency: number     // ms
  loss: number        // % base packet loss
  channelType: string
}

export interface NetEdge {
  id: string
  source: string
  target: string
  props: EdgeProps
  dashed?: boolean
  color?: string
}

export const CANVAS_W = 1280
export const CANVAS_H = 1000
export const NODE_SIZE = 56

// ─── Colours ──────────────────────────────────────────────────────────────────

export const NODE_COLOR: Record<NodeType, string> = {
  User:      '#f0f4ff',
  Switch:    '#5a7090',
  ISP:       '#00b4ff',
  ТСПУ:     '#ff4444',
  VPN:       '#9c6bff',
  Firewall:  '#ff8c00',
  WebServer: '#8090a0',
  DNS_Stub:  '#ffb300',
  DNS_R:     '#ffb300',
  DNS_ROOT:  '#cc8800',
  DNS_TLD:   '#ffd000',
  DNS_AUTH:  '#a0cc00',
}

export const NODE_FULL_LABEL: Record<NodeType, string> = {
  User:      'User',
  Switch:    'Switch',
  ISP:       'ISP Router',
  ТСПУ:     'ТСПУ',
  VPN:       'VPN Server',
  Firewall:  'Firewall',
  WebServer: 'WebServer',
  DNS_Stub:  'DNS Stub Resolver',
  DNS_R:     'DNS Recursive',
  DNS_ROOT:  'DNS Root',
  DNS_TLD:   'DNS TLD',
  DNS_AUTH:  'DNS Authoritative',
}

// ─── Nodes ────────────────────────────────────────────────────────────────────

export const NODES: NetNode[] = [
  // Users (left)
  { id: 'u1', type: 'User', x: 80,  y: 200, label: 'U1', sublabel: 'User-1' },
  { id: 'u2', type: 'User', x: 80,  y: 420, label: 'U2', sublabel: 'User-2' },
  { id: 'u3', type: 'User', x: 80,  y: 640, label: 'U3', sublabel: 'User-3' },

  // Provider path (center)
  { id: 'sw1',  type: 'Switch',   x: 260, y: 420, label: 'SW',  sublabel: 'Switch' },
  { id: 'isp1', type: 'ISP',      x: 440, y: 420, label: 'ISP', sublabel: 'ISP Router' },
  { id: 'tspu1',type: 'ТСПУ',    x: 640, y: 420, label: 'T',   sublabel: 'ТСПУ' },
  { id: 'vpn1', type: 'VPN',      x: 820, y: 280, label: 'V',   sublabel: 'VPN' },
  { id: 'fw1',  type: 'Firewall', x: 940, y: 420, label: 'FW',  sublabel: 'Firewall' },

  // Web servers (right)
  { id: 'ws1', type: 'WebServer', x: 1100, y: 200, label: 'WS1', sublabel: 'news.com' },
  { id: 'ws2', type: 'WebServer', x: 1100, y: 420, label: 'WS2', sublabel: 'google.com' },
  { id: 'ws3', type: 'WebServer', x: 1100, y: 640, label: 'WS3', sublabel: 'blocked.com', blocked: true },

  // DNS hierarchy (bottom)
  { id: 'dnsstub1', type: 'DNS_Stub', x: 260,  y: 780, label: 'STUB', sublabel: 'DNS Stub' },
  { id: 'dnsr1',    type: 'DNS_R',    x: 440,  y: 780, label: 'DNS-R',sublabel: 'Recursive' },
  { id: 'dnsroot1', type: 'DNS_ROOT', x: 640,  y: 900, label: 'ROOT', sublabel: '13 Root' },
  { id: 'dnstld1',  type: 'DNS_TLD',  x: 820,  y: 900, label: 'TLD',  sublabel: '.com TLD' },
  { id: 'dnsauth1', type: 'DNS_AUTH', x: 1000, y: 780, label: 'NS1',  sublabel: 'ns1.google' },
  { id: 'dnsauth2', type: 'DNS_AUTH', x: 1000, y: 900, label: 'NS2',  sublabel: 'ns1.blocked' },
]

export const NODE_MAP = new Map(NODES.map(n => [n.id, n]))
export const NODE_TYPE_MAP = new Map(NODES.map(n => [n.id, n.type]))

// ─── Edges ────────────────────────────────────────────────────────────────────

const E = (id: string, source: string, target: string, props: EdgeProps,
           extra?: Partial<NetEdge>): NetEdge => ({ id, source, target, props, ...extra })

export const EDGES: NetEdge[] = [
  E('e-u1-sw', 'u1', 'sw1', { bandwidth: 1000,  latency: 0.1, loss: 0,    channelType: 'Домашний Ethernet' }),
  E('e-u2-sw', 'u2', 'sw1', { bandwidth: 1000,  latency: 0.1, loss: 0,    channelType: 'Домашний Ethernet' }),
  E('e-u3-sw', 'u3', 'sw1', { bandwidth: 1000,  latency: 0.1, loss: 0,    channelType: 'Домашний Ethernet' }),

  E('e-sw-isp',  'sw1',  'isp1',  { bandwidth: 1000,  latency: 1,   loss: 0.01, channelType: 'Аплинк провайдера' }),
  E('e-isp-tspu','isp1', 'tspu1', { bandwidth: 10000, latency: 0.5, loss: 0,    channelType: 'Магистраль' }),
  E('e-tspu-vpn','tspu1','vpn1',  { bandwidth: 10000, latency: 2,   loss: 0,    channelType: 'Международный (туннель)' },
    { dashed: true, color: '#9c6bff' }),
  E('e-tspu-fw', 'tspu1','fw1',   { bandwidth: 10000, latency: 1,   loss: 0,    channelType: 'Прямой путь' }),
  E('e-vpn-fw',  'vpn1', 'fw1',   { bandwidth: 1000,  latency: 45,  loss: 0.1,  channelType: 'Зарубежный хост' }),

  E('e-fw-ws1', 'fw1', 'ws1', { bandwidth: 10000, latency: 0.2, loss: 0, channelType: 'Датацентр' }),
  E('e-fw-ws2', 'fw1', 'ws2', { bandwidth: 10000, latency: 0.2, loss: 0, channelType: 'Датацентр' }),
  E('e-fw-ws3', 'fw1', 'ws3', { bandwidth: 10000, latency: 0.2, loss: 0, channelType: 'Датацентр' }),

  E('e-u2-stub',   'u2',       'dnsstub1', { bandwidth: 1000, latency: 0.1, loss: 0,   channelType: 'Локальный резолвер' }),
  E('e-stub-dnsr', 'dnsstub1', 'dnsr1',    { bandwidth: 100,  latency: 5,   loss: 0.1, channelType: 'DNS запрос' }),
  E('e-dnsr-root', 'dnsr1',    'dnsroot1', { bandwidth: 1000, latency: 80,  loss: 0,   channelType: 'Трансатлантический' }),
  E('e-root-tld',  'dnsroot1', 'dnstld1',  { bandwidth: 1000, latency: 20,  loss: 0,   channelType: 'DNS иерархия' }),
  E('e-tld-auth1', 'dnstld1',  'dnsauth1', { bandwidth: 1000, latency: 10,  loss: 0,   channelType: 'DNS иерархия' }),
  E('e-tld-auth2', 'dnstld1',  'dnsauth2', { bandwidth: 1000, latency: 10,  loss: 0,   channelType: 'DNS иерархия' }),
]

// Pair → edge lookup (undirected)
export function pairKey(a: string, b: string): string { return [a, b].sort().join('::') }
export const EDGE_BY_PAIR = new Map(EDGES.map(e => [pairKey(e.source, e.target), e]))

// ─── Visual helpers ─────────────────────────────────────────────────────────────

export function ospfCost(bw: number): number { return Math.max(1, Math.round(10000 / bw)) }

export function utilColor(util: number): string {
  if (util < 30) return '#1e2d4a'
  if (util < 60) return '#00b4ff'
  if (util < 80) return '#ffb300'
  return '#ff4444'
}

export function bwWidth(bw: number): number {
  if (bw >= 10000) return 4
  if (bw >= 1000)  return 2
  return 1
}

export function bwLabel(bw: number): string {
  return bw >= 1000 ? `${bw / 1000} Гбит/с` : `${bw} Мбит/с`
}

// ─── Packet route templates ──────────────────────────────────────────────────

export type PacketKind = 'http' | 'blocked' | 'tunnel' | 'dns'

export interface RouteTemplate {
  kind: PacketKind
  nodes: string[]
}

// Users that can originate traffic
export const USER_IDS = ['u1', 'u2', 'u3']

export function buildHttpRoute(userId: string, wsId: string): RouteTemplate {
  return { kind: 'http', nodes: [userId, 'sw1', 'isp1', 'tspu1', 'fw1', wsId] }
}
export function buildBlockedRoute(userId: string): RouteTemplate {
  // Reaches ТСПУ then gets destroyed (target was ws3 / blocked.com)
  return { kind: 'blocked', nodes: [userId, 'sw1', 'isp1', 'tspu1'] }
}
export function buildTunnelRoute(userId: string): RouteTemplate {
  return { kind: 'tunnel', nodes: [userId, 'sw1', 'isp1', 'tspu1', 'vpn1', 'fw1', 'ws3'] }
}
export function buildDnsRoute(): RouteTemplate {
  const forward = ['u2', 'dnsstub1', 'dnsr1', 'dnsroot1', 'dnstld1', 'dnsauth1']
  const back    = [...forward].reverse().slice(1) // back to u2 without repeating auth
  return { kind: 'dns', nodes: [...forward, ...back] }
}

export const VPN_ID = 'vpn1'
export const TSPU_ID = 'tspu1'

export function isTunnelSegment(a: string, b: string): boolean {
  return a === VPN_ID || b === VPN_ID
}
