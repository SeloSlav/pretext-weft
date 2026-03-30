import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  PlaygroundRuntime,
  type PlaygroundPerfStats,
} from "./playground/PlaygroundRuntime";
import {
  DEFAULT_FIRE_WALL_PARAMS,
  DEFAULT_FUNGUS_SEAM_PARAMS,
  DEFAULT_SHELL_SURFACE_PARAMS,
  DEFAULT_GRASS_FIELD_PARAMS,
  DEFAULT_LEAF_PILE_BAND_PARAMS,
  DEFAULT_ROCK_FIELD_PARAMS,
  LEAF_PILE_SEASONS,
  DEFAULT_STAR_SKY_PARAMS,
} from "./weft/three";
import {
  DEFAULT_GLASS_SURFACE_PARAMS,
  FACADE_FISH_RECOVERY_RATE,
  PLAYGROUND_BAND_EDGE_SOFTNESS,
  PLAYGROUND_BAND_LAYOUT_DENSITY,
  PLAYGROUND_BAND_SIZE_SCALE,
  PLAYGROUND_FUNGUS_SEAM_WIDTH,
  PLAYGROUND_VERGE_BAND_WIDTH,
} from "./playground/playgroundWorld";
import {
  PLAYGROUND_QUALITY_DEFAULT,
  type PlaygroundQuality,
} from "./playground/playgroundQuality";
import { PERF_HUD_POLL_INTERVAL_MS } from "./playground/playgroundPerfHud";

type ControlSectionProps = {
  title: string;
  summary?: string;
  children: ReactNode;
};

const GRASS_STATE_LABELS = ["Healthy", "Dry", "Corrupted", "Dead"] as const;
const LEAF_PILE_SEASON_LABELS = {
  spring: "Spring",
  summer: "Summer",
  autumn: "Autumn",
  winter: "Winter",
} as const;

function ControlSection({ title, summary, children }: ControlSectionProps) {
  return (
    <details className="control-section" open>
      <summary className="control-section__summary">
        <span>{title}</span>
        {summary && <small>{summary}</small>}
      </summary>
      <div className="control-section__body">{children}</div>
    </details>
  );
}

