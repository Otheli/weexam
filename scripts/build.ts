// Build tanpa dependensi: Bun bundler + inlining font. Hasil:
//   dist/                      -> situs PWA (hosting statis / localhost)
//   dist/Weexam-Offline.html   -> satu berkas, jalan dari file:// (Windows)
//   dist/downloads/Weexam-Windows.zip
import { mkdirSync, readFileSync, writeFileSync, rmSync, cpSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const root = new URL('..', import.meta.url).pathname;
const dist = root + 'dist/';
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist + 'downloads', { recursive: true });
mkdirSync(dist + 'icons', { recursive: true });

const res = await Bun.build({ entrypoints: [root + 'src/main.ts'], target: 'browser', minify: true, format: 'iife', sourcemap: 'none' });
if (!res.success) {
  console.error(res.logs.join('\n'));
  process.exit(1);
}
const js = await res.outputs[0].text();

let css = readFileSync(root + 'src/styles.css', 'utf8');
for (const w of ['Regular', 'Medium', 'SemiBold']) {
  const b64 = readFileSync(root + `src/fonts/Inter-${w}.woff`).toString('base64');
  css = css.replace(`__FONT_${w}__`, `data:font/woff;base64,${b64}`);
}
css = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\n\s*/g, '\n');

const version = createHash('sha1').update(js + css).digest('hex').slice(0, 10);
const head = (inline: boolean) => `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#ffffff">
<meta name="color-scheme" content="light">
<meta name="description" content="Weexam: platform ujian mingguan untuk topik yang kamu dalami.">
<title>Weexam</title>
<link rel="icon" href="${inline ? 'data:image/png;base64,' + (existsSync(root + 'public/icons/icon-192.png') ? readFileSync(root + 'public/icons/icon-192.png').toString('base64') : '') : 'icons/icon-192.png'}">
${inline ? '' : '<link rel="manifest" href="manifest.webmanifest">\n<link rel="apple-touch-icon" href="icons/icon-192.png">'}
${inline ? `<style>${css}</style>` : '<link rel="stylesheet" href="app.css">'}
</head>
<body><noscript>Weexam membutuhkan JavaScript.</noscript>
${inline ? `<script>${js.replace(/<\/script/gi, '<\\/script')}</script>` : '<script src="app.js" defer></script>'}
</body></html>`;

writeFileSync(dist + 'index.html', head(false));
writeFileSync(dist + 'app.js', js);
writeFileSync(dist + 'app.css', css);
writeFileSync(dist + 'Weexam-Offline.html', head(true));

// public/: manifest, service worker, ikon
cpSync(root + 'public', dist, { recursive: true });
const sw = readFileSync(dist + 'sw.js', 'utf8').replace('__VERSION__', version);
writeFileSync(dist + 'sw.js', sw);

// Paket Windows: peluncur + versi offline + ikon
const pkg = root + '.pkg/Weexam/';
rmSync(root + '.pkg', { recursive: true, force: true });
mkdirSync(pkg, { recursive: true });
cpSync(dist + 'Weexam-Offline.html', pkg + 'Weexam-Offline.html');
cpSync(root + 'windows/Pasang-Weexam-Windows.bat', pkg + 'Pasang-Weexam-Windows.bat');
cpSync(root + 'windows/Pasang-Weexam.ps1', pkg + 'Pasang-Weexam.ps1');
if (existsSync(root + 'public/icons/weexam.ico')) cpSync(root + 'public/icons/weexam.ico', pkg + 'weexam.ico');
cpSync(root + 'windows/BACA-SAYA.txt', pkg + 'BACA-SAYA.txt');
const z = spawnSync('python3', ['-c', `
import zipfile,os,sys
src='${pkg}'; out='${dist}downloads/Weexam-Windows.zip'
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
    for f in sorted(os.listdir(src)):
        p=os.path.join(src,f)
        data=open(p,'rb').read()
        if f.endswith(('.bat','.txt','.ps1')): data=data.replace(b'\\r\\n',b'\\n').replace(b'\\n',b'\\r\\n')
        z.writestr('Weexam/'+f,data)
`]);
if (z.status !== 0) console.error(z.stderr.toString());
rmSync(root + '.pkg', { recursive: true, force: true });

console.log(`build ok v${version}  js=${(js.length / 1024).toFixed(0)}KB css=${(css.length / 1024).toFixed(0)}KB offline=${(readFileSync(dist + 'Weexam-Offline.html').length / 1024).toFixed(0)}KB`);
