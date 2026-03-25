/**
 * SVG key image generators for Stream Deck buttons.
 * Title text is rendered inside the SVG for precise layout control.
 * Pass the title string (use "\n" for two lines) to embed it at the bottom of the button.
 */

function toDataUrl(svg: string): string {
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

function escapeXml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function titleSvg(title: string): string {
    const lines = title.split('\n').filter(Boolean);
    if (lines.length === 0) return '';
    if (lines.length === 1) {
        return `<text x="36" y="62" font-family="Arial,sans-serif" font-size="10"
        fill="#d0d0d0" text-anchor="middle">${escapeXml(lines[0])}</text>`;
    }
    return `<text x="36" y="52" font-family="Arial,sans-serif" font-size="10"
        fill="#d0d0d0" text-anchor="middle">${escapeXml(lines[0])}</text>
<text x="36" y="65" font-family="Arial,sans-serif" font-size="10"
        fill="#d0d0d0" text-anchor="middle">${escapeXml(lines[1])}</text>`;
}

/** Receiver button – unselected (dark blue) */
export function receiverImage(title = ""): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72">
  <rect width="72" height="72" rx="6" fill="#162a4a"/>
  <circle cx="36" cy="26" r="15" fill="#1c3460" stroke="#2a5298" stroke-width="1.5"/>
  <path d="M36 17 L36 34 M28 27 L36 35 L44 27"
        stroke="#4d7ec9" stroke-width="2.5" fill="none"
        stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="3" y="3" width="22" height="13" rx="3" fill="#1e3b6e"/>
  <text x="14" y="13" font-family="Arial,sans-serif" font-size="8" font-weight="bold"
        fill="#7aa3d9" text-anchor="middle">RX</text>
  ${titleSvg(title)}
</svg>`;
    return toDataUrl(svg);
}

/** Receiver button – selected (bright blue with border) */
export function receiverSelectedImage(title = ""): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72">
  <rect width="72" height="72" rx="6" fill="#0d3b8c"/>
  <rect x="2" y="2" width="68" height="68" rx="5" fill="none"
        stroke="#3d9eff" stroke-width="2.5"/>
  <circle cx="36" cy="26" r="15" fill="#0f48a8" stroke="#3d9eff" stroke-width="1.5"/>
  <path d="M36 17 L36 34 M28 27 L36 35 L44 27"
        stroke="#80c6ff" stroke-width="2.5" fill="none"
        stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="3" y="3" width="22" height="13" rx="3" fill="#1050c0"/>
  <text x="14" y="13" font-family="Arial,sans-serif" font-size="8" font-weight="bold"
        fill="#b0daff" text-anchor="middle">RX</text>
  ${titleSvg(title)}
</svg>`;
    return toDataUrl(svg);
}

/** Sender (TAKE) button – receiver mode: selector (amber/orange, dashed border = dynamic target) */
export function senderImage(title = ""): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72">
  <rect width="72" height="72" rx="6" fill="#2e1500"/>
  <rect x="2" y="2" width="68" height="68" rx="5" fill="none"
        stroke="#b85c00" stroke-width="1.5" stroke-dasharray="5,3"/>
  <circle cx="36" cy="26" r="15" fill="#3d1c00" stroke="#b85c00" stroke-width="1.5"/>
  <path d="M36 35 L36 18 M28 25 L36 17 L44 25"
        stroke="#e07820" stroke-width="2.5" fill="none"
        stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="3" y="3" width="22" height="13" rx="3" fill="#5c2e00"/>
  <text x="14" y="13" font-family="Arial,sans-serif" font-size="8" font-weight="bold"
        fill="#f0a050" text-anchor="middle">TX</text>
  ${titleSvg(title)}
</svg>`;
    return toDataUrl(svg);
}

/** Sender selector – flash on TAKE success (bright amber) */
export function senderFlashImage(title = ""): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72">
  <rect width="72" height="72" rx="6" fill="#7a3800"/>
  <rect x="2" y="2" width="68" height="68" rx="5" fill="none"
        stroke="#ffaa44" stroke-width="2.5"/>
  <circle cx="36" cy="26" r="15" fill="#8c4200" stroke="#ffaa44" stroke-width="1.5"/>
  <path d="M36 35 L36 18 M28 25 L36 17 L44 25"
        stroke="#ffcc77" stroke-width="2.5" fill="none"
        stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="3" y="3" width="22" height="13" rx="3" fill="#a85000"/>
  <text x="14" y="13" font-family="Arial,sans-serif" font-size="8" font-weight="bold"
        fill="#ffdd99" text-anchor="middle">TX</text>
  ${titleSvg(title)}
</svg>`;
    return toDataUrl(svg);
}

