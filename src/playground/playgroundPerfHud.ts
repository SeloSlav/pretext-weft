import type { PlaygroundPerfStats } from './PlaygroundRuntime'

/** How often the playground / scenery profiler HUD syncs from the runtime (avoids React re-rendering every frame). */
export const PERF_HUD_POLL_INTERVAL_MS = 500

function fmt(n: number, digits: number): string {
  return n.toFixed(digits)
}

/** Plain-text summary of rolling long-window averages for notes, issues, or spreadsheets. */
export function formatPlaygroundPerfClipboardText(stats: PlaygroundPerfStats): string {
  const w = stats.longWindow
  const lines = [
    `Weft profiler — rolling average over last ${w.windowSec}s wall time (${w.sampleCount} frame samples)`,
    `viewport ${stats.viewportWidth}x${stats.viewportHeight} dpr ${fmt(stats.pixelRatio, 2)}`,
    `fpsAvg\t${fmt(w.fpsAvg, 2)}`,
    `frameCpuMsAvg\t${fmt(w.frameCpuMsAvg, 3)}`,
    `controllerCpuMsAvg\t${fmt(w.controllerCpuMsAvg, 3)}`,
    `playerCpuMsAvg\t${fmt(w.playerCpuMsAvg, 3)}`,
    `effectsCpuMsAvg\t${fmt(w.effectsCpuMsAvg, 3)}`,
    `renderCpuMsAvg\t${fmt(w.renderCpuMsAvg, 3)}`,
    `lightingCpuMsAvg\t${fmt(w.lightingCpuMsAvg, 3)}`,
    `grassCpuMsAvg\t${fmt(w.grassCpuMsAvg, 3)}`,
    `vergeCpuMsAvg\t${fmt(w.vergeCpuMsAvg, 3)}`,
    `leafCpuMsAvg\t${fmt(w.leafCpuMsAvg, 3)}`,
    `fungusCpuMsAvg\t${fmt(w.fungusCpuMsAvg, 3)}`,
    `bandCpuMsAvg\t${fmt(w.bandCpuMsAvg, 3)}`,
    `rockCpuMsAvg\t${fmt(w.rockCpuMsAvg, 3)}`,
    `logCpuMsAvg\t${fmt(w.logCpuMsAvg, 3)}`,
    `stickCpuMsAvg\t${fmt(w.stickCpuMsAvg, 3)}`,
    `needleCpuMsAvg\t${fmt(w.needleCpuMsAvg, 3)}`,
    `neonCpuMsAvg\t${fmt(w.neonCpuMsAvg, 3)}`,
    `skyCpuMsAvg\t${fmt(w.skyCpuMsAvg, 3)}`,
    `fishCpuMsAvg\t${fmt(w.fishCpuMsAvg, 3)}`,
    `lampCpuMsAvg\t${fmt(w.lampCpuMsAvg, 3)}`,
    `glassCpuMsAvg\t${fmt(w.glassCpuMsAvg, 3)}`,
  ]
  return lines.join('\n')
}
