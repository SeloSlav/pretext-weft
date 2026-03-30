import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  PlaygroundRuntime,
  type PlaygroundPerfStats,
} from "./playground/PlaygroundRuntime";
import {
  DEFAULT_FIRE_WALL_PARAMS,
  DEFAULT_SHELL_SURFACE_PARAMS,
  DEFAULT_GRASS_FIELD_PARAMS,
  DEFAULT_ROCK_FIELD_PARAMS,
  DEFAULT_STAR_SKY_PARAMS,
} from "./weft/three";
import {
  DEFAULT_GLASS_SURFACE_PARAMS,
  FACADE_FISH_RECOVERY_RATE,
} from "./playground/playgroundWorld";
import {
  PLAYGROUND_QUALITY_DEFAULT,
  type PlaygroundQuality,
} from "./playground/playgroundQuality";

type ControlSectionProps = {
  title: string;
  summary?: string;
  children: ReactNode;
};

const GRASS_STATE_LABELS = ["Healthy", "Dry", "Corrupted", "Dead"] as const;

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
  const [glassRecoveryRate, setGlassRecoveryRate] = useState<number>(
    DEFAULT_GLASS_SURFACE_PARAMS.recoveryRate,
  );
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
  const [rockLayoutDensity, setRockLayoutDensity] = useState(
    DEFAULT_ROCK_FIELD_PARAMS.layoutDensity,
  );
  const [rockSizeScale, setRockSizeScale] = useState(
    DEFAULT_ROCK_FIELD_PARAMS.sizeScale,
  );
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
        });
        runtime.setRockFieldParams({ layoutDensity: rockLayoutDensity, sizeScale: rockSizeScale });
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
    let id = 0;
    const tick = () => {
      setPerfStats(runtimeRef.current?.perfStats ?? null);
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
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
    });
  }, [
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
                  title="Roadside grass"
                  summary="Ground response and world-state swap"
                >
                  <label className="control">
                    <span>
                      Disturbance radius ({disturbanceRadius.toFixed(2)} world
                      units)
                    </span>
                    <input
                      type="range"
                      min={0.5}
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
                      min={0.2}
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
                      min={0.12}
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
                      min={0.02}
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
                      min={0.3}
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
                      min={0.08}
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
                      min={0.15}
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
                      min={0.02}
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
                      min={0.12}
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
                      min={0.2}
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
                      min={0.005}
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
                      min={0.3}
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
                      min={0.2}
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
                      min={0.05}
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
          <div className="perf-hud" aria-hidden>
            <div>FPS: {perfStats.fps.toFixed(1)} | Frame: {perfStats.frameCpuMs.toFixed(2)} ms</div>
            <div>Effects: {perfStats.effectsCpuMs.toFixed(2)} ms | Render: {perfStats.renderCpuMs.toFixed(2)} ms</div>
            <div>Controller: {perfStats.controllerCpuMs.toFixed(2)} ms | DPR: {perfStats.pixelRatio.toFixed(2)}</div>
            <div>
              Grass: {perfStats.grassCpuMs.toFixed(2)} | Rock: {perfStats.rockCpuMs.toFixed(2)} | Neon:{" "}
              {perfStats.neonCpuMs.toFixed(2)} | Sky: {perfStats.skyCpuMs.toFixed(2)}
            </div>
            <div>
              Fish: {(perfStats.shutterCpuMs + perfStats.ivyCpuMs).toFixed(2)} | Glass:{" "}
              {(perfStats.lampCpuMs + perfStats.glassCpuMs).toFixed(2)} | Size: {perfStats.viewportWidth}x
              {perfStats.viewportHeight}
            </div>
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
