/**
 * מייצר את אייקוני ה-PWA כקבצי PNG.
 *
 * הציור נעשה פיקסל-אחר-פיקסל וההצפנה דרך zlib המובנה של Node,
 * כדי שלא תידרש ספריית עיבוד תמונה רק בשביל שני אייקונים.
 *
 * הרצה:  node scripts/make-icons.mjs
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons')

const BG = [10, 13, 20]
const GRAD_FROM = [77, 157, 255]
const GRAD_TO = [169, 125, 255]

const lerp = (a, b, t) => a + (b - a) * t
const mix = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)]

/** כיסוי אנטי-אליאסינג של טבעת בעובי נתון סביב מרכז */
function ringCoverage(dist, radius, halfWidth) {
  const d = Math.abs(dist - radius)
  return clamp(halfWidth - d + 0.5, 0, 1)
}
function diskCoverage(dist, radius) {
  return clamp(radius - dist + 0.5, 0, 1)
}
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)

/** ריבוע מעוגל — מוחזר כיסוי לכל פיקסל */
function roundedRectCoverage(x, y, size, radius) {
  const cx = Math.min(Math.max(x, radius), size - radius)
  const cy = Math.min(Math.max(y, radius), size - radius)
  const dx = x - cx
  const dy = y - cy
  const dist = Math.hypot(dx, dy)
  return clamp(radius - dist + 0.5, 0, 1)
}

function render(size, { maskable }) {
  const px = Buffer.alloc(size * size * 4)
  // באייקון maskable המערכת חותכת את הקצוות, ולכן התוכן מוקטן לאזור הבטוח
  const scale = maskable ? 0.7 : 1
  const cornerRadius = maskable ? size / 2 : size * 0.219

  const cx = size / 2
  const ringR = size * 0.258 * scale
  const ringW = size * 0.039 * scale
  const ringCy = size * 0.461
  const dotR = size * 0.0586 * scale
  const dotCy = size * 0.816

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      const fx = x + 0.5
      const fy = y + 0.5

      const bgCov = maskable ? 1 : roundedRectCoverage(fx, fy, size, cornerRadius)
      let [r, g, b] = BG

      // הגרדיאנט נמשך לאורך האלכסון, כמו בגרסת ה-SVG
      const t = clamp((fx + fy) / (2 * size), 0, 1)
      const grad = mix(GRAD_FROM, GRAD_TO, t)

      const ringCov = ringCoverage(Math.hypot(fx - cx, fy - ringCy), ringR, ringW)
      const dotCov = diskCoverage(Math.hypot(fx - cx, fy - dotCy), dotR)
      const fg = clamp(ringCov + dotCov, 0, 1)

      r = lerp(r, grad[0], fg)
      g = lerp(g, grad[1], fg)
      b = lerp(b, grad[2], fg)

      px[i] = Math.round(r)
      px[i + 1] = Math.round(g)
      px[i + 2] = Math.round(b)
      px[i + 3] = Math.round(255 * bgCov)
    }
  }
  return px
}

function crc32(buf) {
  let c
  const table = crc32.table ?? (crc32.table = (() => {
    const t = new Int32Array(256)
    for (let n = 0; n < 256; n++) {
      c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      t[n] = c
    }
    return t
  })())
  let crc = -1
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff]
  return (crc ^ -1) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePng(size, pixels) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  // כל שורה נפתחת בבייט סוג הפילטר; 0 = ללא פילטר
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync(OUT_DIR, { recursive: true })
const targets = [
  ['icon-192.png', 192, { maskable: false }],
  ['icon-512.png', 512, { maskable: false }],
  ['icon-maskable-512.png', 512, { maskable: true }],
]
for (const [name, size, opts] of targets) {
  const png = encodePng(size, render(size, opts))
  writeFileSync(join(OUT_DIR, name), png)
  console.log(`${name}  ${size}x${size}  ${(png.length / 1024).toFixed(1)} kB`)
}
