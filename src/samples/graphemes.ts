const graphemeSplitter =
  typeof Intl !== 'undefined' ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null

export function graphemesOf(s: string): string[] {
  if (graphemeSplitter) {
    return [...graphemeSplitter.segment(s)].map((x) => x.segment)
  }
  return [...s]
}
