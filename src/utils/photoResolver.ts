/**
 * Photo Resolver — three-strategy image resolution for bulk PDF generation.
 *
 * CSV columns supported (per row):
 *   photo_url      – remotely hosted image, fetched at render time
 *   photo_path     – relative path inside a ZIP upload or server folder
 *   photo_b64      – inline base64 string (useful for small batches / offline)
 *   photo_zone_id  – which template slot to inject into (e.g. "headshot")
 *   photo_width    – target width in px
 *   photo_height   – target height in px
 *   photo_align    – crop anchor: "center" | "top" | "face"
 *
 * For multiple photos per row, suffix columns:
 *   photo_url_1, photo_zone_id_1, photo_url_2, photo_zone_id_2, …
 */

export type PhotoAlign = 'center' | 'top' | 'face';
export type PhotoSource = 'url' | 'path' | 'b64' | 'placeholder';

export interface ResolvedPhoto {
  source: PhotoSource;
  data: ArrayBuffer | null;
  zoneId: string;
  width: number;
  height: number;
  align: PhotoAlign;
  error?: string;       // set when data is null (resolution failed)
  mimeType?: string;    // detected mime for embedding (image/jpeg | image/png)
}

export interface PhotoError {
  row: number;
  name: string;
  reason: string;
}

// ─── Default configuration ───────────────────────────────────────────────────

const DEFAULT_WIDTH = 120;
const DEFAULT_HEIGHT = 140;
const DEFAULT_ALIGN: PhotoAlign = 'center';
const DEFAULT_ZONE = 'default';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Detect MIME from a filename or data-URI prefix */
function detectMime(value: string): string {
  if (value.startsWith('data:image/png')) return 'image/png';
  if (value.startsWith('data:image/gif')) return 'image/gif';
  if (value.startsWith('data:image/webp')) return 'image/webp';
  // Default to JPEG for .jpg/.jpeg and unknown
  return 'image/jpeg';
}

function detectMimeFromPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

// ─── Core resolver ───────────────────────────────────────────────────────────

/**
 * Resolve a single photo from a CSV row using the three-strategy priority:
 *   1. photo_url   → fetch remote
 *   2. photo_path  → lookup in ZIP bundle images
 *   3. photo_b64   → decode inline base64
 *   4. fallback     → placeholder (never crash the batch)
 *
 * @param row            A single CSV data row
 * @param existingImages Images extracted from a ZIP (keyed by lowercase filename/path)
 * @param suffix         Optional suffix for multi-photo columns (e.g. "_1")
 */
