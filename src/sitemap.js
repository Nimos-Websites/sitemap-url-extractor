import * as cheerio from 'cheerio';

export const RECORD_KEYS = [
    'url', 'sitemapUrl', 'lastmod', 'changefreq', 'priority', 'discoveredAt', 'error',
];

function localName(tagName) {
    return (tagName ?? '').replace(/^.*:/, '').toLowerCase();
}

function childText($, el, name) {
    const found = $(el).children().toArray().find((c) => localName(c.tagName) === name);
    if (!found) return null;
    const text = $(found).text().replace(/\s+/g, ' ').trim();
    return text || null;
}

function clean(value) {
    if (typeof value !== 'string') return null;
    const trimmed = value.replace(/\s+/g, ' ').trim();
    return trimmed || null;
}

function toPriority(text) {
    if (text === null) return null;
    const n = Number(text);
    return Number.isFinite(n) ? n : null;
}

export function makeRecord({ sitemapUrl, loc = null, lastmod = null, changefreq = null, priority = null, error = null }) {
    return {
        url: clean(loc),
        sitemapUrl,
        lastmod: clean(lastmod),
        changefreq: clean(changefreq),
        priority: error ? null : toPriority(priority),
        discoveredAt: new Date().toISOString(),
        error,
    };
}

export function matchesGlob(url, pattern) {
    const escaped = pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*/g, '\u0000')
        .replace(/\*/g, '[^/]*')
        .replace(/\?/g, '.')
        .replace(/\u0000/g, '.*');
    try {
        return new RegExp(`^${escaped}$`).test(url);
    } catch {
        return false;
    }
}

export function passesFilters(url, includeGlobs = [], excludeGlobs = []) {
    for (const pattern of excludeGlobs) {
        if (matchesGlob(url, pattern)) return false;
    }
    if (!includeGlobs || includeGlobs.length === 0) return true;
    return includeGlobs.some((pattern) => matchesGlob(url, pattern));
}

const FETCH_RETRIES = 2;

async function fetchText(url) {
    let lastError = 'request failed';
    for (let attempt = 0; attempt <= FETCH_RETRIES; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 30_000);
        try {
            const res = await fetch(url, { redirect: 'follow', signal: controller.signal });
            if (!res.ok) {
                lastError = `HTTP ${res.status}`;
            } else {
                return { text: await res.text(), finalUrl: res.url || url };
            }
        } catch (err) {
            lastError = err?.name === 'AbortError' ? 'timeout after 30s' : err?.message ?? 'request failed';
        } finally {
            clearTimeout(timer);
        }
    }
    throw new Error(lastError);
}

/**
 * Parse one fetched sitemap document.
 * Returns { kind: 'urlset' | 'sitemapindex' | null, urls: [record], childSitemaps: [string] }.
 */
export function parseSitemap(xml, sitemapUrl, { includeGlobs = [], excludeGlobs = [] } = {}) {
    let $;
    try {
        $ = cheerio.load(xml, { xmlMode: true });
    } catch (err) {
        return { kind: null, urls: [], childSitemaps: [], error: `unparseable XML: ${err.message}` };
    }

    const root = $.root().children().toArray().find((el) => ['urlset', 'sitemapindex'].includes(localName(el.tagName)));
    if (!root) {
        return { kind: null, urls: [], childSitemaps: [], error: 'no <urlset> or <sitemapindex> root element — not a sitemap' };
    }

    const kind = localName(root.tagName);
    const urls = [];
    const childSitemaps = [];

    if (kind === 'urlset') {
        $(root).children().toArray().forEach((entry) => {
            if (localName(entry.tagName) !== 'url') return;
            const loc = childText($, entry, 'loc');
            let error = null;
            if (loc === null) error = '<url> entry without a <loc>';
            else if (!/^https?:\/\//i.test(loc)) error = `<loc> is not an http(s) URL: ${loc}`;
            if (!error && !passesFilters(loc, includeGlobs, excludeGlobs)) return;
            urls.push(makeRecord({
                sitemapUrl,
                loc,
                lastmod: childText($, entry, 'lastmod'),
                changefreq: childText($, entry, 'changefreq'),
                priority: childText($, entry, 'priority'),
                error,
            }));
        });
    } else {
        $(root).children().toArray().forEach((entry) => {
            if (localName(entry.tagName) !== 'sitemap') return;
            const loc = childText($, entry, 'loc');
            if (loc && /^https?:\/\//i.test(loc)) childSitemaps.push(loc);
        });
    }

    return { kind, urls, childSitemaps, error: null };
}

export async function collectUrls({ startUrls, followIndexes = true, maxUrls = 100, includeGlobs = [], excludeGlobs = [], onRecord }) {
    const queue = startUrls.map((source) => (typeof source === 'string' ? source : source.url));
    const visited = new Set();
    const failedSitemaps = [];
    let processed = 0;
    let count = 0;
    const MAX_INDEX_DEPTH = 5;
    let depth = 0;

    while (queue.length > 0 && count < maxUrls) {
        const sitemapUrl = queue.shift();
        if (visited.has(sitemapUrl)) continue;
        visited.add(sitemapUrl);
        processed++;

        let parsed;
        try {
            const { text, finalUrl } = await fetchText(sitemapUrl);
            parsed = parseSitemap(text, finalUrl, { includeGlobs, excludeGlobs });
            visited.add(finalUrl);
        } catch (err) {
            failedSitemaps.push({ url: sitemapUrl, error: err.message });
            continue;
        }

        if (parsed.error) {
            failedSitemaps.push({ url: sitemapUrl, error: parsed.error });
            continue;
        }

        if (parsed.kind === 'sitemapindex') {
            depth++;
            if (followIndexes && depth <= MAX_INDEX_DEPTH) {
                for (const child of parsed.childSitemaps) {
                    if (!visited.has(child)) queue.push(child);
                }
            }
            continue;
        }

        for (const record of parsed.urls) {
            if (count >= maxUrls) break;
            count++;
            await onRecord?.(record);
        }
    }

    return { count, truncated: count >= maxUrls && (queue.length > 0 || count > 0), processed, failedSitemaps };
}
