import sharp from 'sharp'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const OUT = resolve('public')
mkdirSync(OUT, { recursive: true })

// Calm palette
const BG = '#EAF6F5' // calm-soft
const TEAL = '#3FB8AF' // calm

/**
 * Lasai icon = the in-app brand mark (CalmMark): two overlapping soft petals.
 * Same paths as src/presentation/components/common/CalmMark.tsx, so the installed
 * icon, the favicon and the in-app logo all match. Centered on a calm-soft tile.
 */
function iconSvg({ size, withBackground = true }) {
  // Authored in the 32-unit CalmMark space; sharp rasterizes at width/height.
  const bg = withBackground
    ? `<rect x="0" y="0" width="32" height="32" rx="7" ry="7" fill="${BG}"/>`
    : ''
  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">
    ${bg}
    <path d="M16 4c6 4 9 8 9 13a9 9 0 0 1-18 0c0-5 3-9 9-13Z" fill="${TEAL}" opacity="0.9"/>
    <path d="M16 9c3.2 2.4 5 5 5 8.2A5 5 0 0 1 16 22a5 5 0 0 1-5-4.8c0-3.2 1.8-5.8 5-8.2Z" fill="${BG}"/>
  </svg>`
}

async function png(svg, file) {
  const buf = await sharp(Buffer.from(svg)).png().toBuffer()
  writeFileSync(resolve(OUT, file), buf)
  console.warn(`wrote ${file}`)
}

async function main() {
  await png(iconSvg({ size: 192 }), 'icon-192.png')
  await png(iconSvg({ size: 512 }), 'icon-512.png')
  await png(iconSvg({ size: 512 }), 'icon-maskable-512.png')
  await png(iconSvg({ size: 180 }), 'apple-touch-icon.png')

  // favicon.ico from a small rendering
  const ico = await sharp(Buffer.from(iconSvg({ size: 64 })))
    .resize(48, 48)
    .png()
    .toBuffer()
  writeFileSync(resolve(OUT, 'favicon.ico'), ico)
  console.warn('wrote favicon.ico')
}

void main()
