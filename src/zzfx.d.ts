declare module 'zzfx' {
  export function zzfx(...params: number[]): AudioBufferSourceNode
  export const ZZFX: { volume: number; sampleRate: number; x: AudioContext;
    play(...params: number[]): AudioBufferSourceNode;
    buildSamples(...params: number[]): number[];
    playSamples(...samples: number[][]): AudioBufferSourceNode }
}
