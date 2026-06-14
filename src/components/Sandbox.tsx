import React from 'react'

// Sandbox mode — grows across blocks 2-8. Block 1: empty gridded canvas.
export default function Sandbox() {
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#070b14' }}>
      {/* millimeter-paper grid */}
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <pattern id="sbgrid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#0d1424" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#sbgrid)" />
      </svg>
      <div style={{
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        fontFamily: '"Share Tech Mono", monospace', color: '#2a3a4a', fontSize: 13,
        letterSpacing: '0.2em', pointerEvents: 'none', textAlign: 'center',
      }}>
        SANDBOX — перетащи узлы из панели слева
      </div>
    </div>
  )
}
