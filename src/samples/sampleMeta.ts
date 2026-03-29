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
      'Contour bands on a deforming torus: each sector’s arc length becomes Pretext layout width. A moving angular wound narrows that width so the skin reflows like text beside a float.',
  },
  {
    id: 'plane-ribbon',
    title: 'Plane ribbons',
    description:
      'Flat ribbons along X with multiple Z bands—like lines on a page. A drifting obstacle shrinks available width so modules repack in real time (same prepare, arithmetic layout per sector).',
  },
] as const
