import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  PlaygroundRuntime,
  type PlaygroundPerfStats,
} from "./playground/PlaygroundRuntime";
import {
  DEFAULT_GRASS_FIELD_PARAMS,
  DEFAULT_LOG_FIELD_PARAMS,
  DEFAULT_NEEDLE_LITTER_FIELD_PARAMS,
  DEFAULT_STAR_SKY_PARAMS,
  DEFAULT_STICK_FIELD_PARAMS,
  LEAF_PILE_SEASONS,
} from "./weft/three";
import {
  DEFAULT_SCENERY_TERRAIN_RELIEF_PARAMS,
  DEFAULT_SCENERY_WORLD_FIELD_PARAMS,
  SCENERY_NEEDLE_LITTER_BURN_PARAMS,
} from "./playground/playgroundSceneryWorld";
import {
  DEMO_GRASS_LAYOUT_DENSITY_DEFAULT,
  DEMO_GRASS_LAYOUT_DENSITY_MAX,
} from "./playground/playgroundQuality";
import {
  formatPlaygroundPerfClipboardText,
  PERF_HUD_POLL_INTERVAL_MS,
} from "./playground/playgroundPerfHud";

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

function foliageSeasonForWorldState(state: number): keyof typeof LEAF_PILE_SEASON_LABELS {
  const step = Math.max(0, Math.min(3, Math.round(state)));
  switch (step) {
    case 0:
      return "spring";
    case 1:
      return "summer";
    case 2:
      return "autumn";
    case 3:
    default:
      return "winter";
  }
}

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

