import { esc } from './ui/dom';
import type { ReviewItem } from './types';

export interface ExportInput {
  title: string;
  topic: string;
  meta: string;
  scoreLabel?: string;
  review: ReviewItem[];
  files: { name: string; kind?: string }[];
  sections: { heading: string; text: string }[];
}

/** Dokumen HTML mandiri (bisa dibuka offline dan dicetak/disimpan PDF dari peramban). */
export function reviewHtml(d: ExportInput): string {
  const q = d.review
    .map(
      (r, i) => `<section class="q ${r.earned >= r.max ? 'ok' : 'bad'}"><h3>${i + 1}. ${esc(r.text)} <span>${r.earned}/${r.max}</span></h3>
${r.options?.length ? `<ol type="A">${r.options.map((o) => `<li>${esc(o)}</li>`).join('')}</ol>` : ''}
<p><b>Jawabanmu:</b> ${esc(r.mine).replace(/\n/g, '<br>')}</p><p><b>Kunci:</b> ${esc(r.key || '-').replace(/\n/g, '<br>')}</p></section>`,
    )
    .join('\n');
  const secs = d.sections.filter((s) => s.text.trim()).map((s) => `<h2>${esc(s.heading)}</h2><p>${esc(s.text).replace(/\n/g, '<br>')}</p>`).join('\n');
  const files = d.files.length ? `<h2>Berkas</h2><ul>${d.files.map((f) => `<li>${esc(f.name)}${f.kind ? ` <i>(${esc(f.kind)})</i>` : ''}</li>`).join('')}</ul>` : '';
  return `<!doctype html><html lang="id"><meta charset="utf-8"><title>${esc(d.title)}</title>
<style>body{font:15px/1.6 system-ui,Segoe UI,Roboto,sans-serif;max-width:760px;margin:32px auto;padding:0 20px;color:#10151d}
h1{margin:0 0 4px}h2{margin-top:28px;border-bottom:1px solid #e2e5eb;padding-bottom:4px}.m{color:#7a8394}
.q{border:1px solid #e2e5eb;border-radius:10px;padding:10px 16px;margin:12px 0;break-inside:avoid}.q.bad{border-color:#ebc4c0}
.q h3{font-size:16px;display:flex;justify-content:space-between;gap:12px}.q h3 span{white-space:nowrap}ol{margin:4px 0 8px}</style>
<h1>${esc(d.title)}</h1><p class="m">${esc(d.topic)} · ${esc(d.meta)}${d.scoreLabel ? ` · Nilai ${esc(d.scoreLabel)}` : ''}</p>
${q ? `<h2>Soal dan jawaban</h2>${q}` : ''}${secs}${files}<p class="m">Diekspor dari Weexam ${new Date().toLocaleString('id-ID')}</p></html>`;
}
