import { Actor } from 'apify';
import { Dataset } from 'crawlee';
import { collectUrls } from './sitemap.js';

await Actor.init();

const {
    startUrls,
    followIndexes = true,
    maxUrls = 100,
    includeGlobs = [],
    excludeGlobs = [],
} = (await Actor.getInput()) ?? {};

if (!Array.isArray(startUrls) || startUrls.length === 0) {
    throw new Error('Input must contain a non-empty "startUrls" array.');
}

const summary = await collectUrls({
    startUrls,
    followIndexes,
    maxUrls,
    includeGlobs,
    excludeGlobs,
    onRecord: (record) => Dataset.pushData(record),
});

const items = await Dataset.getData();
await Actor.setValue('OUTPUT', {
    count: items.total,
    truncated: summary.truncated,
    sitemapsProcessed: summary.processed,
    failedSitemaps: summary.failedSitemaps,
});

await Actor.exit();
