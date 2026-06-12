import React from 'react'

export default function App() {
  return (
    <div className="scanlines min-h-screen w-full bg-bg flex flex-col items-center justify-center overflow-hidden">
      {/* Ambient glow rings */}
      <div className="absolute w-[600px] h-[600px] rounded-full border border-accent-green/10 animate-pulse" />
      <div className="absolute w-[400px] h-[400px] rounded-full border border-accent-blue/10" style={{ animationDelay: '1s' }} />

      {/* Title block */}
      <div className="relative flex flex-col items-center gap-6 z-10">
        <h1
          className="font-pixel text-4xl md:text-6xl tracking-widest select-none"
          style={{
            color: '#00e676',
            textShadow:
              '0 0 10px #00e676, 0 0 30px #00e676aa, 0 0 60px #00e67644',
          }}
        >
          NETWAR
        </h1>

        <p
          className="font-mono text-accent-blue text-xs md:text-sm tracking-[0.3em] uppercase"
          style={{ textShadow: '0 0 8px #00b4ff88' }}
        >
          Initializing systems...
        </p>

        {/* Status bar */}
        <div className="flex gap-4 mt-4">
          {['NODE', 'GRID', 'SYNC'].map((label) => (
            <div key={label} className="flex items-center gap-2 font-mono text-xs text-accent-purple/70">
              <span
                className="w-2 h-2 rounded-full bg-accent-purple animate-pulse"
                style={{ boxShadow: '0 0 6px #9c6bff' }}
              />
              {label}
            </div>
          ))}
        </div>
      </div>

      {/* Corner decorations */}
      <div className="absolute top-4 left-4 font-mono text-[10px] text-accent-green/30 tracking-widest">
        SYS::NETWAR v0.1.0
      </div>
      <div className="absolute top-4 right-4 font-mono text-[10px] text-accent-blue/30 tracking-widest">
        STATUS::ONLINE
      </div>
      <div className="absolute bottom-4 left-4 font-mono text-[10px] text-accent-purple/30 tracking-widest">
        GRID::ACTIVE
      </div>
      <div className="absolute bottom-4 right-4 font-mono text-[10px] text-accent-green/30 tracking-widest">
        NODES::0
      </div>
    </div>
  )
}
