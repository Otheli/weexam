import type { Page } from '../router';
import { dashboardPage } from './dashboard';
import { evaluasiPage } from './evaluasi';
import { pengaturanPage } from './pengaturan';
import { editorPage, persiapanPage } from './persiapan';
import { topicPage } from './topic';
import { kerjakanPage, koreksiPage, tinjauPage, ujianPage } from './ujian';

export function resolvePage(parts: string[]): Page | null {
  const [a, b, c] = parts;
  switch (a) {
    case 'dashboard':
      return { ...dashboardPage };
    case 'topik':
      return b ? topicPage(b) : null;
    case 'evaluasi':
      return evaluasiPage(b);
    case 'persiapan':
      return b === 'ujian' && c ? editorPage(c) : { ...persiapanPage };
    case 'ujian':
      if (b === 'kerjakan' && c) return kerjakanPage(c);
      if (b === 'koreksi' && c) return koreksiPage(c);
      if (b === 'tinjau' && c) return tinjauPage(c);
      return { ...ujianPage };
    case 'pengaturan':
      return { ...pengaturanPage };
    default:
      return null;
  }
}
