export type SampleId = 'torus-wound' | 'plane-ribbon'

export type SampleMeta = {
  id: SampleId
  title: string
  description: string
}

export const SAMPLE_LIST: readonly SampleMeta[] = [
  {
    id: 'torus-wound',
    title: 'Torus + wound',
    description:
      'A contour-band layout field wrapped onto a torus. Pretext breaks a measured symbol stream against per-sector widths, then plain Three.js projects the results back onto the surface.',
  },
  {
    id: 'plane-ribbon',
    title: 'Plane ribbons',
    description:
      'A simpler reference case: flat bands with a width-cutting obstacle. Same Pretext preparation, same arithmetic width walk, no React Three Fiber scene graph in the render path.',
  },
] as const
