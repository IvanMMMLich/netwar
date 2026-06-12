import React from 'react'
import NetworkGraph from './NetworkGraph'

export default function App() {
  return (
    <div className="scanlines relative min-h-screen w-full bg-bg overflow-hidden">
      {/* Full-screen graph */}
      <div className="absolute inset-0">
        <NetworkGraph />
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
