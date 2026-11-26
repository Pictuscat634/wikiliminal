import { loadJSON, saveJSON } from '../systems/storage';
import { WIKI_LANG } from '../config';

export interface WikiArticle {
  title: string;
  pageId: number;
  revisionId: number;
  extract: string;       // short plain-text summary
  categories: string[];  // category names, without the "Category:" prefix
  links: string[];       // a sample of the article's own outgoing links (main namespace only)
  offline: boolean;      // true if this came from the built-in fallback, not a live fetch
}

/**
 * Tiny built-in dataset so the game stays playable with no network, or if a browser
 * blocks the cross-origin request. Mirrors the chain given in the spec itself:
 * 深海 -> 海洋学. This is a fallback, not a substitute for real article data.
 */
const OFFLINE_FALLBACK: Record<string, Omit<WikiArticle, 'offline'>> = {
  '深海': {
    title: '深海', pageId: 1, revisionId: 1,
    extract: '深海は、一般的に水深200メートルより深い海域を指す。太陽光がほとんど届かず、独特の生態系が存在する。',
    categories: ['海洋学', '深海生物学'],
    links: ['海洋学', '深海魚', '熱水噴出孔'],
  },
  '海洋学': {
    title: '海洋学', pageId: 2, revisionId: 1,
    extract: '海洋学は、海洋に関する様々な現象を研究する学問分野である。',
    categories: ['地球科学', '海洋学'],
    links: ['深海', '潜水艇', '海流'],
  },
};

function stubArticle(title: string): WikiArticle {
  return { title, pageId: 0, revisionId: 0, extract: '', categories: [], links: [], offline: true };
}

const CACHE_VERSION = 1;
interface Cache { version: number; entries: Record<string, Omit<WikiArticle, 'offline'>> }
const cacheKey = (lang: string) => `wiki:${lang}`;

function readCache(lang: string): Cache {
  return loadJSON<Cache>(cacheKey(lang), { version: CACHE_VERSION, entries: {} });
}
function writeCacheEntry(lang: string, article: Omit<WikiArticle, 'offline'>): void {
  const cache = readCache(lang);
  cache.entries[article.title] = article;
  saveJSON(cacheKey(lang), cache);
}

/**
 * Fetches one article's summary, categories and outgoing links. Tries the local cache
 * first, then the live Wikipedia REST + action APIs (both CORS-enabled via origin=*),
 * then the offline fallback above, so a missing network or a blocked request never
 * breaks Level generation - it just falls back to thinner (or stub) data.
 *
 * These network calls run in the player's browser, not in the sandbox this was written
 * in (which has no network access), so they have not been exercised against the live
 * API yet. Check the browser console on first run for CORS or shape-mismatch errors.
 */
export async function fetchArticle(title: string, lang: string = WIKI_LANG): Promise<WikiArticle> {
  const cached = readCache(lang).entries[title];
  if (cached) return { ...cached, offline: false };

  try {
    const base = `https://${lang}.wikipedia.org`;
    const summaryRes = await fetch(`${base}/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
    if (!summaryRes.ok) throw new Error(`summary ${summaryRes.status}`);
    const summary = await summaryRes.json();

    const qs = new URLSearchParams({
      action: 'query', format: 'json', origin: '*', redirects: '1',
      prop: 'categories|links', pllimit: '20', plnamespace: '0', cllimit: '20', titles: title,
    });
    const linksRes = await fetch(`${base}/w/api.php?${qs.toString()}`);
    const linksData = linksRes.ok ? await linksRes.json() : null;
    const pages = linksData?.query?.pages as Record<string, { categories?: { title: string }[]; links?: { title: string }[] }> | undefined;
    const page = pages ? Object.values(pages)[0] : undefined;

    const article: Omit<WikiArticle, 'offline'> = {
      title: summary.title ?? title,
      pageId: Number(summary.pageid) || 0,
      revisionId: Number(summary.revision) || 0,
      extract: summary.extract ?? '',
      categories: (page?.categories ?? []).map(c => c.title.replace(/^Category:/, '')),
      links: (page?.links ?? []).map(l => l.title),
    };
    writeCacheEntry(lang, article);
    return { ...article, offline: false };
  } catch {
    const fallback = OFFLINE_FALLBACK[title];
    if (fallback) return { ...fallback, offline: true };
    return stubArticle(title); // unknown title, no network: still generate *something*, just bare
  }
}
