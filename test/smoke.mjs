import { collectUrls, RECORD_KEYS } from '../src/sitemap.js';

const START_URLS = process.argv.slice(2).length > 0
    ? process.argv.slice(2)
    : ['https://example.com/sitemap.xml', 'https://apify.com/sitemap.xml'];

const EXPECTED_KEYS = [...RECORD_KEYS].sort();

async function runSmokeTest() {
    const records = [];
    let failed = false;

    const summary = await collectUrls({
        startUrls: START_URLS,
        followIndexes: true,
        maxUrls: 10,
        includeGlobs: [],
        excludeGlobs: [],
        onRecord: (record) => records.push(record),
    });

    for (const r of records) {
        const keys = Object.keys(r).sort();
        if (JSON.stringify(keys) !== JSON.stringify(EXPECTED_KEYS)) {
            console.error(`SHAPE FAIL ${r.url}: got [${keys.join(', ')}]`);
            failed = true;
        }
        if (typeof r.url !== 'string' || typeof r.sitemapUrl !== 'string'
            || r.lastmod !== null && typeof r.lastmod !== 'string'
            || r.changefreq !== null && typeof r.changefreq !== 'string'
            || r.priority !== null && typeof r.priority !== 'number'
            || typeof r.discoveredAt !== 'string'
            || r.error !== null && typeof r.error !== 'string') {
            console.error(`TYPE FAIL ${r.url}`);
            failed = true;
        }
    }

    console.log(JSON.stringify(records[0], null, 2));
    console.log(`\nrecords: ${records.length}, key sets identical across all records: ${!failed}`);
    console.log(`summary: ${JSON.stringify(summary, null, 2)}`);

    if (failed) {
        console.error('SMOKE TEST FAILED');
        process.exit(1);
    }
    console.log('SMOKE TEST PASSED');
}

runSmokeTest().catch((err) => {
    console.error('SMOKE TEST ERROR:', err);
    process.exit(1);
});