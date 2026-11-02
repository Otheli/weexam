// Membuat ikon PNG + .ico dari SVG memakai Chromium lokal (tanpa dependensi).
const fs = require('fs');
const path = require('path');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const out = path.join(__dirname, '..', 'public', 'icons');
const mark = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
<rect width="512" height="512" fill="#2440D9"/>
<g transform="translate(${pad} ${pad}) scale(${(512 - pad * 2) / 512})">
<path d="M112 184 L184 344 L256 216 L328 344 L400 184" fill="none" stroke="#fff" stroke-width="44" stroke-linecap="round" stroke-linejoin="round"/></g></svg>`;
const rounded = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512"><rect width="512" height="512" rx="112" fill="#2440D9"/>
<path d="M112 184 L184 344 L256 216 L328 344 L400 184" fill="none" stroke="#fff" stroke-width="44" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
(async () => {
  const b = await chromium.launch();
  const shot = async (svg, size) => {
    const p = await b.newPage({ viewport: { width: size, height: size } });
    await p.setContent(`<style>html,body{margin:0;background:transparent}svg{width:${size}px;height:${size}px;display:block}</style>${svg}`);
    const buf = await p.screenshot({ omitBackground: true, type: 'png' });
    await p.close();
    return buf;
  };
  fs.writeFileSync(path.join(out, 'icon-512.png'), await shot(rounded, 512));
  fs.writeFileSync(path.join(out, 'icon-192.png'), await shot(rounded, 192));
  fs.writeFileSync(path.join(out, 'icon-maskable-512.png'), await shot(mark(70), 512));
  const sizes = [256, 64, 48, 32, 16];
  const pngs = [];
  for (const s of sizes) pngs.push(await shot(rounded, s));
  const head = Buffer.alloc(6); head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
  let offset = 6 + 16 * sizes.length;
  const dirs = sizes.map((s, i) => {
    const d = Buffer.alloc(16);
    d.writeUInt8(s === 256 ? 0 : s, 0); d.writeUInt8(s === 256 ? 0 : s, 1); d.writeUInt8(0, 2); d.writeUInt8(0, 3);
    d.writeUInt16LE(1, 4); d.writeUInt16LE(32, 6); d.writeUInt32LE(pngs[i].length, 8); d.writeUInt32LE(offset, 12);
    offset += pngs[i].length; return d;
  });
  fs.writeFileSync(path.join(out, 'weexam.ico'), Buffer.concat([head, ...dirs, ...pngs]));
  await b.close();
  console.log('ikon dibuat');
})();
