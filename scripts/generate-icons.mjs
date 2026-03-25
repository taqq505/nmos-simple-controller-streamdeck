/**
 * Generate plugin icon PNGs from SVG source using sharp.
 * Run: node scripts/generate-icons.mjs
 */
import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const pluginDir = resolve(root, 'com.taqq505.nmos-simple-controller.sdPlugin');

// ---------------------------------------------------------------------------
// SVG definitions
// ---------------------------------------------------------------------------

// Shared gradient def used in all icons
const gradientDef = `
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1" gradientUnits="objectBoundingBox">
      <stop offset="0"   stop-color="#4ee7ff"/>
      <stop offset="0.5" stop-color="#00c4ff"/>
      <stop offset="1"   stop-color="#2f6bff"/>
    </linearGradient>
  </defs>`;

// Receiver action icon – dark blue bg, circle with down arrow (matches key button)
function receiverIconSvg(size) {
    const s = size;
    const cx = s / 2, cy = s * 0.44;
    const r = s * 0.28;
    const sw = Math.max(1, s * 0.055);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <rect width="${s}" height="${s}" rx="${s*0.14}" fill="#162a4a"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="#1c3460" stroke="#2a5298" stroke-width="${sw}"/>
  <line x1="${cx}" y1="${cy - r*0.65}" x2="${cx}" y2="${cy + r*0.65}"
        stroke="#4d7ec9" stroke-width="${sw*1.1}" stroke-linecap="round"/>
  <polyline points="${cx - r*0.45},${cy + r*0.2} ${cx},${cy + r*0.65} ${cx + r*0.45},${cy + r*0.2}"
        fill="none" stroke="#4d7ec9" stroke-width="${sw*1.1}" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}

// Sender action icon – dark amber bg, circle with up arrow (matches key button)
function senderIconSvg(size) {
    const s = size;
    const cx = s / 2, cy = s * 0.44;
    const r = s * 0.28;
    const sw = Math.max(1, s * 0.055);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <rect width="${s}" height="${s}" rx="${s*0.14}" fill="#2e1500"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="#3d1c00" stroke="#b85c00" stroke-width="${sw}"/>
  <line x1="${cx}" y1="${cy + r*0.65}" x2="${cx}" y2="${cy - r*0.65}"
        stroke="#e07820" stroke-width="${sw*1.1}" stroke-linecap="round"/>
  <polyline points="${cx - r*0.45},${cy - r*0.2} ${cx},${cy - r*0.65} ${cx + r*0.45},${cy - r*0.2}"
        fill="none" stroke="#e07820" stroke-width="${sw*1.1}" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}

// Category / marketplace icon – NMOS node topology (from favicon.svg design)
function pluginIconSvg(size) {
    const s = size;
    const pad = s * 0.17, r = s - pad * 2;
    const cx = s / 2, cy = s / 2;
    const n1x = cx - r*0.27, n1y = cy - r*0.16;
    const n2x = cx + r*0.27, n2y = cy - r*0.16;
    const n3x = cx,          n3y = cy + r*0.27;
    const nr = s * 0.043;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  ${gradientDef}
  <rect x="${pad}" y="${pad}" width="${r}" height="${r}" rx="${s*0.14}"
        fill="none" stroke="url(#g)" stroke-width="${s*0.047}"/>
  <line x1="${n1x}" y1="${n1y}" x2="${n3x}" y2="${n3y}"
        stroke="url(#g)" stroke-width="${s*0.035}" stroke-linecap="round"/>
  <line x1="${n2x}" y1="${n2y}" x2="${n3x}" y2="${n3y}"
        stroke="url(#g)" stroke-width="${s*0.035}" stroke-linecap="round"/>
  <circle cx="${n1x}" cy="${n1y}" r="${nr}" fill="url(#g)"/>
  <circle cx="${n2x}" cy="${n2y}" r="${nr}" fill="url(#g)"/>
  <circle cx="${n3x}" cy="${n3y}" r="${nr*1.1}" fill="url(#g)"/>
</svg>`;
}

// ---------------------------------------------------------------------------
// Output targets
// ---------------------------------------------------------------------------
const targets = [
    // Action icons – Receiver
    { svg: receiverIconSvg(28),  path: 'imgs/actions/receiver/icon.png' },
    { svg: receiverIconSvg(56),  path: 'imgs/actions/receiver/icon@2x.png' },
    // Action icons – Sender
    { svg: senderIconSvg(28),    path: 'imgs/actions/sender/icon.png' },
    { svg: senderIconSvg(56),    path: 'imgs/actions/sender/icon@2x.png' },
    // Category icon
    { svg: pluginIconSvg(28),    path: 'imgs/plugin/category-icon.png' },
    { svg: pluginIconSvg(56),    path: 'imgs/plugin/category-icon@2x.png' },
    // Marketplace
    { svg: pluginIconSvg(144),   path: 'imgs/plugin/marketplace.png' },
    { svg: pluginIconSvg(288),   path: 'imgs/plugin/marketplace@2x.png' },
];

for (const { svg, path: relPath } of targets) {
    const outPath = resolve(pluginDir, relPath);
    mkdirSync(dirname(outPath), { recursive: true });
    await sharp(Buffer.from(svg)).png().toFile(outPath);
    console.log('Generated:', relPath);
}
console.log('Done.');
