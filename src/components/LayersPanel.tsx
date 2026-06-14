import React from 'react'
import { useStore } from '../store'
import { NODE_TYPE_MAP, NODE_MAP, NODE_COLOR } from '../data/topology'
import { NODE_ENCAP } from '../data/nodeInfo'

// OSI layer order top→bottom with sample fields
const OSI = [
  { tag: 'L7', name: 'ПРИКЛАДНОЙ', sample: ['HTTP GET /search', 'Host: google.com'] },
  { tag: 'L4', name: 'ТРАНСПОРТНЫЙ', sample: ['TCP src:52341 dst:443', 'SEQ:1000 ACK:5001 PSH'] },
  { tag: 'L3', name: 'СЕТЕВОЙ', sample: ['IP src:192.168.1.5', 'IP dst:142.250.1.1 TTL:58'] },
  { tag: 'L2', name: 'КАНАЛЬНЫЙ', sample: ['MAC src:aa:bb:cc:dd:ee:ff', 'MAC dst:11:22:33:44:55:66'] },
]

// map a node's NODE_ENCAP layers to per-OSI visibility
function visibilityFor(nodeType: string): Record<string, { sees: boolean; danger?: boolean; encrypted?: boolean; note?: string }> {
  const enc = (NODE_ENCAP as Record<string, { layers: { label: string; sees: boolean; danger?: boolean; encrypted?: boolean }[] }>)[nodeType]
  const out: Record<string, { sees: boolean; danger?: boolean; encrypted?: boolean; note?: string }> = {
    L7: { sees: false }, L4: { sees: false }, L3: { sees: false }, L2: { sees: false },
  }
  if (!enc) return out
  for (const l of enc.layers) {
    const lab = l.label.toLowerCase()
    if (lab.includes('ethernet')) out.L2 = { sees: l.sees, note: 'MAC адреса' }
    else if (lab.includes('ip'))  out.L3 = { sees: l.sees, encrypted: l.encrypted, note: l.label }
    else if (lab.includes('tcp') || lab.includes('udp') || lab.includes('tls') || lab.includes('сегмент')) out.L4 = { sees: l.sees }
    else if (lab.includes('sni') || lab.includes('http') || lab.includes('данные') || lab.includes('dns') || lab.includes('зашифров')) out.L7 = { sees: l.sees, danger: l.danger, encrypted: l.encrypted, note: l.danger ? 'SNI открытым текстом!' : undefined }
  }
  return out
}

export default function LayersPanel() {
  const layersMode = useStore(s => s.layersMode)
  const mode = useStore(s => s.mode)
  const selectedNodeId = useStore(s => s.selectedNodeId)
  if (!layersMode || mode !== 'topology') return null

  const node = selectedNodeId ? NODE_MAP.get(selectedNodeId) : null
  const type = selectedNodeId ? NODE_TYPE_MAP.get(selectedNodeId) : null
  const vis = type ? visibilityFor(type) : null

  return (
    <div style={{ position: 'fixed', top: 0, right: 0, width: 300, height: '100vh', zIndex: 480,
      background: '#0d1424', borderLeft: '2px solid #ffb300', boxShadow: '-8px 0 24px #ffb30022',
      overflowY: 'auto', padding: '16px 18px', fontFamily: '"Share Tech Mono", monospace' }}>
      <div style={{ fontFamily: '"Press Start 2P", cursive', fontSize: 9, color: '#ffb300', marginBottom: 6 }}>
        СЛОИ OSI — ЖИВОЙ ПРОСМОТР
      </div>
      {!node ? (
        <div style={{ fontSize: 12, color: '#5a7090', lineHeight: 1.7, marginTop: 12 }}>
          Кликни на узел чтобы увидеть какие слои пакета он читает.
        </div>
      ) : (
        <>
          <div style={{ fontSize: 11, color: NODE_COLOR[type!], marginBottom: 4 }}>Узел: {node.sublabel}</div>
          <div style={{ fontSize: 10, color: '#4a6a8a', marginBottom: 12 }}>Последний пакет: TCP → google.com</div>
          {OSI.map(layer => {
            const v = vis![layer.tag]
            const seen = v.sees
            const col = v.encrypted ? '#9c6bff' : v.danger ? '#ff4444' : seen ? '#00e676' : '#ff4444'
            return (
              <div key={layer.tag} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 9, color: '#3a4a5a', marginBottom: 2 }}>
                  {layer.tag} ░░░░░░░░░░░░░░░░░░░░░░
                </div>
                <div style={{ border: `1px solid ${col}55`, background: `${col}10`, padding: '6px 8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: col, marginBottom: 4 }}>
                    <span>┌─ {layer.name}</span>
                    <span>{v.encrypted ? '░ зашифровано' : seen ? (v.danger ? '⚠ вижу!' : '✓ вижу') : '✗ не вижу'}</span>
                  </div>
                  {(seen && !v.encrypted ? layer.sample : ['■■■■■■■ НЕДОСТУПНО']).map((s, i) => (
                    <div key={i} style={{ fontSize: 10, color: seen && !v.encrypted ? '#c8d8f0' : '#3a4a5a', lineHeight: 1.5 }}>
                      {s}
                    </div>
                  ))}
                  {v.note && <div style={{ fontSize: 9, color: col, marginTop: 2 }}>{v.note}</div>}
                </div>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}
