import React, { useState, useEffect } from 'react'
import { audio } from '../services/audioEngine'

export default function SoundToggle() {
  const [on, setOn] = useState(false)

  // resume AudioContext on first user gesture (browser autoplay policy)
  useEffect(() => {
    const onFirst = () => {
      if (localStorage.getItem('netwar_audio_enabled') === 'true' && !audio.isEnabled()) {
        audio.enable(); setOn(true)
      }
      window.removeEventListener('pointerdown', onFirst)
    }
    window.addEventListener('pointerdown', onFirst)
    return () => window.removeEventListener('pointerdown', onFirst)
  }, [])

  return (
    <button
      onClick={() => setOn(audio.toggle())}
      title={on ? 'Звук включён' : 'Звук выключен'}
      style={{
        position: 'absolute', top: 14, right: 130, zIndex: 65,
        background: '#0d1424', border: `1px solid ${on ? '#00e676' : '#1e2d4a'}`,
        color: on ? '#00e676' : '#5a7090', width: 30, height: 24, cursor: 'pointer',
        fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {on ? '🔊' : '🔇'}
    </button>
  )
}
