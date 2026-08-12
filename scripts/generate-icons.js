#!/usr/bin/env node
/**
 * Generates the app's launcher/splash/favicon artwork.
 *
 * The mark is five ascending bars — the app's whole premise, values ordered from
 * the one that matters least to the one that matters most, drawn in one glyph.
 *
 * Committed as a script rather than as four opaque binaries so the artwork can be
 * re-derived: change PALETTE or BARS below and re-run `node scripts/generate-icons.js`.
 * There is no image library in the toolchain, so this writes PNGs directly —
 * a truecolour-with-alpha PNG is a zlib stream of filter-0 scanlines plus three
 * CRC-tagged chunks, which is less code than pulling in a dependency for it.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ============ PNG encoding ============

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

/** Encode an RGBA pixel buffer (width * height * 4 bytes) as a PNG. */
function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: truecolour with alpha
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  // One leading filter byte (0 = None) per scanline.
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 4);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ============ Drawing ============

// Indigo to violet, the same ramp the charts use for group tints.
const PALETTE = { from: [79, 107, 237], to: [124, 77, 255] };

// Relative heights of the five bars, lowest-priority first.
const BARS = [0.34, 0.50, 0.66, 0.82, 1.0];

/**
 * Coverage of a pixel by a rounded rectangle, sampled 3x3 for anti-aliasing.
 * Returns 0..1.
 */
function roundedRectCoverage(px, py, x0, y0, x1, y1, radius) {
  let hits = 0;
  for (let sy = 0; sy < 3; sy++) {
    for (let sx = 0; sx < 3; sx++) {
      const x = px + (sx + 0.5) / 3;
      const y = py + (sy + 0.5) / 3;
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      // Distance to the nearest corner centre, clamped into the inner box.
      const cx = Math.min(Math.max(x, x0 + radius), x1 - radius);
      const cy = Math.min(Math.max(y, y0 + radius), y1 - radius);
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= radius * radius) hits++;
    }
  }
  return hits / 9;
}

/**
 * @param {number} size            square edge in pixels
 * @param {boolean} withBackground fill the gradient, or leave the field transparent
 * @param {number} inset           fraction of the edge left clear around the glyph
 */
function drawMark(size, withBackground, inset) {
  const rgba = Buffer.alloc(size * size * 4);

  if (withBackground) {
    for (let y = 0; y < size; y++) {
      const t = y / (size - 1);
      const r = Math.round(PALETTE.from[0] + (PALETTE.to[0] - PALETTE.from[0]) * t);
      const g = Math.round(PALETTE.from[1] + (PALETTE.to[1] - PALETTE.from[1]) * t);
      const b = Math.round(PALETTE.from[2] + (PALETTE.to[2] - PALETTE.from[2]) * t);
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        rgba[i] = r;
        rgba[i + 1] = g;
        rgba[i + 2] = b;
        rgba[i + 3] = 255;
      }
    }
  }

  // Glyph geometry: five bars sharing a baseline, inside the inset field.
  const field = size * (1 - 2 * inset);
  const originX = size * inset;
  const baseline = size * inset + field;
  const gap = field * 0.06;
  const barWidth = (field - gap * (BARS.length - 1)) / BARS.length;
  const radius = barWidth * 0.4;

  // On a transparent field the glyph has to carry its own colour; on the
  // gradient it is knocked out in white.
  const glyph = withBackground ? [255, 255, 255] : PALETTE.from;

  BARS.forEach((h, index) => {
    const x0 = originX + index * (barWidth + gap);
    const x1 = x0 + barWidth;
    const y1 = baseline;
    const y0 = baseline - field * h;
    // The tallest bar is fully opaque; the shortest is clearly present but
    // reads as "less", which is the ranking the mark is about.
    const alpha = withBackground ? 0.55 + 0.45 * (index / (BARS.length - 1)) : 1;

    const pxMin = Math.max(0, Math.floor(x0));
    const pxMax = Math.min(size - 1, Math.ceil(x1));
    const pyMin = Math.max(0, Math.floor(y0));
    const pyMax = Math.min(size - 1, Math.ceil(y1));

    for (let y = pyMin; y <= pyMax; y++) {
      for (let x = pxMin; x <= pxMax; x++) {
        const coverage = roundedRectCoverage(x, y, x0, y0, x1, y1, radius) * alpha;
        if (coverage <= 0) continue;
        const i = (y * size + x) * 4;
        const dstA = rgba[i + 3] / 255;
        const outA = coverage + dstA * (1 - coverage);
        for (let c = 0; c < 3; c++) {
          rgba[i + c] = Math.round(
            (glyph[c] * coverage + rgba[i + c] * dstA * (1 - coverage)) / (outA || 1),
          );
        }
        rgba[i + 3] = Math.round(outA * 255);
      }
    }
  });

  return encodePng(size, size, rgba);
}

const ASSETS = path.join(__dirname, '..', 'assets');

const OUTPUTS = [
  // Full-bleed launcher icon.
  { file: 'icon.png', size: 1024, background: true, inset: 0.22 },
  // Android adaptive foreground: the system crops to a circle/squircle, so the
  // glyph sits well inside the safe zone and the field stays transparent.
  { file: 'adaptive-icon.png', size: 1024, background: false, inset: 0.3 },
  // Splash: transparent, centred over the splash background colour.
  { file: 'splash-icon.png', size: 512, background: false, inset: 0.24 },
  // Browser tab.
  { file: 'favicon.png', size: 96, background: true, inset: 0.2 },
];

fs.mkdirSync(ASSETS, { recursive: true });
for (const { file, size, background, inset } of OUTPUTS) {
  const png = drawMark(size, background, inset);
  fs.writeFileSync(path.join(ASSETS, file), png);
  console.log(`✓ assets/${file} (${size}x${size}, ${png.length} bytes)`);
}
