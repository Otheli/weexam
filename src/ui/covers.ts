// Sampul topik: pola SVG generatif (offline, tanpa aset gambar). Pengguna juga bisa mengunggah gambar sendiri.
export const PALETTE = ['#2440D9', '#0E8579', '#B26A00', '#C23B2E', '#7A3FD1', '#0A7EA4', '#3C8A2E', '#C2417A'];

export const PRESETS = ['garis', 'titik', 'cincin', 'gelombang', 'kisi', 'bukit'] as const;

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + (amt > 0 ? (255 - v) * amt : v * amt))));
  const r = f(n >> 16), g = f((n >> 8) & 255), b = f(n & 255);
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

export function presetSvg(id: string, color: string): string {
  const dark = shade(color, -0.25);
  const light = shade(color, 0.35);
  const lighter = shade(color, 0.6);
  let art = '';
  switch (id) {
    case 'titik':
      art = Array.from({ length: 9 }, (_, r) => Array.from({ length: 16 }, (_, c) => `<circle cx="${c * 28 + (r % 2) * 14}" cy="${r * 26}" r="${2 + ((r * 3 + c * 5) % 5) * 0.9}" fill="${lighter}" opacity=".55"/>`).join('')).join('');
      break;
    case 'cincin':
      art = [150, 112, 76, 42].map((r, i) => `<circle cx="330" cy="40" r="${r}" fill="none" stroke="${light}" stroke-width="${i === 3 ? 10 : 2.5}" opacity="${0.35 + i * 0.1}"/>`).join('') + `<circle cx="60" cy="210" r="70" fill="${dark}" opacity=".35"/>`;
      break;
    case 'gelombang':
      art = [0, 1, 2, 3].map((i) => `<path d="M0 ${110 + i * 34} C 80 ${70 + i * 34}, 140 ${160 + i * 34}, 220 ${110 + i * 34} S 360 ${70 + i * 34}, 440 ${120 + i * 34} V240 H0Z" fill="${i % 2 ? dark : light}" opacity="${0.22 + i * 0.08}"/>`).join('');
      break;
    case 'kisi':
      art = Array.from({ length: 12 }, (_, i) => `<path d="M${i * 40} 0V240" stroke="${lighter}" stroke-width="1" opacity=".35"/>`).join('') + Array.from({ length: 7 }, (_, i) => `<path d="M0 ${i * 40}H440" stroke="${lighter}" stroke-width="1" opacity=".35"/>`).join('') + `<rect x="240" y="80" width="80" height="80" fill="${lighter}" opacity=".35"/><rect x="120" y="40" width="40" height="40" fill="${dark}" opacity=".45"/>`;
      break;
    case 'bukit':
      art = `<path d="M0 190 L90 110 L170 170 L270 70 L360 160 L440 100 V240 H0Z" fill="${dark}" opacity=".45"/><path d="M0 220 L110 150 L210 205 L320 130 L440 200 V240 H0Z" fill="${light}" opacity=".3"/><circle cx="350" cy="55" r="22" fill="${lighter}" opacity=".7"/>`;
      break;
    default: // garis
      art = Array.from({ length: 16 }, (_, i) => `<path d="M${-60 + i * 36} 260 L${120 + i * 36} -20" stroke="${i % 3 === 0 ? lighter : light}" stroke-width="${i % 3 === 0 ? 5 : 2}" opacity="${i % 3 === 0 ? 0.35 : 0.3}"/>`).join('');
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 440 240" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="${dark}"/></linearGradient></defs><rect width="440" height="240" fill="url(#g)"/>${art}</svg>`;
}

export function presetUrl(id: string, color: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(presetSvg(id, color))}`;
}