export function Editor() {
  const hostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<PlaygroundRuntime | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [runtimeState, setRuntimeState] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [runtimeError, setRuntimeError] = useState<string | null>(null);

  const [woundRadius, setWoundRadius] = useState(
    DEFAULT_SHELL_SURFACE_PARAMS.woundRadius,
  );
  const [woundNarrow, setWoundNarrow] = useState(
    DEFAULT_SHELL_SURFACE_PARAMS.woundNarrow,
  );
  const [woundDepth, setWoundDepth] = useState(
    DEFAULT_SHELL_SURFACE_PARAMS.woundDepth,
  );
  const [scaleLift, setScaleLift] = useState(
    DEFAULT_SHELL_SURFACE_PARAMS.scaleLift,
  );
  const [surfaceFlex, setSurfaceFlex] = useState(
    DEFAULT_SHELL_SURFACE_PARAMS.surfaceFlex,
  );
  const [shellSurfaceRecoveryRate, setShellSurfaceRecoveryRate] = useState(
    FACADE_FISH_RECOVERY_RATE,
  );
  const [glassWoundRadius, setGlassWoundRadius] = useState<number>(
    DEFAULT_GLASS_SURFACE_PARAMS.woundRadius,
  );
  const [glassRecoveryRate, setGlassRecoveryRate] = useState<number>(0.8);
  const [disturbanceRadius, setDisturbanceRadius] = useState(
    DEFAULT_GRASS_FIELD_PARAMS.disturbanceRadius,
  );
  const [disturbanceStrength, setDisturbanceStrength] = useState(
    DEFAULT_GRASS_FIELD_PARAMS.disturbanceStrength,
  );
  const [trampleDepth, setTrampleDepth] = useState(
    DEFAULT_GRASS_FIELD_PARAMS.trampleDepth,
  );
  const [wind, setWind] = useState(DEFAULT_GRASS_FIELD_PARAMS.wind);
  const [recoveryRate, setRecoveryRate] = useState(
    DEFAULT_GRASS_FIELD_PARAMS.recoveryRate,
  );
  const [grassState, setGrassState] = useState(DEFAULT_GRASS_FIELD_PARAMS.state);
  const [grassLayoutDensity, setGrassLayoutDensity] = useState(
    DEFAULT_GRASS_FIELD_PARAMS.layoutDensity,
  );
  const [grassBladeWidthScale, setGrassBladeWidthScale] = useState(
    DEFAULT_GRASS_FIELD_PARAMS.bladeWidthScale,
  );
  const [grassBladeHeightScale, setGrassBladeHeightScale] = useState(
    DEFAULT_GRASS_FIELD_PARAMS.bladeHeightScale,
  );
  const [rockLayoutDensity, setRockLayoutDensity] = useState(
    DEFAULT_ROCK_FIELD_PARAMS.layoutDensity,
  );
  const [rockSizeScale, setRockSizeScale] = useState(
    DEFAULT_ROCK_FIELD_PARAMS.sizeScale,
  );
  const [bandLayoutDensity, setBandLayoutDensity] = useState(
    PLAYGROUND_BAND_LAYOUT_DENSITY,
  );
  const [vergeGlyphSize, setVergeGlyphSize] = useState(
    PLAYGROUND_BAND_SIZE_SCALE,
  );
  const [leafPileGlyphSize, setLeafPileGlyphSize] = useState(
    PLAYGROUND_BAND_SIZE_SCALE * 1.08,
  );
  const [fungusGlyphSize, setFungusGlyphSize] = useState(
    PLAYGROUND_BAND_SIZE_SCALE * 0.92,
  );
  const [fungusBurnRecoveryRate, setFungusBurnRecoveryRate] = useState(
    DEFAULT_FUNGUS_SEAM_PARAMS.recoveryRate,
  );
  const [fungusBurnSpreadSpeed, setFungusBurnSpreadSpeed] = useState(
    DEFAULT_FUNGUS_SEAM_PARAMS.burnSpreadSpeed,
  );
  const [fungusBurnBlastSize, setFungusBurnBlastSize] = useState(1);
  const [leafPileSeason, setLeafPileSeason] = useState(
    DEFAULT_LEAF_PILE_BAND_PARAMS.season,
  );
  const [vergeBandWidth, setVergeBandWidth] = useState(
    PLAYGROUND_VERGE_BAND_WIDTH,
  );
  const [leafPileBandWidth, setLeafPileBandWidth] = useState(1.15);
  const [fungusBandWidth, setFungusBandWidth] = useState(
    PLAYGROUND_FUNGUS_SEAM_WIDTH,
  );
  const [bandEdgeSoftness, setBandEdgeSoftness] = useState(
    PLAYGROUND_BAND_EDGE_SOFTNESS,
  );
  const [showVergeBand, setShowVergeBand] = useState(true);
  const [showLeafPiles, setShowLeafPiles] = useState(true);
  const [showFungusBand, setShowFungusBand] = useState(true);
  const [fireRecoveryRate, setFireRecoveryRate] = useState(
    DEFAULT_FIRE_WALL_PARAMS.recoveryRate,
  );
  const [fireHoleSize, setFireHoleSize] = useState(
    DEFAULT_FIRE_WALL_PARAMS.holeSize,
  );
  const [starLayoutDensity, setStarLayoutDensity] = useState(
    DEFAULT_STAR_SKY_PARAMS.layoutDensity,
  );
  const [starRecoveryRate, setStarRecoveryRate] = useState(
    DEFAULT_STAR_SKY_PARAMS.recoveryRate,
  );
  const [quality, setQuality] = useState<PlaygroundQuality>(
    PLAYGROUND_QUALITY_DEFAULT,
  );
  const [perfStats, setPerfStats] = useState<PlaygroundPerfStats | null>(null);
  const [perfHudMinimized, setPerfHudMinimized] = useState(true);
  const [showCollisionDebug, setShowCollisionDebug] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const runtime = new PlaygroundRuntime(host);
    runtimeRef.current = runtime;

    let cancelled = false;

    runtime
      .initialize()
      .then(() => {
        if (cancelled) return;
        // Apply current slider values now that the runtime exists.
        // The change-driven useEffects fire on mount but runtimeRef is null then,
        // so we push the initial state here after initialization completes.
        runtime.setShellSurfaceParams({
          woundRadius,
          woundNarrow,
          woundDepth,
          scaleLift,
          surfaceFlex,
          recoveryRate: shellSurfaceRecoveryRate,
        });
        runtime.setGlassSurfaceParams({
          woundRadius: glassWoundRadius,
          recoveryRate: glassRecoveryRate,
        });
        runtime.setGrassFieldParams({
          disturbanceRadius,
          disturbanceStrength,
          trampleDepth,
          wind,
          recoveryRate,
          state: grassState,
          layoutDensity: grassLayoutDensity,
          bladeWidthScale: grassBladeWidthScale,
          bladeHeightScale: grassBladeHeightScale,
        });
        runtime.setRockFieldParams({ layoutDensity: rockLayoutDensity, sizeScale: rockSizeScale });
        runtime.setBandFieldParams({
          layoutDensity: bandLayoutDensity,
          vergeSizeScale: vergeGlyphSize,
          leafPileSizeScale: leafPileGlyphSize,
          fungusSizeScale: fungusGlyphSize,
          fungusBurnRecoveryRate,
          fungusBurnSpreadSpeed,
          fungusBurnBlastSize,
          vergeBandWidth,
          leafPileBandWidth,
          leafPileSeason,
          fungusBandWidth,
          edgeSoftness: bandEdgeSoftness,
          showVergeBand,
          showLeafPiles,
          showFungusBand,
        });
        runtime.setFireWallParams({ recoveryRate: fireRecoveryRate, holeSize: fireHoleSize });
        runtime.setStarSkyParams({
          layoutDensity: starLayoutDensity,
          recoveryRate: starRecoveryRate,
        });
        runtime.setCollisionDebugVisible(showCollisionDebug);
        setRuntimeState("ready");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setRuntimeState("error");
        setRuntimeError(
          error instanceof Error
            ? error.message
            : "Failed to initialize WebGPU renderer.",
        );
      });

    return () => {
      cancelled = true;
      runtimeRef.current = null;
      runtime.dispose();
    };
  }, []);

  useEffect(() => {
    if (runtimeState !== "ready") return;
    runtimeRef.current?.setQuality(quality);
  }, [quality, runtimeState]);

  useEffect(() => {
    const tick = () => setPerfStats(runtimeRef.current?.perfStats ?? null);
    tick();
    const id = window.setInterval(tick, PERF_HUD_POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    runtimeRef.current?.setShellSurfaceParams({
      woundRadius,
      woundNarrow,
      woundDepth,
      scaleLift,
      surfaceFlex,
      recoveryRate: shellSurfaceRecoveryRate,
    });
  }, [
    shellSurfaceRecoveryRate,
    scaleLift,
    surfaceFlex,
    woundDepth,
    woundNarrow,
    woundRadius,
  ]);

  useEffect(() => {
    runtimeRef.current?.setGlassSurfaceParams({
      woundRadius: glassWoundRadius,
      recoveryRate: glassRecoveryRate,
    });
  }, [glassRecoveryRate, glassWoundRadius]);

  useEffect(() => {
    runtimeRef.current?.setGrassFieldParams({
      disturbanceRadius,
      disturbanceStrength,
      trampleDepth,
      wind,
      recoveryRate,
      state: grassState,
      layoutDensity: grassLayoutDensity,
      bladeWidthScale: grassBladeWidthScale,
      bladeHeightScale: grassBladeHeightScale,
    });
  }, [
    grassBladeHeightScale,
    grassBladeWidthScale,
    disturbanceRadius,
    disturbanceStrength,
    grassLayoutDensity,
    grassState,
    recoveryRate,
    trampleDepth,
    wind,
  ]);

  useEffect(() => {
    runtimeRef.current?.setRockFieldParams({
      layoutDensity: rockLayoutDensity,
      sizeScale: rockSizeScale,
    });
  }, [rockLayoutDensity, rockSizeScale]);

  useEffect(() => {
    runtimeRef.current?.setBandFieldParams({
      layoutDensity: bandLayoutDensity,
      vergeSizeScale: vergeGlyphSize,
      leafPileSizeScale: leafPileGlyphSize,
      fungusSizeScale: fungusGlyphSize,
      fungusBurnRecoveryRate,
      fungusBurnSpreadSpeed,
      fungusBurnBlastSize,
      vergeBandWidth,
      leafPileBandWidth,
      leafPileSeason,
      fungusBandWidth,
      edgeSoftness: bandEdgeSoftness,
      showVergeBand,
      showLeafPiles,
      showFungusBand,
    });
  }, [
    bandEdgeSoftness,
    bandLayoutDensity,
    fungusBurnBlastSize,
    fungusBurnRecoveryRate,
    fungusBurnSpreadSpeed,
    fungusGlyphSize,
    fungusBandWidth,
    leafPileGlyphSize,
    leafPileBandWidth,
    leafPileSeason,
    showFungusBand,
    showLeafPiles,
    showVergeBand,
    vergeGlyphSize,
    vergeBandWidth,
  ]);

  useEffect(() => {
    runtimeRef.current?.setFireWallParams({ recoveryRate: fireRecoveryRate, holeSize: fireHoleSize });
  }, [fireRecoveryRate, fireHoleSize]);

  useEffect(() => {
    runtimeRef.current?.setStarSkyParams({
      layoutDensity: starLayoutDensity,
      recoveryRate: starRecoveryRate,
    });
  }, [starLayoutDensity, starRecoveryRate]);

  useEffect(() => {
    runtimeRef.current?.setCollisionDebugVisible(showCollisionDebug);
  }, [showCollisionDebug]);

  return (
    <div className="app-shell">
      <aside
        className={sidebarCollapsed ? "sidebar sidebar--collapsed" : "sidebar"}
      >
        {sidebarCollapsed ? (
          <button
            type="button"
            className="sidebar-expand"
            onClick={() => setSidebarCollapsed(false)}
            aria-label="Expand sidebar"
            title="Expand sidebar"
          >
            <span aria-hidden>›</span>
          </button>
        ) : (
          <>
            <header className="sidebar-header">
              <div className="sidebar-header__row">
                <h1>Playground</h1>
                <button
                  type="button"
                  className="sidebar-collapse"
                  onClick={() => setSidebarCollapsed(true)}
                  aria-label="Collapse sidebar"
                  title="Collapse sidebar"
                >
                  <span aria-hidden>‹</span>
                </button>
              </div>
              <p className="tagline">
                Weft is a Three.js-first SDK for reactive surfaces. These
                playground samples share the same layout core, while presets
                like grass and fire demonstrate the higher-level authoring API
                built on top of it.
              </p>
            </header>

            <section className="sample-detail">
              <div className="sample-controls">
                <ControlSection
                  title="Performance"
                  summary="DPR cap + layout density scaling"
                >
                  <label className="control">
                    <span>Quality</span>
                    <select
                      value={quality}
                      onChange={(e) =>
                        setQuality(e.target.value as PlaygroundQuality)
                      }
                    >
                      <option value="low">Low (game-style)</option>
                      <option value="medium">Medium</option>
                      <option value="high">High (showcase)</option>
                    </select>
                  </label>
                  <label className="control">
                    <span>Collision overlay</span>
                    <input
                      type="checkbox"
                      checked={showCollisionDebug}
                      onChange={(e) =>
                        setShowCollisionDebug(e.target.checked)
                      }
                    />
                  </label>
                  <p className="control-hint">
                    Add <code>?perf=1</code> to the URL to show effect-update
                    time (ms) on the canvas.
                  </p>
                  <p className="control-hint">
                    The overlay now shows the sampled body-clearance points on
                    the shutter, ivy, and neon walls. Movement checks a
                    player-sized 3x3 area, so you only need a large-enough hole
                    for the body, not a perfectly cleared full-height slice.
                  </p>
                </ControlSection>
                <ControlSection
                  title="Grass"
                  summary="Ground response and world-state swap"
                >
                  <label className="control">
                    <span>
                      Disturbance radius ({disturbanceRadius.toFixed(2)} world
                      units)
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={2.4}
                      step={0.02}
                      value={disturbanceRadius}
                      onChange={(e) =>
                        setDisturbanceRadius(Number(e.target.value))
                      }
                    />
                  </label>
                  <label className="control">
                    <span>
                      Layout narrowing under disturbance ({Math.round(disturbanceStrength * 100)}%)
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={0.95}
                      step={0.02}
                      value={disturbanceStrength}
                      onChange={(e) =>
                        setDisturbanceStrength(Number(e.target.value))
                      }
                    />
                  </label>
                  <label className="control">
                    <span>Trample depth</span>
                    <input
                      type="range"
                      min={0}
                      max={1.25}
                      step={0.02}
                      value={trampleDepth}
                      onChange={(e) => setTrampleDepth(Number(e.target.value))}
                    />
                  </label>
                  <label className="control">
                    <span>Wind intensity</span>
                    <input
                      type="range"
                      min={0}
                      max={1.4}
                      step={0.02}
                      value={wind}
                      onChange={(e) => setWind(Number(e.target.value))}
                    />
                  </label>
                  <label className="control">
                    <span>
                      Layout density ({grassLayoutDensity.toFixed(2)}x) — how many
                      grass glyphs fit in each layout cell
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={12}
                      step={0.05}
                      value={grassLayoutDensity}
                      onChange={(e) =>
                        setGrassLayoutDensity(Number(e.target.value))
                      }
                    />
                  </label>
                  <label className="control">
                    <span>
                      Grass blade width ({grassBladeWidthScale.toFixed(2)}x)
                    </span>
                    <input
                      type="range"
                      min={0.25}
                      max={2.5}
                      step={0.05}
                      value={grassBladeWidthScale}
                      onChange={(e) =>
                        setGrassBladeWidthScale(Number(e.target.value))
                      }
                    />
                  </label>
                  <label className="control">
                    <span>
                      Grass blade height ({grassBladeHeightScale.toFixed(2)}x)
                    </span>
                    <input
                      type="range"
                      min={0.25}
                      max={2.5}
                      step={0.05}
                      value={grassBladeHeightScale}
                      onChange={(e) =>
                        setGrassBladeHeightScale(Number(e.target.value))
                      }
                    />
                  </label>
                  <label className="control">
                    <span>
                      Field state ({GRASS_STATE_LABELS[grassState] ?? "Healthy"})
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={3}
                      step={1}
                      value={grassState}
                      onChange={(e) => setGrassState(Number(e.target.value))}
                    />
                  </label>
                  <label className="control">
                    <span>Recovery rate</span>
                    <input
                      type="range"
                      min={0}
                      max={0.8}
                      step={0.02}
                      value={recoveryRate}
                      onChange={(e) => setRecoveryRate(Number(e.target.value))}
                    />
                  </label>
                </ControlSection>

                <ControlSection
                  title="Shutter & ivy facades"
                  summary="Wall wounds"
                >
                  <label className="control">
                    <span>
                      Wound radius ({woundRadius.toFixed(2)} world units)
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={1.1}
                      step={0.02}
                      value={woundRadius}
                      onChange={(e) => setWoundRadius(Number(e.target.value))}
                    />
                  </label>
                  <label className="control">
                    <span>
                      Width retained inside wound (
                      {Math.round(woundNarrow * 100)}%)
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={0.75}
                      step={0.02}
                      value={woundNarrow}
                      onChange={(e) => setWoundNarrow(Number(e.target.value))}
                    />
                  </label>
                  <label className="control">
                    <span>Crater depth</span>
                    <input
                      type="range"
                      min={0}
                      max={1.1}
                      step={0.02}
                      value={woundDepth}
                      onChange={(e) => setWoundDepth(Number(e.target.value))}
                    />
                  </label>
                  <label className="control">
                    <span>Scale peel</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.02}
                      value={scaleLift}
                      onChange={(e) => setScaleLift(Number(e.target.value))}
                    />
                  </label>
                  <label className="control">
                    <span>Idle surface flex</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.02}
                      value={surfaceFlex}
                      onChange={(e) => setSurfaceFlex(Number(e.target.value))}
                    />
                  </label>
                  <label className="control">
                    <span>Recovery rate</span>
                    <input
                      type="range"
                      min={0}
                      max={0.8}
                      step={0.02}
                      value={shellSurfaceRecoveryRate}
                      onChange={(e) =>
                        setShellSurfaceRecoveryRate(Number(e.target.value))
                      }
                    />
                  </label>
                </ControlSection>

                <ControlSection
                  title="Glass windows & lamps"
                  summary="Shared glass distortion and self-healing"
                >
                  <label className="control">
                    <span>
                      Destruction radius ({glassWoundRadius.toFixed(2)} world units) — how wide each glass hit spreads
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={1.4}
                      step={0.02}
                      value={glassWoundRadius}
                      onChange={(e) => setGlassWoundRadius(Number(e.target.value))}
                    />
                  </label>
                  <label className="control">
                    <span>
                      Renewal rate ({glassRecoveryRate.toFixed(2)}) — how fast windows and lamp bulbs self-heal
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={0.8}
                      step={0.02}
                      value={glassRecoveryRate}
                      onChange={(e) => setGlassRecoveryRate(Number(e.target.value))}
                    />
                  </label>
                </ControlSection>

                <ControlSection
                  title="Verge strip, leaf piles & fungus seam"
                  summary="Band-field family samples"
                >
                  <label className="control">
                    <span>Show verge strip</span>
                    <input
                      type="checkbox"
                      checked={showVergeBand}
                      onChange={(e) => setShowVergeBand(e.target.checked)}
                    />
                  </label>
                  <label className="control">
                    <span>Show leaf piles</span>
                    <input
                      type="checkbox"
                      checked={showLeafPiles}
                      onChange={(e) => setShowLeafPiles(e.target.checked)}
                    />
                  </label>
                  <label className="control">
                    <span>Show fungus seam</span>
                    <input
                      type="checkbox"
                      checked={showFungusBand}
                      onChange={(e) => setShowFungusBand(e.target.checked)}
                    />
                  </label>
                  <label className="control">
                    <span>
                      Leaf season ({LEAF_PILE_SEASON_LABELS[leafPileSeason] ?? "Autumn"})
                    </span>
                    <select
                      value={leafPileSeason}
                      onChange={(e) =>
                        setLeafPileSeason(
                          e.target.value as (typeof LEAF_PILE_SEASONS)[number],
                        )
                      }
                    >
                      {LEAF_PILE_SEASONS.map((season) => (
                        <option key={season} value={season}>
                          {LEAF_PILE_SEASON_LABELS[season]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="control">
                    <span>
                      Layout density ({bandLayoutDensity.toFixed(2)}x) — how many band glyphs fit along each strip
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={4}
                      step={0.05}
                      value={bandLayoutDensity}
                      onChange={(e) => setBandLayoutDensity(Number(e.target.value))}
                    />
                  </label>
                  <label className="control">
                    <span>
                      Verge strip width ({vergeBandWidth.toFixed(2)} world units)
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={12}
                      step={0.05}
                      value={vergeBandWidth}
                      onChange={(e) => setVergeBandWidth(Number(e.target.value))}
                    />
                  </label>
                  <label className="control">
                    <span>
                      Verge glyph size ({vergeGlyphSize.toFixed(2)}x)
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={2.2}
                      step={0.05}
                      value={vergeGlyphSize}
                      onChange={(e) => setVergeGlyphSize(Number(e.target.value))}
                    />
                  </label>
                  <label className="control">
                    <span>
                      Leaf pile band width ({leafPileBandWidth.toFixed(2)} world units)
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={6}
                      step={0.05}
                      value={leafPileBandWidth}
                      onChange={(e) => setLeafPileBandWidth(Number(e.target.value))}
                    />
                  </label>
                  <label className="control">
                    <span>
                      Leaf pile glyph size ({leafPileGlyphSize.toFixed(2)}x)
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={3}
                      step={0.05}
                      value={leafPileGlyphSize}
                      onChange={(e) => setLeafPileGlyphSize(Number(e.target.value))}
                    />
                  </label>
                  <label className="control">
                    <span>
                      Fungus seam width ({fungusBandWidth.toFixed(2)} world units)
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={4.4}
                      step={0.05}
                      value={fungusBandWidth}
                      onChange={(e) => setFungusBandWidth(Number(e.target.value))}
                    />
                  </label>
                  <label className="control">
                    <span>
                      Fungus glyph size ({fungusGlyphSize.toFixed(2)}x)
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={2.2}
                      step={0.05}
                      value={fungusGlyphSize}
                      onChange={(e) => setFungusGlyphSize(Number(e.target.value))}
                    />
                  </label>
                  <label className="control">
                    <span>
                      Fungus burn recovery ({fungusBurnRecoveryRate.toFixed(2)})
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={0.5}
                      step={0.01}
                      value={fungusBurnRecoveryRate}
                      onChange={(e) =>
                        setFungusBurnRecoveryRate(Number(e.target.value))
                      }
                    />
                  </label>
                  <label className="control">
                    <span>
                      Fungus burn spread ({fungusBurnSpreadSpeed.toFixed(2)})
                    </span>
                    <input
                      type="range"
                      min={0.2}
                      max={6}
                      step={0.05}
                      value={fungusBurnSpreadSpeed}
                      onChange={(e) =>
                        setFungusBurnSpreadSpeed(Number(e.target.value))
                      }
                    />
                  </label>
                  <label className="control">
                    <span>
                      Fungus burn blast size ({fungusBurnBlastSize.toFixed(2)}x)
                    </span>
                    <input
                      type="range"
                      min={0.35}
                      max={2.5}
                      step={0.05}
                      value={fungusBurnBlastSize}
                      onChange={(e) =>
                        setFungusBurnBlastSize(Number(e.target.value))
                      }
                    />
                  </label>
                  <label className="control">
                    <span>
                      Edge softness ({bandEdgeSoftness.toFixed(2)}) — how softly the strips feather out
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={3}
                      step={0.05}
                      value={bandEdgeSoftness}
                      onChange={(e) => setBandEdgeSoftness(Number(e.target.value))}
                    />
                  </label>
                  <p className="control-hint">
                    The original scrub verge is back. Leaf piles are now a separate clustered sample in the center of the
                    intersection and get
                    pushed outward when you walk through them. Use the checkboxes to isolate any band sample, and set density,
                    glyph size, or any width to
                    <code> 0</code> now fully hides that band contribution.
                  </p>
                </ControlSection>

                <ControlSection
                  title="Rubble lot"
                  summary="Rocks only spawn in the empty corner zone"
                >
                  <label className="control">
                    <span>
                      Glyphs per slot ({rockLayoutDensity.toFixed(2)}x) — how many rocks fit in each layout cell
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={12}
                      step={0.05}
                      value={rockLayoutDensity}
                      onChange={(e) =>
                        setRockLayoutDensity(Number(e.target.value))
                      }
                    />
                  </label>
                  <label className="control">
                    <span>
                      Rock size ({rockSizeScale.toFixed(2)}x)
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={2.2}
                      step={0.05}
                      value={rockSizeScale}
                      onChange={(e) =>
                        setRockSizeScale(Number(e.target.value))
                      }
                    />
                  </label>
                </ControlSection>

                <ControlSection title="Neon sign" summary="Shoot the sign to punch holes in the glow field">
                  <label className="control">
                    <span>
                      Recovery rate ({fireRecoveryRate.toFixed(3)}) — how fast holes close
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={2.0}
                      step={0.005}
                      value={fireRecoveryRate}
                      onChange={(e) => setFireRecoveryRate(Number(e.target.value))}
                    />
                  </label>
                  <label className="control">
                    <span>
                      Hole size ({fireHoleSize.toFixed(2)}x) — radius of each bullet hole
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={2.5}
                      step={0.05}
                      value={fireHoleSize}
                      onChange={(e) => setFireHoleSize(Number(e.target.value))}
                    />
                  </label>
                </ControlSection>

                <ControlSection title="Star Sky Controls" summary="Wound density and recovery">
                  <label className="control">
                    <span>
                      Layout density ({starLayoutDensity.toFixed(2)}x) — how many stars fit in each sky slot
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={2.5}
                      step={0.05}
                      value={starLayoutDensity}
                      onChange={(e) => setStarLayoutDensity(Number(e.target.value))}
                    />
                  </label>
                  <label className="control">
                    <span>
                      Recovery rate ({starRecoveryRate.toFixed(2)}) — how fast sky wounds settle
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={0.8}
                      step={0.01}
                      value={starRecoveryRate}
                      onChange={(e) => setStarRecoveryRate(Number(e.target.value))}
                    />
                  </label>
                </ControlSection>

                <ControlSection title="Scene Actions" summary="Reset effects">
                  <div className="control-actions">
                    <button
                      type="button"
                      className="btn btn--secondary"
                      onClick={() =>
                        runtimeRef.current?.clearGrassDisturbances()
                      }
                    >
                      Clear grass
                    </button>
                    <button
                      type="button"
                      className="btn btn--secondary"
                      onClick={() => runtimeRef.current?.clearFishWounds()}
                    >
                      Clear facades
                    </button>
                    <button
                      type="button"
                      className="btn btn--secondary"
                      onClick={() => runtimeRef.current?.clearGlassWounds()}
                    >
                      Clear glass
                    </button>
                    <button
                      type="button"
                      className="btn btn--secondary"
                      onClick={() => runtimeRef.current?.clearFireWounds()}
                    >
                      Clear neon
                    </button>
                    <button
                      type="button"
                      className="btn btn--secondary"
                      onClick={() => runtimeRef.current?.clearSkyWounds()}
                    >
                      Clear sky
                    </button>
                    <button
                      type="button"
                      className="btn btn--secondary"
                      onClick={() => runtimeRef.current?.clearAllEffects()}
                    >
                      Clear all
                    </button>
                  </div>
                </ControlSection>
              </div>
            </section>
          </>
        )}
      </aside>

      <main className="viewport">
        <div ref={hostRef} className="viewport-host" />
        {perfStats !== null && (
          <div
            className={`perf-hud${perfHudMinimized ? " perf-hud--minimized" : ""}`}
            aria-hidden
          >
            <button
              type="button"
              className="perf-hud__toggle"
              onClick={() => setPerfHudMinimized((value) => !value)}
              aria-label={perfHudMinimized ? "Expand profiler" : "Minimize profiler"}
              aria-expanded={!perfHudMinimized}
            >
              {perfHudMinimized
                ? `Profiler ${perfStats.fps.toFixed(1)} FPS`
                : "Minimize profiler"}
            </button>
            {!perfHudMinimized && (
              <>
                <div>
                  FPS: {perfStats.fps.toFixed(1)} | Avg: {perfStats.fpsAvg.toFixed(1)} | Frame:{" "}
                  {perfStats.frameCpuMs.toFixed(2)} ms | Avg: {perfStats.frameCpuMsAvg.toFixed(2)} ms
                </div>
                <div>
                  Effects: {perfStats.effectsCpuMs.toFixed(2)} ms | Avg: {perfStats.effectsCpuMsAvg.toFixed(2)} ms |
                  Render: {perfStats.renderCpuMs.toFixed(2)} ms | Avg: {perfStats.renderCpuMsAvg.toFixed(2)} ms
                </div>
                <div>Controller: {perfStats.controllerCpuMs.toFixed(2)} ms | DPR: {perfStats.pixelRatio.toFixed(2)}</div>
                <div>
                  Grass: {perfStats.grassCpuMs.toFixed(2)} / {perfStats.grassCpuMsAvg.toFixed(2)} | Verge:{" "}
                  {perfStats.vergeCpuMs.toFixed(2)} / {perfStats.vergeCpuMsAvg.toFixed(2)} | Leaf:{" "}
                  {perfStats.leafCpuMs.toFixed(2)} / {perfStats.leafCpuMsAvg.toFixed(2)} | Fungus:{" "}
                  {perfStats.fungusCpuMs.toFixed(2)} / {perfStats.fungusCpuMsAvg.toFixed(2)}
                </div>
                <div>
                  Band: {perfStats.bandCpuMs.toFixed(2)} / {perfStats.bandCpuMsAvg.toFixed(2)} | Rock:{" "}
                  {perfStats.rockCpuMs.toFixed(2)} / {perfStats.rockCpuMsAvg.toFixed(2)} | Neon:{" "}
                  {perfStats.neonCpuMs.toFixed(2)} / {perfStats.neonCpuMsAvg.toFixed(2)} | Sky:{" "}
                  {perfStats.skyCpuMs.toFixed(2)} / {perfStats.skyCpuMsAvg.toFixed(2)}
                </div>
                <div>
                  Fish: {(perfStats.shutterCpuMs + perfStats.ivyCpuMs).toFixed(2)} / {perfStats.fishCpuMsAvg.toFixed(2)} |
                  Lamp: {perfStats.lampCpuMs.toFixed(2)} / {perfStats.lampCpuMsAvg.toFixed(2)} |
                  Window: {perfStats.glassCpuMs.toFixed(2)} / {perfStats.glassCpuMsAvg.toFixed(2)} |
                  Glass total: {(perfStats.lampCpuMs + perfStats.glassCpuMs).toFixed(2)} /{" "}
                  {(perfStats.lampCpuMsAvg + perfStats.glassCpuMsAvg).toFixed(2)} | Ran:{" "}
                  {perfStats.ranSystems.length > 0 ? perfStats.ranSystems.join(", ") : "none"} | Size:{" "}
                  {perfStats.viewportWidth}x{perfStats.viewportHeight}
                </div>
              </>
            )}
          </div>
        )}
        {runtimeState !== "ready" && (
          <div className="viewport-status" role="status">
            <strong>
              {runtimeState === "loading"
                ? "Starting WebGPU runtime..."
                : "WebGPU unavailable"}
            </strong>
            <span>
              {runtimeState === "loading"
                ? "This playground runs on a plain TypeScript + Three.js WebGPU runtime."
                : (runtimeError ??
                  "This playground requires a WebGPU-capable browser and adapter.")}
            </span>
          </div>
        )}
      </main>
    </div>
  );
}
