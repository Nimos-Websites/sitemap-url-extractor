# Sitemap URL Extractor

Reads XML sitemaps and sitemap indexes. Returns one flat JSON record per URL with a fixed key set: `url`, `sitemapUrl`, `lastmod`, `changefreq`, `priority`, `discoveredAt`, `error`. Same shape every single run.

## Output

```json
{
  "url": "https://www.sitemaps.org/",
  "sitemapUrl": "https://www.sitemaps.org/sitemap.xml",
  "lastmod": "2016-11-21",
  "changefreq": null,
  "priority": null,
  "discoveredAt": "2026-08-25T01:09:01.819Z",
  "error": null
}
```

Every record carries all seven keys. A missing field is `null`. A URL entry that failed validation (no `<loc>`, non-http loc) is returned as a record with `error` set — it is never silently dropped.

## Input

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `startUrls` | array (required) | — | XML sitemap or sitemap index URLs |
| `followIndexes` | boolean | `true` | Also read child sitemaps of a `<sitemapindex>` |
| `maxUrls` | integer | 100 | Hard cap on records per run; compute scales with this |
| `includeGlobs` | string[] | `[]` | Keep only URLs matching a glob (`**` crosses `/`, `*` does not) |
| `excludeGlobs` | string[] | `[]` | Drop URLs matching a glob, applied before include |

## Cost to run

Runs on Apify platform compute, billed in compute units (1 CU = 1 GB RAM for 1 hour) and deducted before creator payout. This actor does plain HTTP fetches and XML parsing — no headless browser — so memory sits at the 256 MB floor and a capped 100-URL run finishes well inside one CU-minute of compute. When published it will be listed as **Pay per event** (the only pricing model open to new agentic Actor listings); until then you pay nothing but platform usage on your own plan.

## Run

```bash
npm install
npm test        # smoke test against live sitemaps
npm start       # needs Actor input (INPUT.json) or run on the Apify platform
```
