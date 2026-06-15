import React, { useState, useEffect } from 'react'
import * as Tone from 'tone'
import { startMusic, stopMusic } from '../services/music'
import { setSfxEnabled } from '../services/sfx'

export default function SoundToggle() {
  const [on, setOn] = useState(false)

  const enable = async () => {
    await Tone.start()                       // unlock AudioContext (user gesture)
    setSfxEnabled(true); startMusic(); setOn(true)
    localStorage.setItem('netwar_audio_enabled', 'true')
  }
  const disable = () => {
    setSfxEnabled(false); stopMusic(); setOn(false)
    localStorage.setItem('netwar_audio_enabled', 'false')
  }

  // auto-enable on first gesture if previously enabled
  useEffect(() => {
    const onFirst = () => {
      if (localStorage.getItem('netwar_audio_enabled') === 'true' && !on) enable()
      window.removeEventListener('pointerdown', onFirst)
    }
    window.addEventListener('pointerdown', onFirst)
    return () => window.removeEventListener('pointerdown', onFirst)
  }, []) // eslint-disable-line

  return (
    <button onClick={() => (on ? disable() : enable())} title={on ? 'Звук включён' : 'Звук выключен'}
      style={{ position: 'absolute', top: 14, right: 130, zIndex: 65,
        background: '#0d1424', border: `1px solid ${on ? '#00e676' : '#1e2d4a'}`,
        color: on ? '#00e676' : '#5a7090', width: 30, height: 24, cursor: 'pointer',
        fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {on ? '🔊' : '🔇'}
    </button>
  )
}
