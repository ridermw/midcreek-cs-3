import type { ThumbnailRecord } from './publication.ts'

export interface ThumbnailRenderer {
  render(bytes: Buffer, source: { sha256: string; width: number; height: number }): Promise<{ record: ThumbnailRecord; bytes: Buffer }>
  close(): Promise<void>
}
export function createThumbnailRenderer(): Promise<ThumbnailRenderer>
