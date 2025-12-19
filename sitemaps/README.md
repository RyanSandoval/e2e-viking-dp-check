# Sitemaps Directory

This directory contains local copies of Viking sitemap XML files. The crawler uses these files to discover pricing page URLs instead of fetching from remote URLs (which often return 403 errors due to bot protection).

## Why Local Sitemaps?

Viking's web servers block automated sitemap requests with 403 Forbidden errors. By downloading sitemaps manually (via browser or with proper headers), we ensure reliable URL discovery for the monitor.

## How to Download Sitemaps

### Option 1: Browser Download (Recommended)

1. Visit each sitemap URL in your browser:
   - https://www.viking.com/sitemap.xml
   - https://www.vikingcruises.com/sitemap.xml

2. Save the XML content to this directory with descriptive names

### Option 2: cURL with Browser Headers

```bash
# Viking main site
curl -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" \
  -o viking-sitemap.xml \
  "https://www.viking.com/sitemap.xml"

# Viking Cruises site
curl -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" \
  -o vikingcruises-sitemap.xml \
  "https://www.vikingcruises.com/sitemap.xml"
```

### Option 3: wget with Headers

```bash
wget --user-agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" \
  -O viking-sitemap.xml \
  "https://www.viking.com/sitemap.xml"
```

## Expected Files

| File | Source URL | Description |
|------|------------|-------------|
| `viking-sitemap.xml` | https://www.viking.com/sitemap.xml | Main Viking site (ocean, river, expeditions) |
| `vikingcruises-sitemap.xml` | https://www.vikingcruises.com/sitemap.xml | Viking Cruises site |

## Sitemap Format

The crawler supports both standard sitemaps and sitemap index files:

### Standard Sitemap
```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://www.viking.com/cruises/ocean/viking-sky/pricing.html</loc>
    <lastmod>2024-01-15</lastmod>
  </url>
</urlset>
```

### Sitemap Index (references other sitemaps)
```xml
<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://www.viking.com/sitemap-cruises.xml</loc>
  </sitemap>
</sitemapindex>
```

Both formats are automatically detected and processed.

## How It Works

1. **Discovery phase** checks this directory first
2. Any `.xml` files found are parsed for URLs
3. URLs matching `/pricing.html` pattern are extracted
4. If no local files exist, the crawler attempts remote fetch (may fail with 403)

## Keeping Sitemaps Updated

Sitemaps should be refreshed periodically to catch new cruise itineraries:

- **Recommended**: Update monthly or when new cruises are announced
- **Automated option**: Add a GitHub Action step to download sitemaps (may need proxy/VPN)

## Troubleshooting

### "No URLs found in sitemaps"

- Verify XML files are valid (not HTML error pages)
- Check that files have `.xml` extension
- Ensure files contain `<url>` or `<sitemap>` elements

### "403 Forbidden" when downloading

- Use a browser to download instead of curl/wget
- Try adding more realistic headers (Accept, Accept-Language, etc.)
- Use a VPN if your IP is blocked

### Sitemap contains no pricing URLs

- Viking may structure URLs differently
- Check the actual XML content for URL patterns
- The pattern `/pricing.html` is case-insensitive

## Notes

- Any `.xml` file in this directory will be processed
- Files are processed in alphabetical order
- Duplicate URLs across files are automatically deduplicated
- The crawler outputs discovered URLs to `pricing-urls.json` in the project root