/** Large grass field using the same Playground runtime and controls; town content omitted. */
export function SceneryDemo() {
  const hostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<PlaygroundRuntime | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [runtimeState, setRuntimeState] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [runtimeError, setRuntimeError] = useState<string | null>(null);

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
    DEMO_GRASS_LAYOUT_DENSITY_DEFAULT,
  );
  const [grassBladeWidthScale, setGrassBladeWidthScale] = useState(
    DEFAULT_GRASS_FIELD_PARAMS.bladeWidthScale,
  );
  const [grassBladeHeightScale, setGrassBladeHeightScale] = useState(
    DEFAULT_GRASS_FIELD_PARAMS.bladeHeightScale,
  );
  const [bandLayoutDensity, setBandLayoutDensity] = useState(0.66);
  const [understoryWidth, setUnderstoryWidth] = useState(2.6);
  const [understorySizeScale, setUnderstorySizeScale] = useState(1.08);
  const [leafPileWidth, setLeafPileWidth] = useState(2.45);
  const [leafPileSizeScale, setLeafPileSizeScale] = useState(1.38);
  const [showUnderstory, setShowUnderstory] = useState(false);
  const [showLeafPiles, setShowLeafPiles] = useState(true);
  const [foliageSeasonOverride, setFoliageSeasonOverride] = useState<
    keyof typeof LEAF_PILE_SEASON_LABELS | "auto"
  >("auto");
  const foliageSeason =
    foliageSeasonOverride === "auto"
      ? foliageSeasonForWorldState(grassState)
      : foliageSeasonOverride;

  const [rockLayoutDensity, setRockLayoutDensity] = useState(0.48);
  const [rockSizeScale, setRockSizeScale] = useState(1.28);
  const [showRocks, setShowRocks] = useState(true);
  const [shrubLayoutDensity, setShrubLayoutDensity] = useState(1.12);
  const [shrubSizeScale, setShrubSizeScale] = useState(1.55);
  const [shrubHeightScale, setShrubHeightScale] = useState(1.35);
  const [showShrubs, setShowShrubs] = useState(true);
  const [treeLayoutDensity, setTreeLayoutDensity] = useState(0.56);
  const [treeSizeScale, setTreeSizeScale] = useState(1.7);
  const [treeHeightScale, setTreeHeightScale] = useState(1.85);
  const [treeCrownScale, setTreeCrownScale] = useState(1.45);
  const [showTrees, setShowTrees] = useState(true);
  const [logLayoutDensity, setLogLayoutDensity] = useState(0.26);
  const [logSizeScale, setLogSizeScale] = useState(2.2);
  const [logLengthScale, setLogLengthScale] = useState(0.85);
  const [logPushScale, setLogPushScale] = useState(1.55);
  const [logDownhillDrift, setLogDownhillDrift] = useState(
    DEFAULT_LOG_FIELD_PARAMS.downhillDrift,
  );
  const [showLogs, setShowLogs] = useState(true);
  const [stickLayoutDensity, setStickLayoutDensity] = useState(0.5);
  const [stickSizeScale, setStickSizeScale] = useState(1.45);
  const [stickLengthScale, setStickLengthScale] = useState(1.55);
  const [stickPushScale, setStickPushScale] = useState(1.4);
  const [stickDownhillDrift, setStickDownhillDrift] = useState(
    DEFAULT_STICK_FIELD_PARAMS.downhillDrift,
  );
  const [showSticks, setShowSticks] = useState(true);
  const [needleLayoutDensity, setNeedleLayoutDensity] = useState(0.5);
  const [needleSizeScale, setNeedleSizeScale] = useState(1.3);
  const [showNeedles, setShowNeedles] = useState(false);
  const [worldFieldSeed, setWorldFieldSeed] = useState(
    DEFAULT_SCENERY_WORLD_FIELD_PARAMS.seed,
  );
  const [worldFieldScale, setWorldFieldScale] = useState(
    DEFAULT_SCENERY_WORLD_FIELD_PARAMS.scale,
  );
  const [worldFieldStrength, setWorldFieldStrength] = useState(
    DEFAULT_SCENERY_WORLD_FIELD_PARAMS.strength,
  );
  const [worldFieldWarp, setWorldFieldWarp] = useState(
    DEFAULT_SCENERY_WORLD_FIELD_PARAMS.warp,
  );
  const [worldFieldRoughness, setWorldFieldRoughness] = useState(
    DEFAULT_SCENERY_WORLD_FIELD_PARAMS.roughness,
  );
  const [worldFieldAffectsGrass, setWorldFieldAffectsGrass] = useState(
    DEFAULT_SCENERY_WORLD_FIELD_PARAMS.affectGrass,
  );
  const [worldFieldAffectsFloor, setWorldFieldAffectsFloor] = useState(
    DEFAULT_SCENERY_WORLD_FIELD_PARAMS.affectFloor,
  );
  const [worldFieldAffectsRocks, setWorldFieldAffectsRocks] = useState(
    DEFAULT_SCENERY_WORLD_FIELD_PARAMS.affectRocks,
  );
  const [worldFieldAffectsLogs, setWorldFieldAffectsLogs] = useState(
    DEFAULT_SCENERY_WORLD_FIELD_PARAMS.affectLogs,
  );
  const [worldFieldAffectsSticks, setWorldFieldAffectsSticks] = useState(
    DEFAULT_SCENERY_WORLD_FIELD_PARAMS.affectSticks,
  );
  const [worldFieldAffectsNeedles, setWorldFieldAffectsNeedles] = useState(
    DEFAULT_SCENERY_WORLD_FIELD_PARAMS.affectNeedles,
  );
  const [worldFieldAffectsTrees, setWorldFieldAffectsTrees] = useState(
    DEFAULT_SCENERY_WORLD_FIELD_PARAMS.affectTrees,
  );
  const [worldFieldAffectsShrubs, setWorldFieldAffectsShrubs] = useState(
    DEFAULT_SCENERY_WORLD_FIELD_PARAMS.affectShrubs,
  );
  const [terrainReliefSeed, setTerrainReliefSeed] = useState(
    DEFAULT_SCENERY_TERRAIN_RELIEF_PARAMS.seed,
  );
  const [terrainReliefScale, setTerrainReliefScale] = useState(
    DEFAULT_SCENERY_TERRAIN_RELIEF_PARAMS.scale,
  );
  const [terrainReliefAmount, setTerrainReliefAmount] = useState(
    DEFAULT_SCENERY_TERRAIN_RELIEF_PARAMS.relief,
  );
  const [terrainReliefWarp, setTerrainReliefWarp] = useState(
    DEFAULT_SCENERY_TERRAIN_RELIEF_PARAMS.warp,
  );
  const [terrainReliefRoughness, setTerrainReliefRoughness] = useState(
    DEFAULT_SCENERY_TERRAIN_RELIEF_PARAMS.roughness,
  );
  const [terrainReliefRidge, setTerrainReliefRidge] = useState(
    DEFAULT_SCENERY_TERRAIN_RELIEF_PARAMS.ridge,
  );
  const [showTerrainAuthoringDebug, setShowTerrainAuthoringDebug] = useState(false);
  const [starLayoutDensity, setStarLayoutDensity] = useState(
    DEFAULT_STAR_SKY_PARAMS.layoutDensity,
  );
  const [starRecoveryRate, setStarRecoveryRate] = useState(
    DEFAULT_STAR_SKY_PARAMS.recoveryRate,
  );
  const [perfStats, setPerfStats] = useState<PlaygroundPerfStats | null>(null);
  const [perfHudMinimized, setPerfHudMinimized] = useState(true);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const runtime = new PlaygroundRuntime(host, { scenery: true });
    runtimeRef.current = runtime;

    let cancelled = false;

    runtime
      .initialize()
      .then(() => {
        if (cancelled) return;
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
        runtime.setBandFieldParams({
          layoutDensity: bandLayoutDensity,
          vergeSizeScale: understorySizeScale,
          leafPileSizeScale: leafPileSizeScale,
          vergeBandWidth: understoryWidth,
          leafPileBandWidth: leafPileWidth,
          showVergeBand: showUnderstory,
          showLeafPiles,
        });
        runtime.setSceneryFoliageSeasonOverride(
          foliageSeasonOverride === "auto" ? null : foliageSeasonOverride,
        );
        runtime.setRockFieldParams({
          layoutDensity: rockLayoutDensity,
          sizeScale: rockSizeScale,
          showRocks,
        });
        runtime.setShrubFieldParams({
          layoutDensity: shrubLayoutDensity,
          sizeScale: shrubSizeScale,
          heightScale: shrubHeightScale,
          showShrubs,
        });
        runtime.setTreeFieldParams({
          layoutDensity: treeLayoutDensity,
          sizeScale: treeSizeScale,
          heightScale: treeHeightScale,
          crownScale: treeCrownScale,
          showTrees,
        });
        runtime.setLogFieldParams({
          layoutDensity: logLayoutDensity,
          sizeScale: logSizeScale,
          lengthScale: logLengthScale,
          downhillDrift: logDownhillDrift,
          showLogs,
        });
        runtime.setStickFieldParams({
          layoutDensity: stickLayoutDensity,
          sizeScale: stickSizeScale,
          lengthScale: stickLengthScale,
          downhillDrift: stickDownhillDrift,
          showSticks,
        });
        runtime.setSceneryMotionResponse({
          logPushScale,
          stickPushScale,
        });
        runtime.setNeedleLitterFieldParams({
          layoutDensity: needleLayoutDensity,
          sizeScale: needleSizeScale,
          recoveryRate: SCENERY_NEEDLE_LITTER_BURN_PARAMS.recoveryRate,
          burnRadius: DEFAULT_NEEDLE_LITTER_FIELD_PARAMS.burnRadius,
          burnSpreadSpeed: SCENERY_NEEDLE_LITTER_BURN_PARAMS.burnSpreadSpeed,
          burnMaxRadius: DEFAULT_NEEDLE_LITTER_FIELD_PARAMS.burnMaxRadius,
          showNeedles,
        });
        runtime.setSceneryWorldFieldParams({
          seed: worldFieldSeed,
          scale: worldFieldScale,
          strength: worldFieldStrength,
          warp: worldFieldWarp,
          roughness: worldFieldRoughness,
          affectGrass: worldFieldAffectsGrass,
          affectFloor: worldFieldAffectsFloor,
          affectRocks: worldFieldAffectsRocks,
          affectLogs: worldFieldAffectsLogs,
          affectSticks: worldFieldAffectsSticks,
          affectNeedles: worldFieldAffectsNeedles,
          affectTrees: worldFieldAffectsTrees,
          affectShrubs: worldFieldAffectsShrubs,
        });
        runtime.setSceneryTerrainReliefParams({
          seed: terrainReliefSeed,
          scale: terrainReliefScale,
          relief: terrainReliefAmount,
          warp: terrainReliefWarp,
          roughness: terrainReliefRoughness,
          ridge: terrainReliefRidge,
        });
        runtime.setTerrainAuthoringDebugVisible(showTerrainAuthoringDebug);
        runtime.setStarSkyParams({
          layoutDensity: starLayoutDensity,
          recoveryRate: starRecoveryRate,
          reactive: false,
        });
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
    const tick = () => setPerfStats(runtimeRef.current?.perfStats ?? null);
    tick();
    const id = window.setInterval(tick, PERF_HUD_POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

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
    runtimeRef.current?.setBandFieldParams({
      layoutDensity: bandLayoutDensity,
      vergeSizeScale: understorySizeScale,
      leafPileSizeScale: leafPileSizeScale,
      vergeBandWidth: understoryWidth,
      leafPileBandWidth: leafPileWidth,
      showVergeBand: showUnderstory,
      showLeafPiles,
    });
  }, [
    bandLayoutDensity,
    leafPileSizeScale,
    leafPileWidth,
    showLeafPiles,
    showUnderstory,
    understorySizeScale,
    understoryWidth,
  ]);

  useEffect(() => {
    runtimeRef.current?.setSceneryFoliageSeasonOverride(
      foliageSeasonOverride === "auto" ? null : foliageSeasonOverride,
    );
  }, [foliageSeasonOverride]);

  useEffect(() => {
    runtimeRef.current?.setRockFieldParams({
      layoutDensity: rockLayoutDensity,
      sizeScale: rockSizeScale,
      showRocks,
    });
  }, [rockLayoutDensity, rockSizeScale, showRocks]);

  useEffect(() => {
    runtimeRef.current?.setShrubFieldParams({
      layoutDensity: shrubLayoutDensity,
      sizeScale: shrubSizeScale,
      heightScale: shrubHeightScale,
      showShrubs,
    });
  }, [showShrubs, shrubHeightScale, shrubLayoutDensity, shrubSizeScale]);

  useEffect(() => {
    runtimeRef.current?.setTreeFieldParams({
      layoutDensity: treeLayoutDensity,
      sizeScale: treeSizeScale,
      heightScale: treeHeightScale,
      crownScale: treeCrownScale,
      showTrees,
    });
  }, [showTrees, treeCrownScale, treeHeightScale, treeLayoutDensity, treeSizeScale]);

  useEffect(() => {
    runtimeRef.current?.setLogFieldParams({
      layoutDensity: logLayoutDensity,
      sizeScale: logSizeScale,
      lengthScale: logLengthScale,
      downhillDrift: logDownhillDrift,
      showLogs,
    });
  }, [logDownhillDrift, logLayoutDensity, logLengthScale, logSizeScale, showLogs]);

  useEffect(() => {
    runtimeRef.current?.setStickFieldParams({
      layoutDensity: stickLayoutDensity,
      sizeScale: stickSizeScale,
      lengthScale: stickLengthScale,
      downhillDrift: stickDownhillDrift,
      showSticks,
    });
  }, [showSticks, stickDownhillDrift, stickLayoutDensity, stickLengthScale, stickSizeScale]);

  useEffect(() => {
    runtimeRef.current?.setSceneryMotionResponse({
      logPushScale,
      stickPushScale,
    });
  }, [logPushScale, stickPushScale]);

  useEffect(() => {
    runtimeRef.current?.setNeedleLitterFieldParams({
      layoutDensity: needleLayoutDensity,
      sizeScale: needleSizeScale,
      recoveryRate: SCENERY_NEEDLE_LITTER_BURN_PARAMS.recoveryRate,
      burnRadius: DEFAULT_NEEDLE_LITTER_FIELD_PARAMS.burnRadius,
      burnSpreadSpeed: SCENERY_NEEDLE_LITTER_BURN_PARAMS.burnSpreadSpeed,
      burnMaxRadius: DEFAULT_NEEDLE_LITTER_FIELD_PARAMS.burnMaxRadius,
      showNeedles,
    });
  }, [needleLayoutDensity, needleSizeScale, showNeedles]);

  useEffect(() => {
    runtimeRef.current?.setSceneryWorldFieldParams({
      seed: worldFieldSeed,
      scale: worldFieldScale,
      strength: worldFieldStrength,
      warp: worldFieldWarp,
      roughness: worldFieldRoughness,
      affectGrass: worldFieldAffectsGrass,
      affectFloor: worldFieldAffectsFloor,
      affectRocks: worldFieldAffectsRocks,
      affectLogs: worldFieldAffectsLogs,
      affectSticks: worldFieldAffectsSticks,
      affectNeedles: worldFieldAffectsNeedles,
      affectTrees: worldFieldAffectsTrees,
      affectShrubs: worldFieldAffectsShrubs,
    });
  }, [
    worldFieldAffectsFloor,
    worldFieldAffectsGrass,
    worldFieldAffectsLogs,
    worldFieldAffectsRocks,
    worldFieldAffectsShrubs,
    worldFieldAffectsSticks,
    worldFieldAffectsNeedles,
    worldFieldAffectsTrees,
    worldFieldRoughness,
    worldFieldScale,
    worldFieldSeed,
    worldFieldStrength,
    worldFieldWarp,
  ]);

  useEffect(() => {
    runtimeRef.current?.setSceneryTerrainReliefParams({
      seed: terrainReliefSeed,
      scale: terrainReliefScale,
      relief: terrainReliefAmount,
      warp: terrainReliefWarp,
      roughness: terrainReliefRoughness,
      ridge: terrainReliefRidge,
    });
  }, [
    terrainReliefAmount,
    terrainReliefRidge,
    terrainReliefRoughness,
    terrainReliefScale,
    terrainReliefSeed,
    terrainReliefWarp,
  ]);

  useEffect(() => {
    runtimeRef.current?.setTerrainAuthoringDebugVisible(showTerrainAuthoringDebug);
  }, [showTerrainAuthoringDebug]);

  useEffect(() => {
    runtimeRef.current?.setStarSkyParams({
      layoutDensity: starLayoutDensity,
      recoveryRate: starRecoveryRate,
      reactive: false,
    });
  }, [starLayoutDensity, starRecoveryRate]);

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
                <h1>First person demo</h1>
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
                Same runtime and controls on a much larger surface,
                now with fully seeded grass thinning, patchy understory,
                disturbable leaf litter, and clustered rocks layered over the
                field.
              </p>
            </header>

            <section className="sample-detail">
              <div className="sample-controls">

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
                      Layout narrowing under disturbance (
                      {Math.round(disturbanceStrength * 100)}%)
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
                      Layout density ({grassLayoutDensity.toFixed(2)}x) — reduce if
                      the field is too heavy
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={DEMO_GRASS_LAYOUT_DENSITY_MAX}
                      step={0.5}
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
                      Field state (
                      {GRASS_STATE_LABELS[grassState] ?? "Healthy"})
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
                  title="World field"
                  summary="Seeded organic variation for grass, floor, rocks, logs, sticks, and needles"
                >
                  <label className="control">
                    <span>Field seed ({worldFieldSeed})</span>
                    <input
                      type="range"
                      min={0}
                      max={99}
                      step={1}
                      value={worldFieldSeed}
                      onChange={(e) =>
                        setWorldFieldSeed(Number(e.target.value))
                      }
                    />
                  </label>
                  <label className="control">
                    <span>
                      World scale ({worldFieldScale.toFixed(1)} world units)
                    </span>
                    <input
                      type="range"
                      min={8}
                      max={56}
                      step={0.5}
                      value={worldFieldScale}
                      onChange={(e) =>
                        setWorldFieldScale(Number(e.target.value))
                      }
                    />
                  </label>
                  <label className="control">
                    <span>
                      Field strength ({Math.round(worldFieldStrength * 100)}%)
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.02}
                      value={worldFieldStrength}
                      onChange={(e) =>
                        setWorldFieldStrength(Number(e.target.value))
                      }
                    />
                  </label>
                  <label className="control">
                    <span>
                      Warp amount ({Math.round(worldFieldWarp * 100)}%)
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.02}
                      value={worldFieldWarp}
                      onChange={(e) =>
                        setWorldFieldWarp(Number(e.target.value))
                      }
                    />
                  </label>
                  <label className="control">
                    <span>
                      Roughness ({worldFieldRoughness.toFixed(2)})
                    </span>
                    <input
                      type="range"
                      min={0.2}
                      max={0.85}
                      step={0.01}
                      value={worldFieldRoughness}
                      onChange={(e) =>
                        setWorldFieldRoughness(Number(e.target.value))
                      }
                    />
                  </label>
                  <label className="control">
                    <span>Affect grass</span>
                    <input
                      type="checkbox"
                      checked={worldFieldAffectsGrass}
                      onChange={(e) =>
                        setWorldFieldAffectsGrass(e.target.checked)
                      }
                    />
                  </label>
                  <label className="control">
                    <span>Affect floor layers</span>
                    <input
                      type="checkbox"
                      checked={worldFieldAffectsFloor}
                      onChange={(e) =>
                        setWorldFieldAffectsFloor(e.target.checked)
                      }
                    />
                  </label>
                  <label className="control">
                    <span>Affect rocks</span>
                    <input
                      type="checkbox"
                      checked={worldFieldAffectsRocks}
                      onChange={(e) =>
                        setWorldFieldAffectsRocks(e.target.checked)
                      }
                    />
                  </label>
                  <label className="control">
                    <span>Affect logs</span>
                    <input
                      type="checkbox"
                      checked={worldFieldAffectsLogs}
                      onChange={(e) =>
                        setWorldFieldAffectsLogs(e.target.checked)
                      }
                    />
                  </label>
                  <label className="control">
                    <span>Affect sticks</span>
                    <input
                      type="checkbox"
                      checked={worldFieldAffectsSticks}
                      onChange={(e) =>
                        setWorldFieldAffectsSticks(e.target.checked)
                      }
                    />
                  </label>
                  <label className="control">
                    <span>Affect needles</span>
                    <input
                      type="checkbox"
                      checked={worldFieldAffectsNeedles}
                      onChange={(e) =>
                        setWorldFieldAffectsNeedles(e.target.checked)
                      }
                    />
                  </label>
                  <label className="control">
                    <span>Affect shrubs</span>
                    <input
                      type="checkbox"
                      checked={worldFieldAffectsShrubs}
                      onChange={(e) =>
                        setWorldFieldAffectsShrubs(e.target.checked)
                      }
                    />
                  </label>
                  <label className="control">
                    <span>Affect trees</span>
                    <input
                      type="checkbox"
                      checked={worldFieldAffectsTrees}
                      onChange={(e) =>
                        setWorldFieldAffectsTrees(e.target.checked)
                      }
                    />
                  </label>
                  <p className="control-hint">
                    This is not scatter noise. The field shapes placement masks
                    that the existing Weft surfaces already consume.
                  </p>
                </ControlSection>

                <ControlSection
                  title="Terrain relief"
                  summary="Height variation for the ground surface, player footing, and camera clearance"
                >
                  <label className="control">
                    <span>Show terrain debug</span>
                    <input
                      type="checkbox"
                      checked={showTerrainAuthoringDebug}
                      onChange={(e) =>
                        setShowTerrainAuthoringDebug(e.target.checked)
                      }
                    />
                  </label>
                  <label className="control">
                    <span>Relief seed ({terrainReliefSeed})</span>
                    <input
                      type="range"
                      min={0}
                      max={99}
                      step={1}
                      value={terrainReliefSeed}
                      onChange={(e) =>
                        setTerrainReliefSeed(Number(e.target.value))
                      }
                    />
                  </label>
                  <label className="control">
                    <span>
                      Relief span ({terrainReliefScale.toFixed(1)} world units)
                    </span>
                    <input
                      type="range"
                      min={10}
                      max={72}
                      step={0.5}
                      value={terrainReliefScale}
                      onChange={(e) =>
                        setTerrainReliefScale(Number(e.target.value))
                      }
                    />
                  </label>
                  <label className="control">
                    <span>
                      Relief amount ({terrainReliefAmount.toFixed(2)} world units)
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={2.5}
                      step={0.02}
                      value={terrainReliefAmount}
                      onChange={(e) =>
                        setTerrainReliefAmount(Number(e.target.value))
                      }
                    />
                  </label>
                  <label className="control">
                    <span>
                      Relief warp ({Math.round(terrainReliefWarp * 100)}%)
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.02}
                      value={terrainReliefWarp}
                      onChange={(e) =>
                        setTerrainReliefWarp(Number(e.target.value))
                      }
                    />
                  </label>
                  <label className="control">
                    <span>
                      Relief roughness ({terrainReliefRoughness.toFixed(2)})
                    </span>
                    <input
                      type="range"
                      min={0.2}
                      max={0.85}
                      step={0.01}
                      value={terrainReliefRoughness}
                      onChange={(e) =>
                        setTerrainReliefRoughness(Number(e.target.value))
                      }
                    />
                  </label>
                  <label className="control">
                    <span>
                      Ridge lift ({Math.round(terrainReliefRidge * 100)}%)
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.02}
                      value={terrainReliefRidge}
                      onChange={(e) =>
                        setTerrainReliefRidge(Number(e.target.value))
                      }
                    />
                  </label>
                  <p className="control-hint">
                    This stays in the Weft field model: one seeded relief read
                    drives the visible ground and the runtime&apos;s movement
                    sampling. Debug colors: green = flat, amber = slope, pink =
                    ridge, blue = basin.
                  </p>
                </ControlSection>

                <ControlSection
                  title="Forest floor"
                  summary="Field-driven scrub and leaf litter"
                >
                  <label className="control">
                    <span>Show understory</span>
                    <input
                      type="checkbox"
                      checked={showUnderstory}
                      onChange={(e) => setShowUnderstory(e.target.checked)}
                    />
                  </label>
                  <label className="control">
                    <span>Show leaf litter</span>
                    <input
                      type="checkbox"
                      checked={showLeafPiles}
                      onChange={(e) => setShowLeafPiles(e.target.checked)}
                    />
                  </label>
                  <label className="control">
                    <span>
                      Floor layout density ({bandLayoutDensity.toFixed(2)}x)
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={3}
                      step={0.05}
                      value={bandLayoutDensity}
                      onChange={(e) =>
                        setBandLayoutDensity(Number(e.target.value))
                      }
                    />
                  </label>
                  <label className="control">
                    <span>
                      Understory ribbon width ({understoryWidth.toFixed(2)} world
                      units)
                    </span>
                    <input
                      type="range"
                      min={0.5}
                      max={7}
                      step={0.05}
                      value={understoryWidth}
                      onChange={(e) => setUnderstoryWidth(Number(e.target.value))}
                    />
                  </label>
                  <label className="control">
                    <span>
                      Understory size ({understorySizeScale.toFixed(2)}x)
                    </span>
                    <input
                      type="range"
                      min={0.4}
                      max={2.5}
                      step={0.05}
                      value={understorySizeScale}
                      onChange={(e) =>
                        setUnderstorySizeScale(Number(e.target.value))
                      }
                    />
                  </label>
                  <label className="control">
                    <span>
                      Leaf litter patch width ({leafPileWidth.toFixed(2)} world units)
                    </span>
                    <input
                      type="range"
                      min={0.5}
                      max={8}
                      step={0.05}
                      value={leafPileWidth}
                      onChange={(e) => setLeafPileWidth(Number(e.target.value))}
                    />
                  </label>
                  <label className="control">
                    <span>
                      Leaf litter size ({leafPileSizeScale.toFixed(2)}x)
                    </span>
                    <input
                      type="range"
                      min={0.4}
                      max={2.8}
                      step={0.05}
                      value={leafPileSizeScale}
                      onChange={(e) =>
                        setLeafPileSizeScale(Number(e.target.value))
                      }
                    />
                  </label>
                  <label className="control">
                    <span>
                      Foliage season (
                      {LEAF_PILE_SEASON_LABELS[foliageSeason] ?? "Autumn"})
                    </span>
                    <select
                      value={foliageSeasonOverride}
                      onChange={(e) =>
                        setFoliageSeasonOverride(
                          e.target.value as keyof typeof LEAF_PILE_SEASON_LABELS | "auto",
                        )
                      }
                    >
                      <option value="auto">
                        Auto ({LEAF_PILE_SEASON_LABELS[foliageSeason] ?? "Autumn"})
                      </option>
                      {LEAF_PILE_SEASONS.map((season) => (
                        <option key={season} value={season}>
                          {LEAF_PILE_SEASON_LABELS[season]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="control-hint">
                    Understory and litter placement follow the same scenery world
                    field model: the floor read picks where bands can sit near
                    roots and relief instead of scattering a separate decal pass.
                  </p>
                </ControlSection>

                <ControlSection
                  title="Rocks"
                  summary="Stable anchors from the seeded field"
                >
                  <label className="control">
                    <span>Show rocks</span>
                    <input
                      type="checkbox"
                      checked={showRocks}
                      onChange={(e) => setShowRocks(e.target.checked)}
                    />
                  </label>
                  <label className="control">
                    <span>
                      Rock layout density ({rockLayoutDensity.toFixed(2)}x)
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={3}
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
                      min={0.4}
                      max={2.5}
                      step={0.05}
                      value={rockSizeScale}
                      onChange={(e) =>
                        setRockSizeScale(Number(e.target.value))
                      }
                    />
                  </label>
                  <p className="control-hint">
                    Rocks are intentionally sparse and stable so the reactive
                    floor layers have something solid to play against.
                  </p>
                </ControlSection>

                <ControlSection
                  title="Shrubs"
                  summary="Low clustered vegetation that thickens the forest floor"
                >
                  <label className="control">
                    <span>Show shrubs</span>
                    <input
                      type="checkbox"
                      checked={showShrubs}
                      onChange={(e) => setShowShrubs(e.target.checked)}
                    />
                  </label>
                  <label className="control">
                    <span>
                      Shrub layout density ({shrubLayoutDensity.toFixed(2)}x)
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={4}
                      step={0.02}
                      value={shrubLayoutDensity}
                      onChange={(e) =>
                        setShrubLayoutDensity(Number(e.target.value))
                      }
                    />
                  </label>
                  <label className="control">
                    <span>Shrub size ({shrubSizeScale.toFixed(2)}x)</span>
                    <input
                      type="range"
                      min={0.4}
                      max={3.4}
                      step={0.05}
                      value={shrubSizeScale}
                      onChange={(e) => setShrubSizeScale(Number(e.target.value))}
                    />
                  </label>
                  <label className="control">
                    <span>Shrub height ({shrubHeightScale.toFixed(2)}x)</span>
                    <input
                      type="range"
                      min={0.4}
                      max={3}
                      step={0.05}
                      value={shrubHeightScale}
                      onChange={(e) =>
                        setShrubHeightScale(Number(e.target.value))
                      }
                    />
                  </label>
                  <p className="control-hint">
                    Shrubs are intentionally dense forest fillers, so you can
                    push the floor from sparse clutter into thick undergrowth
                    before the tree canopy even comes into view.
                  </p>
                </ControlSection>

                <ControlSection
                  title="Trees"
                  summary="Sparse trunks and canopies that turn the field into a forest"
                >
                  <label className="control">
                    <span>Show trees</span>
                    <input
                      type="checkbox"
                      checked={showTrees}
                      onChange={(e) => setShowTrees(e.target.checked)}
                    />
                  </label>
                  <label className="control">
                    <span>Tree layout density ({treeLayoutDensity.toFixed(2)}x)</span>
                    <input
                      type="range"
                      min={0}
                      max={2}
                      step={0.02}
                      value={treeLayoutDensity}
                      onChange={(e) =>
                        setTreeLayoutDensity(Number(e.target.value))
                      }
                    />
                  </label>
                  <label className="control">
                    <span>Tree size ({treeSizeScale.toFixed(2)}x)</span>
                    <input
                      type="range"
                      min={0.5}
                      max={3}
                      step={0.05}
                      value={treeSizeScale}
                      onChange={(e) => setTreeSizeScale(Number(e.target.value))}
                    />
                  </label>
                  <label className="control">
                    <span>Tree height ({treeHeightScale.toFixed(2)}x)</span>
                    <input
                      type="range"
                      min={0.5}
                      max={3.4}
                      step={0.05}
                      value={treeHeightScale}
                      onChange={(e) =>
                        setTreeHeightScale(Number(e.target.value))
                      }
                    />
                  </label>
                  <label className="control">
                    <span>Tree crown ({treeCrownScale.toFixed(2)}x)</span>
                    <input
                      type="range"
                      min={0.4}
                      max={3}
                      step={0.05}
                      value={treeCrownScale}
                      onChange={(e) =>
                        setTreeCrownScale(Number(e.target.value))
                      }
                    />
                  </label>
                  <p className="control-hint">
                    Trees stay deterministic, but the default tuning now aims
                    for heavier trunks and fuller canopies so the scenery reads
                    like an actual forest instead of a lightly dressed field.
                  </p>
                </ControlSection>

                <ControlSection
                  title="Logs"
                  summary="Sparse fallen trunks as bigger forest anchors"
                >
                  <label className="control">
                    <span>Show logs</span>
                    <input
                      type="checkbox"
                      checked={showLogs}
                      onChange={(e) => setShowLogs(e.target.checked)}
                    />
                  </label>
                  <label className="control">
                    <span>Log layout density ({logLayoutDensity.toFixed(2)}x)</span>
                    <input
                      type="range"
                      min={0}
                      max={1.5}
                      step={0.02}
                      value={logLayoutDensity}
                      onChange={(e) =>
                        setLogLayoutDensity(Number(e.target.value))
                      }
                    />
                  </label>
                  <label className="control">
                    <span>Log size ({logSizeScale.toFixed(2)}x)</span>
                    <input
                      type="range"
                      min={0.5}
                      max={2.2}
                      step={0.05}
                      value={logSizeScale}
                      onChange={(e) => setLogSizeScale(Number(e.target.value))}
                    />
                  </label>
                  <label className="control">
                    <span>Log length ({logLengthScale.toFixed(2)}x)</span>
                    <input
                      type="range"
                      min={0.6}
                      max={2.8}
                      step={0.05}
                      value={logLengthScale}
                      onChange={(e) =>
                        setLogLengthScale(Number(e.target.value))
                      }
                    />
                  </label>
                  <label className="control">
                    <span>Log shove response ({logPushScale.toFixed(2)}x)</span>
                    <input
                      type="range"
                      min={0.2}
                      max={4}
                      step={0.05}
                      value={logPushScale}
                      onChange={(e) => setLogPushScale(Number(e.target.value))}
                    />
                  </label>
                  <label className="control">
                    <span>Log downhill carry ({logDownhillDrift.toFixed(2)}x)</span>
                    <input
                      type="range"
                      min={0}
                      max={2.5}
                      step={0.05}
                      value={logDownhillDrift}
                      onChange={(e) =>
                        setLogDownhillDrift(Number(e.target.value))
                      }
                    />
                  </label>
                  <p className="control-hint">
                    Logs keep persistent per-log motion state, so shoves and
                    shots move individual trunks across the ground, and now
                    terrain slope can keep them rolling downhill after impact.
                  </p>
                </ControlSection>

                <ControlSection
                  title="Sticks"
                  summary="Twig clusters that spawn in clumps but react as many individual sticks"
                >
                  <label className="control">
                    <span>Show sticks</span>
                    <input
                      type="checkbox"
                      checked={showSticks}
                      onChange={(e) => setShowSticks(e.target.checked)}
                    />
                  </label>
                  <label className="control">
                    <span>Stick layout density ({stickLayoutDensity.toFixed(2)}x)</span>
                    <input
                      type="range"
                      min={0}
                      max={2.5}
                      step={0.02}
                      value={stickLayoutDensity}
                      onChange={(e) =>
                        setStickLayoutDensity(Number(e.target.value))
                      }
                    />
                  </label>
                  <label className="control">
                    <span>Stick size ({stickSizeScale.toFixed(2)}x)</span>
                    <input
                      type="range"
                      min={0.4}
                      max={2}
                      step={0.05}
                      value={stickSizeScale}
                      onChange={(e) => setStickSizeScale(Number(e.target.value))}
                    />
                  </label>
                  <label className="control">
                    <span>Stick length ({stickLengthScale.toFixed(2)}x)</span>
                    <input
                      type="range"
                      min={0.5}
                      max={2.2}
                      step={0.05}
                      value={stickLengthScale}
                      onChange={(e) =>
                        setStickLengthScale(Number(e.target.value))
                      }
                    />
                  </label>
                  <label className="control">
                    <span>Stick spread response ({stickPushScale.toFixed(2)}x)</span>
                    <input
                      type="range"
                      min={0.2}
                      max={2.6}
                      step={0.05}
                      value={stickPushScale}
                      onChange={(e) => setStickPushScale(Number(e.target.value))}
                    />
                  </label>
                  <label className="control">
                    <span>Stick downhill carry ({stickDownhillDrift.toFixed(2)}x)</span>
                    <input
                      type="range"
                      min={0}
                      max={1.6}
                      step={0.05}
                      value={stickDownhillDrift}
                      onChange={(e) =>
                        setStickDownhillDrift(Number(e.target.value))
                      }
                    />
                  </label>
                  <p className="control-hint">
                    Sticks still spawn as clustered debris, but each twig now
                    keeps its own persistent motion state; slope can tease the
                    bundle downhill too, but less aggressively than logs.
                  </p>
                </ControlSection>

                <ControlSection
                  title="Needles"
                  summary="Evergreen cone and needle litter that burns under shots"
                >
                  <label className="control">
                    <span>Show needles</span>
                    <input
                      type="checkbox"
                      checked={showNeedles}
                      onChange={(e) => setShowNeedles(e.target.checked)}
                    />
                  </label>
                  <label className="control">
                    <span>Needle layout density ({needleLayoutDensity.toFixed(2)}x)</span>
                    <input
                      type="range"
                      min={0}
                      max={2.5}
                      step={0.02}
                      value={needleLayoutDensity}
                      onChange={(e) =>
                        setNeedleLayoutDensity(Number(e.target.value))
                      }
                    />
                  </label>
                  <label className="control">
                    <span>Needle size ({needleSizeScale.toFixed(2)}x)</span>
                    <input
                      type="range"
                      min={0.4}
                      max={2}
                      step={0.05}
                      value={needleSizeScale}
                      onChange={(e) => setNeedleSizeScale(Number(e.target.value))}
                    />
                  </label>
                  <p className="control-hint">
                    Needle litter stays passive under footsteps, but shots burn
                    it outward in a spreading ring.
                  </p>
                </ControlSection>

                <ControlSection title="Star sky" summary="Atmosphere">
                  <label className="control">
                    <span>Layout density</span>
                    <input
                      type="range"
                      min={0}
                      max={3}
                      step={0.05}
                      value={starLayoutDensity}
                      onChange={(e) =>
                        setStarLayoutDensity(Number(e.target.value))
                      }
                    />
                  </label>
                  <label className="control">
                    <span>Recovery rate</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.02}
                      value={starRecoveryRate}
                      onChange={(e) =>
                        setStarRecoveryRate(Number(e.target.value))
                      }
                    />
                  </label>
                </ControlSection>

                <ControlSection title="Quick actions" summary="Reset surfaces">
                  <div className="control-actions">
                    <button
                      type="button"
                      className="btn btn--secondary"
                      onClick={() => runtimeRef.current?.clearGrassDisturbances()}
                    >
                      Clear grass
                    </button>
                    <button
                      type="button"
                      className="btn btn--secondary"
                      onClick={() => runtimeRef.current?.clearLeafPileDisturbances()}
                    >
                      Clear litter
                    </button>
                    <button
                      type="button"
                      className="btn btn--secondary"
                      onClick={() => runtimeRef.current?.clearStickFieldDisturbances()}
                    >
                      Clear sticks
                    </button>
                    <button
                      type="button"
                      className="btn btn--secondary"
                      onClick={() => runtimeRef.current?.clearLogFieldReactions()}
                    >
                      Clear logs
                    </button>
                    <button
                      type="button"
                      className="btn btn--secondary"
                      onClick={() => runtimeRef.current?.clearNeedleLitterBurns()}
                    >
                      Clear needles
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
            <div className="perf-hud__toolbar">
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
              <button
                type="button"
                className="perf-hud__copy"
                aria-label={`Copy profiler averages for the last ${perfStats.longWindow.windowSec} seconds to clipboard`}
                title={`Copy rolling averages (last ${perfStats.longWindow.windowSec}s, ${perfStats.longWindow.sampleCount} samples)`}
                onClick={() => {
                  const text = formatPlaygroundPerfClipboardText(perfStats);
                  void navigator.clipboard?.writeText(text);
                }}
              >
                Copy {perfStats.longWindow.windowSec}s avg
              </button>
            </div>
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
                  {perfStats.leafCpuMs.toFixed(2)} / {perfStats.leafCpuMsAvg.toFixed(2)} | Rock:{" "}
                  {perfStats.rockCpuMs.toFixed(2)} / {perfStats.rockCpuMsAvg.toFixed(2)} | Log:{" "}
                  {perfStats.logCpuMs.toFixed(2)} / {perfStats.logCpuMsAvg.toFixed(2)} | Stick:{" "}
                  {perfStats.stickCpuMs.toFixed(2)} / {perfStats.stickCpuMsAvg.toFixed(2)} | Needle:{" "}
                  {perfStats.needleCpuMs.toFixed(2)} / {perfStats.needleCpuMsAvg.toFixed(2)} | Sky:{" "}
                  {perfStats.skyCpuMs.toFixed(2)} / {perfStats.skyCpuMsAvg.toFixed(2)}
                </div>
              </>
            )}
          </div>
        )}
        {runtimeState === "ready" && (
          <div className="viewport-hint" aria-hidden>
            Click the first person view to capture the mouse. Press <code>Escape</code>{" "}
            to release it.
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
                ? "Loading the field."
                : (runtimeError ??
                  "This demo requires a WebGPU-capable browser and adapter.")}
            </span>
          </div>
        )}
      </main>
    </div>
  );
}
