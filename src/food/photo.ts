// Turns a camera roll photo into something worth sending. An iPhone photo is
// 3–5 MB and 4032px wide; Gemini tiles images at 768px, so the extra pixels buy
// nothing and cost seconds of upload on mobile data. Downscaling to a 1024px
// edge lands most meals under 200 KB.

/** Longest edge we send. */
const MAX_EDGE = 1024
/** JPEG quality — food photos are noisy enough that 0.72 is invisible here. */
const QUALITY = 0.72
/** Refuse absurd files before spending memory decoding them. */
const MAX_FILE_BYTES = 25 * 1024 * 1024

export interface MealImage {
  /** Base64 with no data: prefix — the Edge Function hands it straight to Gemini. */
  data: string
  mimeType: string
  /** Object URL for the thumbnail. Revoke it when the photo is dropped. */
  previewUrl: string
}

/**
 * Dimensions that fit inside a square of `max`, keeping the aspect ratio.
 * Never enlarges: a photo already smaller than the cap is sent as it is,
 * because upscaling would invent detail the model would then read as real.
 */
export function fitWithin(
  width: number,
  height: number,
  max: number,
): { width: number; height: number } {
  const longest = Math.max(width, height)
  if (longest <= max || longest === 0) return { width, height }
  const scale = max / longest
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read the photo'))
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      const comma = result.indexOf(',')
      if (comma === -1) reject(new Error('Could not read the photo'))
      else resolve(result.slice(comma + 1))
    }
    reader.readAsDataURL(blob)
  })
}

/**
 * Decode, downscale and re-encode as JPEG. Re-encoding is what makes HEIC and
 * PNG share-sheet pastes work: whatever the browser can decode comes out the
 * far side as something Gemini accepts.
 */
export async function prepareMealPhoto(file: File): Promise<MealImage> {
  if (file.size > MAX_FILE_BYTES) throw new Error('That photo is too large')

  // `from-image` applies the EXIF rotation an iPhone writes rather than
  // baking it in — a sideways plate reads as a sideways plate.
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const { width, height } = fitWithin(bitmap.width, bitmap.height, MAX_EDGE)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    throw new Error('Could not read the photo')
  }
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', QUALITY),
  )
  if (!blob) throw new Error('Could not read the photo')

  return {
    data: await toBase64(blob),
    mimeType: 'image/jpeg',
    previewUrl: URL.createObjectURL(blob),
  }
}
