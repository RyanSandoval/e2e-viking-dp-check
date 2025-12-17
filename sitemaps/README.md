# Sitemaps Directory

Place downloaded sitemap XML files here. The crawler will use local files instead of fetching from remote URLs (which may return 403 errors).

## How to Download Sitemaps

### Option 1: Browser
1. Visit each sitemap URL in your browser
2. Save as XML file to this directory

### Option 2: cURL with browser headers
```bash
curl -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" \
  -o sitemaps/viking-sitemap.xml \
  "https://www.viking.com/sitemap.xml"

curl -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" \
  -o sitemaps/vikingcruises-sitemap.xml \
  "https://www.vikingcruises.com/sitemap.xml"
```

## Expected Files

| File | Source |
|------|--------|
| `viking-sitemap.xml` | https://www.viking.com/sitemap.xml |
| `vikingcruises-sitemap.xml` | https://www.vikingcruises.com/sitemap.xml |

## Notes

- Any `.xml` file in this directory will be processed
- If this directory is empty, the crawler falls back to remote URLs
- Sitemap index files (containing references to other sitemaps) are supported