/** Sender selector – error state (red border) */
export function senderErrorImage(title = ""): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72">
  <rect width="72" height="72" rx="6" fill="#2e1500"/>
  <rect x="2" y="2" width="68" height="68" rx="5" fill="none"
        stroke="#ff3333" stroke-width="2.5"/>
  <circle cx="36" cy="26" r="15" fill="#3d1c00" stroke="#ff3333" stroke-width="1.5"/>
  <path d="M36 35 L36 18 M28 25 L36 17 L44 25"
        stroke="#e07820" stroke-width="2.5" fill="none"
        stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="3" y="3" width="22" height="13" rx="3" fill="#5c2e00"/>
  <text x="14" y="13" font-family="Arial,sans-serif" font-size="8" font-weight="bold"
        fill="#f0a050" text-anchor="middle">TX</text>
  ${titleSvg(title)}
</svg>`;
    return toDataUrl(svg);
}

/** Sender fixed – error state (red border) */
export function senderFixedErrorImage(title = ""): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72">
  <rect width="72" height="72" rx="6" fill="#0e2a14"/>
  <rect x="2" y="2" width="68" height="68" rx="5" fill="none"
        stroke="#ff3333" stroke-width="2.5"/>
  <circle cx="36" cy="26" r="15" fill="#153520" stroke="#ff3333" stroke-width="1.5"/>
  <path d="M29 20 L22 26 L29 32 M22 26 L50 26 M43 20 L50 26 L43 32"
        stroke="#4dbb60" stroke-width="2.5" fill="none"
        stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="3" y="3" width="34" height="13" rx="3" fill="#1a4a22"/>
  <text x="20" y="13" font-family="Arial,sans-serif" font-size="8" font-weight="bold"
        fill="#88dd99" text-anchor="middle">static</text>
  ${titleSvg(title)}
</svg>`;
    return toDataUrl(svg);
}

/** Sender fixed – flash on TAKE success (bright green) */
export function senderFixedFlashImage(title = ""): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72">
  <rect width="72" height="72" rx="6" fill="#1a5c2e"/>
  <rect x="2" y="2" width="68" height="68" rx="5" fill="none"
        stroke="#66dd88" stroke-width="2.5"/>
  <circle cx="36" cy="26" r="15" fill="#1f6e36" stroke="#66dd88" stroke-width="1.5"/>
  <path d="M29 20 L22 26 L29 32 M22 26 L50 26 M43 20 L50 26 L43 32"
        stroke="#99ffbb" stroke-width="2.5" fill="none"
        stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="3" y="3" width="34" height="13" rx="3" fill="#246b38"/>
  <text x="20" y="13" font-family="Arial,sans-serif" font-size="8" font-weight="bold"
        fill="#aaffcc" text-anchor="middle">static</text>
  ${titleSvg(title)}
</svg>`;
    return toDataUrl(svg);
}

/** Sender (TAKE) button – receiver mode: fixed (BCC/manual, solid border = fixed target) – green */
export function senderFixedImage(title = ""): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72">
  <rect width="72" height="72" rx="6" fill="#0e2a14"/>
  <rect x="2" y="2" width="68" height="68" rx="5" fill="none"
        stroke="#2d7a3a" stroke-width="1.5"/>
  <circle cx="36" cy="26" r="15" fill="#153520" stroke="#2d7a3a" stroke-width="1.5"/>
  <path d="M29 20 L22 26 L29 32 M22 26 L50 26 M43 20 L50 26 L43 32"
        stroke="#4dbb60" stroke-width="2.5" fill="none"
        stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="3" y="3" width="34" height="13" rx="3" fill="#1a4a22"/>
  <text x="20" y="13" font-family="Arial,sans-serif" font-size="8" font-weight="bold"
        fill="#88dd99" text-anchor="middle">static</text>
  ${titleSvg(title)}
</svg>`;
    return toDataUrl(svg);
}
