# Future Preset Ideas

Shortlist of Weft-shaped preset directions that feel broad enough to matter for game developers while still fitting the `source -> layout -> effect` model.

## Best Next Candidates

### Band / Ribbon / Strip

Good for roadsides, river edges, crop rows, roots, fungus seams, shoreline foam, trench clutter, and conveyor debris.

Why it fits:

- it is still an anchored reactive surface rather than a free particle system
- it gives developers a reusable "narrow environmental corridor" primitive that current presets do not cover well
- it is a strong customization starting point for many grounded world details

Status: first candidate to prototype

### Hanging / Canopy

Good for vines, moss curtains, wires, lantern strings, stalactites, ceiling growth, and bead-curtain-like effects.

Why it fits:

- same reactive surface idea as grass or shell surfaces, but suspended
- useful for interior spaces, caves, ruins, and overgrowth-heavy scenes

### Mesh-Cling Patch

Good for moss, barnacles, heat bloom, corruption, frost, and shell growth on arbitrary props or architecture.

Why it fits:

- covers "surface attached" growth and damage states on arbitrary meshes
- gives a strong gameplay-facing primitive for spread, decay, and recovery

### Actor-Bound Shell / Aura

Good for shields, swarms, cloaks, orbiting wards, halo membranes, and attached magical layers.

Why it fits:

- not purely environmental, but still anchored to a stable moving frame
- keeps the layout-driven model while opening character-bound use cases

## Things To Avoid Treating As Core Presets

### Generic projectiles

Usually not a great Weft fit. Projectiles are short-lived actors moving freely through space, not anchored reactive surfaces.

### Loose particle spam

Generic ambient or magical particles usually want a regular VFX/particle workflow. Weft is better when the effect is spatially anchored and reacts through layout, width, recovery, or semantic state.
