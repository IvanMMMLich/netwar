import React from 'react'
import NetworkGraph from './NetworkGraph'

export default function App() {
  return (
    <div className="scanlines relative min-h-screen w-full bg-bg overflow-hidden">
      {/* Full-screen graph */}
      <div className="absolute inset-0">
        <NetworkGraph />
      </div>

      {/* Title overlay */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-3 pointer-events-none z-10">
        <h1
          className="font-pixel text-3xl md:text-5xl tracking-widest select-none"
          style={{
            color: '#00e676',
            textShadow: '0 0 10px #00e676, 0 0 30px #00e676aa, 0 0 60px #00e67644',
          }}
        >
          NETWAR
        </h1>
      </div>

      {/* Corner HUD */}
      <div className="absolute top-4 left-4 font-mono text-[10px] text-accent-green/40 tracking-widest pointer-events-none">
        SYS::NETWAR v0.1.0
      </div>
      <div className="absolute top-4 right-4 font-mono text-[10px] text-accent-blue/40 tracking-widest pointer-events-none">
        STATUS::ONLINE
      </div>
      <div className="absolute bottom-4 left-4 font-mono text-[10px] text-accent-purple/40 tracking-widest pointer-events-none">
        NODES::8 &nbsp; EDGES::10
      </div>
      <div className="absolute bottom-4 right-4 font-mono text-[10px] text-accent-green/40 tracking-widest pointer-events-none">
        GRID::ACTIVE
      </div>
    </div>
  )
}
