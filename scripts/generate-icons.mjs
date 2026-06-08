import sharp from 'sharp'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const OUT = resolve('public')
mkdirSync(OUT, { recursive: true })

// Calm palette
const BG = '#EAF6F5' // calm-soft
const TEAL = '#3FB8AF' // calm
const TEAL_DEEP = '#2E938C'

/**
 * Placeholder Lasai icon: a soft teal "breathing" circle on a calm background.
 * Intentionally minimal — to be replaced by real branding later.
 */
function iconSvg({ size, withBackground = true }) {
  const radius = size * 0.22
  const cx = size / 2
  const cy = size / 2
  const bg = withBackground
    ? `<rect x="0" y="0" width="${size}" height="${size}" rx="${radius.toFixed(2)}" ry="${radius.toFixed(2)}" fill="${BG}"/>`
    : ''
  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <defs>
      <radialGradient id="g" cx="50%" cy="42%" r="60%">
        <stop offset="0%" stop-color="${TEAL}"/>
        <stop offset="100%" stop-color="${TEAL_DEEP}"/>
      </radialGradient>
    </defs>
    ${bg}
    <circle cx="${cx}" cy="${cy}" r="${(size * 0.34).toFixed(2)}" fill="url(#g)"/>
    <circle cx="${cx}" cy="${cy}" r="${(size * 0.34).toFixed(2)}" fill="none"
            stroke="${BG}" stroke-opacity="0.55" stroke-width="${(size * 0.035).toFixed(2)}"/>
    <circle cx="${cx}" cy="${cy}" r="${(size * 0.18).toFixed(2)}" fill="${BG}" fill-opacity="0.9"/>
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
