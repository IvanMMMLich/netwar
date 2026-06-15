import React, { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'

// AS-level thresholds on total income
const AS_THRESHOLDS = [0, 5000, 20000]
const AS_UNLOCK: Record<number, string> = { 2: 'VPN серверы и Firewall', 3: 'CDN и второй регион' }

export default function EconomyHUD() {
  const bits = useStore(s => s.bits)
  const score = useStore(s => s.score)
  const cleanIPs = useStore(s => s.cleanIPs)
  const asLevel = useStore(s => s.asLevel)
  const totalIncome = useStore(s => s.totalIncome)
  const upkeepRate = useStore(s => s.upkeepRate)
  const incomeRate = useStore(s => s.incomeRate)
  const mode = useStore(s => s.mode)
  const setAsLevel = useStore(s => s.setAsLevel)
  const earn = useStore(s => s.earn)
  const panelOpen = useStore(s => s.selectedNodeId !== null && s.mode === 'topology')
  const isTopology = mode === 'topology'
  const balance = incomeRate - upkeepRate
  const lowBalance = bits < 0

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

  if (mode === 'history') return null

  return (
    <>
      <div style={{
        position: 'absolute', top: 38, right: panelOpen ? 316 : 16, zIndex: 60,
        fontFamily: '"Share Tech Mono", monospace', fontSize: 12,
        display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4,
        pointerEvents: 'auto', transition: 'right .25s ease', cursor: 'help',
        animation: lowBalance && !isTopology ? 'sbflash .8s infinite' : 'none',
        padding: lowBalance && !isTopology ? '2px 6px' : 0,
      }}>
        {isTopology ? (
          <span title="Очки за доставку пакетов в обучающем режиме. Не тратятся — это счёт, а не валюта."
            style={{ color: '#00e676', textShadow: '0 0 6px #00e67666' }}>ОЧКИ: {score.toLocaleString()}</span>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 16 }}>
              <span title="Основная валюта. Зарабатываешь за доставку пакетов. Тратишь на строительство и содержание узлов. При нуле — инфраструктура отключается."
                style={{ color: lowBalance ? '#ff4444' : '#ffb300', textShadow: '0 0 6px #ffb30066' }}>БИТЫ: {Math.round(bits).toLocaleString()} ⬡</span>
              <span title="Чистые IP не в чёрном списке ТСПУ. Нужны для VPN серверов. Добываются за сценарии или 2000 битов."
                style={{ color: '#9c6bff', textShadow: '0 0 6px #9c6bff66' }}>ЧИП-IP: {cleanIPs} ◈</span>
              <span title="Уровень AS. L1: до 10 узлов. L2 (5000⬡): +VPN/Firewall. L3 (20000⬡): +CDN."
                style={{ color: '#00b4ff', textShadow: '0 0 6px #00b4ff66' }}>AS LEVEL: {asLevel}</span>
            </div>
            <div style={{ display: 'flex', gap: 14, fontSize: 11 }}>
              <span title="Стоимость содержания всех узлов и каналов. Чем больше инфраструктура — тем дороже. Оптимизируй маршруты."
                style={{ color: '#ff4444' }}>РАСХОД: -{upkeepRate.toFixed(1)} ⬡/с</span>
              <span style={{ color: '#00e676' }}>ДОХОД: +{incomeRate.toFixed(1)} ⬡/с</span>
              <span style={{ color: balance >= 0 ? '#00e676' : '#ff4444' }}>БАЛАНС: {balance >= 0 ? '+' : ''}{balance.toFixed(1)} ⬡/с</span>
            </div>
            {lowBalance && <span style={{ color: '#ff4444', fontSize: 11 }}>⚠ Баланс отрицательный! Удали дорогие узлы</span>}
          </>
        )}
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
