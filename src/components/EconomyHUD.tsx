import React, { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'

// AS-level thresholds on total income
const AS_THRESHOLDS = [0, 5000, 20000]
const AS_UNLOCK: Record<number, string> = { 2: 'VPN серверы и Firewall', 3: 'CDN и второй регион' }

export default function EconomyHUD() {
  const bits = useStore(s => s.bits)
  const cleanIPs = useStore(s => s.cleanIPs)
  const asLevel = useStore(s => s.asLevel)
  const totalIncome = useStore(s => s.totalIncome)
  const setAsLevel = useStore(s => s.setAsLevel)
  const earn = useStore(s => s.earn)
  const panelOpen = useStore(s => s.selectedNodeId !== null && s.mode === 'topology')

  const [levelUp, setLevelUp] = useState<string | null>(null)
  const prevLevel = useRef(asLevel)

  // level-up watcher
  useEffect(() => {
    const next = AS_THRESHOLDS.filter(t => totalIncome >= t).length
    if (next > asLevel) {
      setAsLevel(next)
      earn(500) // bonus
    }
  }, [totalIncome, asLevel, setAsLevel, earn])

  useEffect(() => {
    if (asLevel > prevLevel.current) {
      setLevelUp(`⬆ AS LEVEL UP! Теперь доступны ${AS_UNLOCK[asLevel] ?? 'новые узлы'}`)
      const t = setTimeout(() => setLevelUp(null), 3500)
      prevLevel.current = asLevel
      return () => clearTimeout(t)
    }
    prevLevel.current = asLevel
  }, [asLevel])

  return (
    <>
      <div style={{
        position: 'absolute', top: 38, right: panelOpen ? 316 : 16, zIndex: 60,
        fontFamily: '"Share Tech Mono", monospace', fontSize: 12,
        display: 'flex', gap: 16, pointerEvents: 'none', transition: 'right .25s ease',
      }}>
        <span style={{ color: '#ffb300', textShadow: '0 0 6px #ffb30066' }}>БИТЫ: {bits.toLocaleString()} ⬡</span>
        <span style={{ color: '#9c6bff', textShadow: '0 0 6px #9c6bff66' }}>ЧИП-IP: {cleanIPs} ◈</span>
        <span style={{ color: '#00b4ff', textShadow: '0 0 6px #00b4ff66' }}>AS LEVEL: {asLevel}</span>
      </div>

      {/* level-up flash */}
      {levelUp && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: '#00e67622', zIndex: 1400,
            pointerEvents: 'none', animation: 'sbflash .6s' }} />
          <div style={{ position: 'fixed', top: '40%', left: '50%', transform: 'translateX(-50%)', zIndex: 1401,
            fontFamily: '"Press Start 2P", cursive', fontSize: 12, color: '#00e676',
            textShadow: '0 0 14px #00e676', background: '#0d1424', border: '2px solid #00e676',
            padding: '14px 22px', pointerEvents: 'none', textAlign: 'center' }}>
            {levelUp}<div style={{ fontSize: 9, marginTop: 8, color: '#ffb300' }}>+500 ⬡ бонус</div>
          </div>
        </>
      )}
    </>
  )
}
