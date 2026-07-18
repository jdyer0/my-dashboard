// Generates the PWA icon set into public/ — a teal ring and centre dot on the
// canvas colour, matching the app's instrument look. Pure Node, no image deps.
// Run: npm run icons

import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const BG = [0x0b, 0x0f, 0x10]
const FG = [0x2d, 0xd4, 0xbf]

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'ascii')
  data.copy(out, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}

function png(size, pixels) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // colour type: truecolour RGB
  const raw = Buffer.alloc(size * (size * 3 + 1))
  for (let y = 0; y < size; y++) {
    const row = y * (size * 3 + 1)
    raw[row] = 0 // filter: none
    pixels.copy(raw, row + 1, y * size * 3, (y + 1) * size * 3)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const clamp01 = (v) => Math.min(1, Math.max(0, v))

function render(size, { safeScale = 1 } = {}) {
  const pixels = Buffer.alloc(size * size * 3)
  const centre = (size - 1) / 2
  const ringR = size * 0.32 * safeScale
  const ringHalf = Math.max(0.75, size * 0.022)
  const dotR = size * 0.05 * safeScale

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - centre, y - centre)
      const ring = clamp01(ringHalf + 0.75 - Math.abs(d - ringR))
      const dot = clamp01(dotR + 0.75 - d)
      const a = Math.max(ring, dot)
      const i = (y * size + x) * 3
      for (let c = 0; c < 3; c++) pixels[i + c] = Math.round(BG[c] + (FG[c] - BG[c]) * a)
    }
  }
  return png(size, pixels)
}

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')
mkdirSync(publicDir, { recursive: true })

writeFileSync(join(publicDir, 'apple-touch-icon.png'), render(180))
writeFileSync(join(publicDir, 'icon-192.png'), render(192))
writeFileSync(join(publicDir, 'icon-512.png'), render(512))
// Maskable: keep the mark inside the 80% safe zone.
writeFileSync(join(publicDir, 'icon-maskable-512.png'), render(512, { safeScale: 0.72 }))

console.log('Wrote 4 icons to public/')