export async function resolvePhoto(
  row: Record<string, any>,
  existingImages: Record<string, ArrayBuffer>,
  suffix: string = '',
): Promise<ResolvedPhoto> {
  const zoneId = row[`photo_zone_id${suffix}`] || DEFAULT_ZONE;
  const width = parseInt(row[`photo_width${suffix}`]) || DEFAULT_WIDTH;
  const height = parseInt(row[`photo_height${suffix}`]) || DEFAULT_HEIGHT;
  const align: PhotoAlign = row[`photo_align${suffix}`] || DEFAULT_ALIGN;

  // ── Strategy 1: Remote URL ──────────────────────────────────────────────
  const photoUrl = row[`photo_url${suffix}`]?.trim();
  if (photoUrl) {
    try {
      const response = await fetch(photoUrl, { mode: 'cors' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      return {
        source: 'url',
        data: arrayBuffer,
        zoneId,
        width,
        height,
        align,
        mimeType: blob.type || detectMime(photoUrl),
      };
    } catch (err: any) {
      return {
        source: 'url',
        data: null,
        zoneId,
        width,
        height,
        align,
        error: `fetch_failed: ${err.message || err}`,
      };
    }
  }

  // ── Strategy 2: Path from ZIP / bundle ──────────────────────────────────
  const photoPath = row[`photo_path${suffix}`]?.trim();
  if (photoPath) {
    const key = photoPath.split(/[\\/]/).pop()?.toLowerCase() || '';
    const data =
      existingImages[key] ||
      existingImages[photoPath.toLowerCase()] ||
      existingImages[`photos/${key}`] ||
      existingImages[`photos/${photoPath.toLowerCase()}`];
    if (data) {
      return {
        source: 'path',
        data,
        zoneId,
        width,
        height,
        align,
        mimeType: detectMimeFromPath(photoPath),
      };
    }
    return {
      source: 'path',
      data: null,
      zoneId,
      width,
      height,
      align,
      error: 'photo_not_found',
    };
  }

  // ── Strategy 3: Base64 inline ───────────────────────────────────────────
  const photoB64 = row[`photo_b64${suffix}`]?.trim();
  if (photoB64) {
    try {
      const base64 = photoB64.replace(/^data:image\/[a-z]+;base64,/, '');
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return {
        source: 'b64',
        data: bytes.buffer as ArrayBuffer,
        zoneId,
        width,
        height,
        align,
        mimeType: detectMime(photoB64),
      };
    } catch (err: any) {
      return {
        source: 'b64',
        data: null,
        zoneId,
        width,
        height,
        align,
        error: `invalid_format: ${err.message || err}`,
      };
    }
  }

  // ── Fallback: Placeholder ───────────────────────────────────────────────
  return {
    source: 'placeholder',
    data: null,
    zoneId,
    width,
    height,
    align,
  };
}

/**
 * Resolve ALL photo columns for a single CSV row.
 * Detects suffixed columns (photo_url_1, photo_url_2, …) automatically.
 */
export async function resolveAllPhotos(
  row: Record<string, any>,
  existingImages: Record<string, ArrayBuffer>,
): Promise<ResolvedPhoto[]> {
  const results: ResolvedPhoto[] = [];

  // 1. Resolve the base (unsuffixed) photo columns
  const hasBase = row.photo_url || row.photo_path || row.photo_b64;
  if (hasBase) {
    results.push(await resolvePhoto(row, existingImages, ''));
  }

  // 2. Detect suffixed columns: photo_url_1, photo_url_2, …
  const suffixes = new Set<string>();
  for (const key of Object.keys(row)) {
    const match = key.match(/^photo_(?:url|path|b64|zone_id|width|height|align)_(\d+)$/);
    if (match) suffixes.add(`_${match[1]}`);
  }

  for (const suffix of suffixes) {
    results.push(await resolvePhoto(row, existingImages, suffix));
  }

  return results;
}

// ─── Error CSV generation ────────────────────────────────────────────────────

/**
 * Build an errors.csv string from accumulated photo errors.
 * Columns: row, name, reason
 */
export function buildErrorsCsv(errors: PhotoError[]): string {
  if (errors.length === 0) return '';
  const header = 'row,name,reason';
  const rows = errors.map(e => `${e.row},"${e.name}","${e.reason}"`);
  return [header, ...rows].join('\n');
}

// ─── Drag-and-drop auto-matcher ─────────────────────────────────────────────

/**
 * Auto-match uploaded photo files to CSV rows by name.
 * Matches filename (without extension) against the "name" or "csvname" column.
 */
export function autoMatchPhotos(
  files: File[],
  csvData: Record<string, any>[],
): Record<string, ArrayBuffer> {
  const matched: Record<string, ArrayBuffer> = {};

  // We return synchronously; callers should await file.arrayBuffer() themselves
  // This function is a convenience for synchronous matching logic only.
  // Actual loading is done in the async wrapper below.
  return matched;
}

/**
 * Async version: loads file contents and matches to CSV rows.
 */
export async function autoMatchPhotosAsync(
  files: File[],
  csvData: Record<string, any>[],
): Promise<Record<string, ArrayBuffer>> {
  const matched: Record<string, ArrayBuffer> = {};

  for (const file of files) {
    const baseName = file.name.replace(/\.[^/.]+$/, '').toLowerCase();

    // Find matching row by name column
    const matchingRow = csvData.find(
      row =>
        row.name?.toLowerCase().replace(/\s+/g, '_') === baseName ||
        row.csvname?.toLowerCase().replace(/\s+/g, '_') === baseName ||
        row.name?.toLowerCase() === baseName.replace(/_/g, ' ') ||
        row.csvname?.toLowerCase() === baseName.replace(/_/g, ' '),
    );

    if (matchingRow) {
      const buffer = await file.arrayBuffer();
      matched[baseName] = buffer;
      // Also store with original filename
      matched[file.name.toLowerCase()] = buffer;
      // Update row's photo_path implicitly
      if (!matchingRow.photo_path && !matchingRow.photo_url && !matchingRow.photo_b64) {
        matchingRow.photo_path = file.name;
      }
    }
  }

  return matched;
}
