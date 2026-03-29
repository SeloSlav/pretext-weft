import { layoutNextLine, type LayoutCursor, type PreparedTextWithSegments } from '@chenglou/pretext'
import { graphemesOf } from '../samples/graphemes'
import type { SeedCursorFactory } from './types'

type SurfaceLayoutBandOptions = {
  prepared: PreparedTextWithSegments
  rows: number
  advanceForRow: (row: number) => number
  seedCursor: SeedCursorFactory
}

type SurfaceLayoutDriverOptions = SurfaceLayoutBandOptions & {
  sectors: number
  staggerFactor?: number
  minSpanFactor?: number
  minLayoutWidth?: number
}

export type SurfaceLayoutSlot = {
  row: number
  sector: number
  lineCoord: number
  spanStart: number
  spanEnd: number
  spanCenter: number
  spanSize: number
  sectorStep: number
  rowOffset: number
}

export type SurfaceLayoutLine = {
  slot: SurfaceLayoutSlot
  lineText: string
  glyphs: string[]
  maxWidth: number
  cursorStart: LayoutCursor
  cursorEnd: LayoutCursor
}

type LayoutTraversalOptions = {
  spanMin: number
  spanMax: number
  lineCoordAtRow: (row: number) => number
  rowOffsetAt?: (row: number, sectorStep: number) => number
  getMaxWidth: (slot: SurfaceLayoutSlot) => number
  onLine: (line: SurfaceLayoutLine) => void
}

const ROOT_CURSOR: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }

function cloneCursor(cursor: LayoutCursor): LayoutCursor {
  return { segmentIndex: cursor.segmentIndex, graphemeIndex: cursor.graphemeIndex }
}

function layoutNextLineOrRewind(
  prepared: PreparedTextWithSegments,
  cursor: LayoutCursor,
  maxWidth: number,
) {
  let activeCursor = cloneCursor(cursor)
  let line = layoutNextLine(prepared, activeCursor, maxWidth)
  if (line === null) {
    activeCursor = cloneCursor(ROOT_CURSOR)
    line = layoutNextLine(prepared, activeCursor, maxWidth)
  }
  if (line === null) return null

  return {
    line,
    cursorEnd: cloneCursor(line.end),
  }
}

export function createBandSeeds({
  prepared,
  rows,
  advanceForRow,
  seedCursor,
}: SurfaceLayoutBandOptions): LayoutCursor[] {
  return Array.from({ length: rows }, (_, row) => seedCursor(prepared, advanceForRow(row)))
}

export class SurfaceLayoutDriver {
  private readonly prepared: PreparedTextWithSegments
  private readonly rows: number
  private readonly sectors: number
  private readonly staggerFactor: number
  private readonly minSpanFactor: number
  private readonly minLayoutWidth: number
  private readonly bandSeeds: LayoutCursor[]

  constructor({
    prepared,
    rows,
    sectors,
    advanceForRow,
    seedCursor,
    staggerFactor = 0.5,
    minSpanFactor = 0.33,
    minLayoutWidth = 8,
  }: SurfaceLayoutDriverOptions) {
    this.prepared = prepared
    this.rows = rows
    this.sectors = sectors
    this.staggerFactor = staggerFactor
    this.minSpanFactor = minSpanFactor
    this.minLayoutWidth = minLayoutWidth
    this.bandSeeds = createBandSeeds({ prepared, rows, advanceForRow, seedCursor })
  }

  forEachLaidOutLine({
    spanMin,
    spanMax,
    lineCoordAtRow,
    rowOffsetAt,
    getMaxWidth,
    onLine,
  }: LayoutTraversalOptions): void {
    const sectorStep = (spanMax - spanMin) / this.sectors

    for (let row = 0; row < this.rows; row++) {
      const lineCoord = lineCoordAtRow(row)
      const rowOffset = rowOffsetAt
        ? rowOffsetAt(row, sectorStep)
        : (row % 2) * sectorStep * this.staggerFactor
      let cursor = cloneCursor(this.bandSeeds[row] ?? ROOT_CURSOR)

      for (let sector = 0; sector < this.sectors; sector++) {
        const rawStart = spanMin + sector * sectorStep + rowOffset
        const rawEnd = rawStart + sectorStep
        const spanStart = Math.max(spanMin, rawStart)
        const spanEnd = Math.min(spanMax, rawEnd)
        const spanSize = spanEnd - spanStart
        if (spanSize < sectorStep * this.minSpanFactor) continue

        const slot: SurfaceLayoutSlot = {
          row,
          sector,
          lineCoord,
          spanStart,
          spanEnd,
          spanCenter: (spanStart + spanEnd) * 0.5,
          spanSize,
          sectorStep,
          rowOffset,
        }

        const requestedWidth = getMaxWidth(slot)
        if (requestedWidth <= 0) continue
        const maxWidth = Math.max(this.minLayoutWidth, requestedWidth)
        const cursorStart = cloneCursor(cursor)
        const laidOut = layoutNextLineOrRewind(this.prepared, cursorStart, maxWidth)
        if (laidOut === null) continue

        cursor = laidOut.cursorEnd
        const glyphs = graphemesOf(laidOut.line.text).filter((glyph) => !/^\s+$/.test(glyph))
        if (glyphs.length === 0) continue

        onLine({
          slot,
          lineText: laidOut.line.text,
          glyphs,
          maxWidth,
          cursorStart,
          cursorEnd: cloneCursor(laidOut.cursorEnd),
        })
      }
    }
  }
}
