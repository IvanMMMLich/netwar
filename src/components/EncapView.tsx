import React from 'react'
import { NodeType, NODE_TYPE_MAP } from '../data/topology'
import { Protocols } from '../store'

interface Layer {
  label: string
  sub?:  string
  level: number // 2,3,4,7
  active: boolean
  encrypted?: boolean
}

function buildLayers(targetType: NodeType, protocols: Protocols): Layer[] {
  const https    = protocols.application === 'HTTPS'
  const vpnActive = protocols.vpn !== 'none'
  const appLabel = https ? 'HTTPS данные (L7) [зашифровано]' : 'HTTP данные (L7)'

  // VPN encapsulation
  if (vpnActive && (targetType === 'VPN' || targetType === 'ТСПУ')) {
    return [
      { label: 'Ethernet frame (L2)',             level: 2,  active: targetType === 'ТСПУ' ? false : true },
      { label: `IP src=User dst=VPN (L3)`,        level: 3,  active: true, sub: 'Внешний заголовок — виден ТСПУ' },
      { label: `${protocols.vpn} / UDP (L4)`,     level: 4,  active: targetType === 'ТСПУ', sub: 'Транспорт туннеля' },
      { label: '▒▒▒ ЗАШИФРОВАНО ▒▒▒',            level: 7,  active: false, encrypted: true,
        sub: 'IP + TCP + HTTP внутри — не читается' },
    ]
  }

  // Switch — only L2 active
  if (targetType === 'Switch') {
    return [
      { label: 'Ethernet frame (L2)',   level: 2, active: true,  sub: 'MAC src → MAC dst' },
      { label: 'IP packet (L3)',        level: 3, active: false },
      { label: 'TCP segment (L4)',      level: 4, active: false },
      { label: appLabel,               level: 7, active: false },
    ]
  }

  // ISP Router / Firewall — L3
  if (targetType === 'ISP' || targetType === 'Firewall') {
    return [
      { label: 'Ethernet frame (L2)',   level: 2, active: false },
      { label: 'IP packet (L3)',        level: 3, active: true,  sub: 'src/dst IP адреса' },
      { label: 'TCP segment (L4)',      level: 4, active: false },
      { label: appLabel,               level: 7, active: false },
    ]
  }

  // ТСПУ — sees L3+L4+L7 (unless HTTPS/VPN)
  if (targetType === 'ТСПУ') {
    return [
      { label: 'Ethernet frame (L2)',                level: 2, active: false },
      { label: 'IP packet (L3)',                     level: 3, active: true,  sub: 'IP src/dst — читает' },
      { label: 'TCP segment (L4)',                   level: 4, active: true,  sub: 'порт + SNI — читает' },
      { label: appLabel,                             level: 7,
        active: !https, sub: https ? 'зашифровано TLS' : 'открытый HTTP — читает' },
    ]
  }

  // DNS nodes — DNS packet
  if (['DNS_R', 'DNS_ROOT', 'DNS_TLD', 'DNS_AUTH'].includes(targetType)) {
    const proto = protocols.dns
    const enc   = proto === 'DoH' || proto === 'DoT'
    return [
      { label: 'Ethernet frame (L2)',              level: 2, active: false },
      { label: 'IP packet (L3)',                   level: 3, active: true },
      { label: enc ? `TLS (${proto}) (L4)` : 'UDP 53 (L4)', level: 4, active: true },
      { label: enc ? 'DNS query [зашифрован]' : 'DNS query: site.com A?', level: 7,
        active: true, encrypted: enc },
    ]
  }

  // Default / WebServer
  return [
    { label: 'Ethernet frame (L2)',   level: 2, active: false },
    { label: 'IP packet (L3)',        level: 3, active: true },
    { label: 'TCP segment (L4)',      level: 4, active: true,  sub: 'порт 443' },
    { label: appLabel,               level: 7, active: true },
  ]
}

const LEVEL_COLOR: Record<number, string> = { 2: '#5a7090', 3: '#00b4ff', 4: '#9c6bff', 7: '#00e676' }

interface Props {
  x: number; y: number
  targetId: string
  protocols: Protocols
  cref: React.RefObject<HTMLDivElement>
}

export default function EncapView({ x, y, targetId, protocols, cref }: Props) {
  const type = NODE_TYPE_MAP.get(targetId)
  if (!type) return null

  const layers  = buildLayers(type, protocols)
  const cardW   = 340
  const cardH   = 200
  const PAD     = 14
  const rect    = cref.current?.getBoundingClientRect()
  const cw = rect?.width ?? window.innerWidth; const ch = rect?.height ?? window.innerHeight
  let left = x + PAD; let top = y + PAD
  if (left + cardW > cw) left = x - cardW - PAD
  if (top  + cardH > ch) top  = y - cardH - PAD

  return (
    <div style={{ position: 'absolute', left, top, width: cardW, zIndex: 250,
      background: '#0d1424', border: '1.5px solid #1e2d4a',
      boxShadow: '0 0 16px #00b4ff22', padding: '10px 14px', pointerEvents: 'none' }}>
      <div style={{ fontFamily: '"Press Start 2P", cursive', fontSize: 8,
        color: '#4a6a8a', marginBottom: 8, letterSpacing: '0.1em' }}>
        ИНКАПСУЛЯЦИЯ ПАКЕТА
      </div>
      {layers.map((l, i) => {
        const c = l.encrypted ? '#444' : l.active ? LEVEL_COLOR[l.level] : '#2a3a4a'
        return (
          <div key={i} style={{ paddingLeft: i * 10, marginBottom: 2 }}>
            <div style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 11,
              color: c, display: 'flex', alignItems: 'baseline', gap: 6,
              background: l.active && !l.encrypted ? `${c}11` : 'transparent',
              padding: '1px 4px',
              border: l.active ? `1px solid ${c}44` : '1px solid transparent' }}>
              <span style={{ flexShrink: 0 }}>{'└─'.slice(i === 0 ? 2 : 0)}</span>
              <span>{l.label}</span>
            </div>
            {l.sub && (
              <div style={{ paddingLeft: i * 10 + 16, fontFamily: '"Share Tech Mono", monospace',
                fontSize: 9, color: '#3a5a7a', lineHeight: '1.4' }}>
                {l.sub}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
