# Viking E2E Pricing Page Monitor

[![Pricing Monitor](https://github.com/RyanSandoval/e2e-viking/actions/workflows/pricing-monitor.yml/badge.svg)](https://github.com/RyanSandoval/e2e-viking/actions/workflows/pricing-monitor.yml)

An automated Playwright-based test suite that monitors Viking cruise pricing pages for availability, functionality, and content integrity. Designed to catch pricing page issues before customers do.

## Why This Exists

Pricing pages are critical for cruise bookings. When they break—whether due to missing prices, unavailable sailings, or JavaScript errors—customers can't book, and revenue is lost. This monitor:

- **Proactively detects issues** before customer complaints
- **Runs daily** to catch problems early
- **Provides detailed error categorization** to speed up debugging
- **Integrates with Slack** for immediate team notification

## What Gets Tested

For each of the ~400 pricing URLs across Viking domains, the monitor validates:

| Check | Description | Severity |
|-------|-------------|----------|
| HTTP 200 | Page loads successfully (not 404/500) | Critical |
| No Error Messages | No "call for fares" or "no sailings" messages | Critical |
| Departure Dates | At least one sailing date is visible | Critical |
| Price Values | Prices are present and non-zero | Critical |
| Load Time | Page loads within 10 seconds | Warning |
| Stateroom Categories | Cabin types are displayed | Warning |
| Booking CTA | "Request Quote" or similar button exists | Warning |
| No JS Errors | No JavaScript errors from viking domains | Warning |

## Error Categories

The monitor groups failures by type for easy triage:

| Error Type | What It Means | Typical Cause |
|------------|---------------|---------------|
| **HTTP 404** | Page not found | Removed/renamed cruise |
| **HTTP 5xx** | Server error | Backend issues |
| **Pricing Unavailable** | "Call for fares" message displayed | Cruise sold out or not yet available |
| **No Departure Dates** | Can't find any sailing dates | Data loading issue |
| **No Valid Prices** | Prices are $0 or missing | Pricing data not loaded |
| **Page Load Timeout** | Page took >10s to load | Performance issue |

## Target Domains

- `www.viking.com` - Main Viking site (ocean, river, expeditions)
- `www.vikingcruises.com` - Ocean and expedition cruises
- `www.vikingrivercruises.com` - Redirects to viking.com

---

## Quick Start

### Prerequisites

- Node.js 18+
- npm

### Installation

```bash
# Clone the repository
git clone https://github.com/RyanSandoval/e2e-viking.git
cd e2e-viking

# Install dependencies
npm install

# Install Playwright browsers
npx playwright install chromium --with-deps
```

### Download Sitemaps

Remote sitemaps may block automated requests (403 errors). Download them manually:

```bash
# Via browser: Visit https://www.viking.com/sitemap.xml and save to sitemaps/

# Or via cURL with browser user-agent
curl -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" \
  -o sitemaps/viking-sitemap.xml \
  "https://www.viking.com/sitemap.xml"

curl -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" \
  -o sitemaps/vikingcruises-sitemap.xml \
  "https://www.vikingcruises.com/sitemap.xml"
```

### Run the Monitor

```bash
# Step 1: Discover all pricing URLs from sitemaps
npm run discover

# Step 2: Run tests against all discovered URLs
npm test

# View the HTML report
npm run report
```

---

## Sample Output

### Console Summary

```
═══════════════════════════════════════════════════════════════
              Viking Pricing Page Monitor Results
═══════════════════════════════════════════════════════════════
  Total Tested:  389
  PASSED:        377
  FAILED:        12
  Avg Load:      2340ms
═══════════════════════════════════════════════════════════════

PASSED URLs: 377 URLs passed all checks
   ✓ https://www.viking.com/cruises/ocean/viking-sky/british-isles/pricing.html
   ✓ https://www.viking.com/cruises/ocean/viking-orion/antarctic/pricing.html
   ✓ https://www.viking.com/cruises/river/grand-european/pricing.html
   ... and 367 more passed URLs

FAILED URLs (grouped by error type):

   [Pricing Unavailable (Call for fares)] (8 URLs):
      - https://www.viking.com/cruises/ocean/special-voyage/pricing.html
      - https://www.viking.com/cruises/expedition/sold-out/pricing.html
      ...

   [HTTP 404 (Page Not Found)] (3 URLs):
      - https://www.viking.com/cruises/old-itinerary/pricing.html
      ...

   [No Departure Dates] (1 URLs):
      - https://www.viking.com/cruises/coming-soon/pricing.html
```

### JSON Output (`results.json`)

```json
{
  "runAt": "2024-01-15T14:00:00.000Z",
  "totalTested": 389,
  "passed": 377,
  "failed": 12,
  "warnings": 5,
  "avgLoadTimeMs": 2340,
  "results": [
    {
      "url": "https://www.viking.com/cruises/ocean/viking-sky/british-isles/pricing.html",
      "domain": "www.viking.com",
      "passed": true,
      "loadTimeMs": 1850,
      "httpStatus": 200,
      "checks": [
        { "name": "HTTP Status 200", "passed": true },
        { "name": "Departure dates visible", "passed": true },
        { "name": "Valid prices present", "passed": true, "details": "Found price: $5,499" }
      ],
      "errors": [],
      "warnings": []
    }
  ]
}
```

---

## GitHub Actions Integration

The workflow runs automatically:

| Trigger | When | Purpose |
|---------|------|---------|
| **Scheduled** | Daily at 6am PT | Catch issues before business hours |
| **Push to main** | On merge | Regression gate |
| **Manual** | On-demand | Ad-hoc testing |

### Setup

1. **Add Slack webhook** (optional) as a repository secret:
   ```
   Settings > Secrets > Actions > New repository secret
   Name: SLACK_WEBHOOK_URL
   Value: https://hooks.slack.com/services/XXX/YYY/ZZZ
   ```

2. **Commit sitemaps** to the `sitemaps/` directory for reliable discovery

3. **Enable Actions** in your repository settings

### Workflow Outputs

| Artifact | Contents |
|----------|----------|
| `pricing-urls` | Discovered URL manifest |
| `test-results` | JSON/CSV results + screenshots |
| `playwright-report` | Interactive HTML report |

---

## Project Structure

```
e2e-viking/
├── .github/
│   └── workflows/
│       └── pricing-monitor.yml    # GitHub Actions workflow
├── sitemaps/                       # Local sitemap XML files
│   ├── README.md
│   └── *.xml
├── src/
│   ├── config.ts                   # Configuration settings
│   ├── discovery/
│   │   ├── sitemap-crawler.ts      # Parses sitemap XML (local + remote)
│   │   ├── link-crawler.ts         # Follows links to find pricing pages
│   │   ├── url-manifest.ts         # Manages discovered URLs
│   │   └── run-discovery.ts        # Discovery entry point
│   ├── tests/
│   │   └── pricing-page.spec.ts    # Playwright test suite
│   └── utils/
│       └── reporter.ts             # Custom reporting utilities
├── playwright.config.ts            # Playwright configuration
├── package.json
├── tsconfig.json
└── README.md
```

---

## Available Commands

| Command | Description |
|---------|-------------|
| `npm run discover` | Find all pricing URLs from sitemaps |
| `npm run discover -- --include-link-crawl` | Include link-based crawling (slower, more thorough) |
| `npm test` | Run all pricing page tests |
| `npm run test:headed` | Run tests with visible browser |
| `npm run test:debug` | Run in Playwright debug mode |
| `npm run report` | Open the HTML test report |
| `npm run build` | Compile TypeScript |
| `npm run clean` | Remove build artifacts |

---

## Configuration

Edit `src/config.ts` to customize behavior:

```typescript
export const config: VikingConfig = {
  // Domains to monitor
  domains: [
    'www.viking.com',
    'www.vikingcruises.com',
    'www.vikingrivercruises.com',
  ],

  // URL patterns to match (regex)
  pricingPagePatterns: [/\/pricing\.html$/i],

  // Concurrency settings
  maxConcurrentDiscovery: 5,   // Parallel sitemap fetches
  maxConcurrentTests: 10,      // Parallel test workers

  // Timeouts (milliseconds)
  requestTimeout: 10000,       // HTTP request timeout
  pageLoadTimeout: 10000,      // Page load timeout

  // Output locations
  output: {
    manifestFile: 'pricing-urls.json',
    resultsJson: 'results.json',
    resultsCsv: 'results.csv',
    screenshotsDir: 'screenshots',
  },
};
```

---

## Troubleshooting

### No URLs discovered / 403 Errors

Remote sitemaps may block automated requests. Use local sitemaps:

```bash
# Download via browser and save to sitemaps/ directory
# Or use curl with a browser user-agent
curl -A "Mozilla/5.0" -o sitemaps/viking.xml "https://www.viking.com/sitemap.xml"
```

### Tests timing out

- Increase `globalTimeout` in `playwright.config.ts`
- Reduce `workers` for slower connections
- Check that sitemaps aren't returning thousands of URLs

### False positives on "unavailable" messages

The monitor only flags **visible** error messages. Hidden HTML elements (e.g., `display: none`) are ignored. If you're seeing false positives, check that the element is actually visible on page load.

### Screenshots not being saved

- Ensure `screenshots/` directory is writable
- Check available disk space
- Screenshots are only taken for **failed** pages

---

## Output Files

| File | Format | Description |
|------|--------|-------------|
| `pricing-urls.json` | JSON | Discovered pricing page URLs with metadata |
| `results.json` | JSON | Detailed test results for all pages |
| `results.csv` | CSV | Spreadsheet-friendly results export |
| `screenshots/*.png` | PNG | Full-page screenshots of failed pages |
| `playwright-report/` | HTML | Interactive Playwright test report |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        GitHub Actions                           │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────────┐ │
│  │   Discover   │──▶│     Test     │──▶│       Notify         │ │
│  │  (sitemaps)  │   │  (Playwright)│   │  (Slack + Summary)   │ │
│  └──────────────┘   └──────────────┘   └──────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
         │                    │                     │
         ▼                    ▼                     ▼
  pricing-urls.json    results.json          Slack message
                       results.csv           GitHub Summary
                       screenshots/
                       playwright-report/
```

**Discovery Phase:**
1. Reads sitemap XML files from `sitemaps/` directory (or fetches remote)
2. Parses all URLs matching `/pricing.html` pattern
3. Outputs `pricing-urls.json` manifest

**Test Phase:**
1. Loads URL manifest
2. Tests each URL in parallel (10 workers)
3. Captures screenshots on failure
4. Writes results to JSON/CSV

**Notify Phase:**
1. Parses results
2. Posts summary to Slack (if configured)
3. Creates GitHub Actions summary

---

## License

MIT
