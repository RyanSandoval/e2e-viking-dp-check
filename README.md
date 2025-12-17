# Viking E2E Pricing Page Monitor

Automated Playwright-based test suite for monitoring Viking cruise pricing pages.

## Features

- **URL Discovery**: Crawls sitemaps and follows links to discover all `*/pricing.html` pages
- **Comprehensive Testing**: Validates critical elements on each pricing page
- **Parallel Execution**: Tests run concurrently (10 max) to respect rate limits
- **Detailed Reporting**: JSON/CSV output with screenshots for failures
- **CI/CD Integration**: GitHub Actions workflow with scheduled runs

## Target Domains

- https://www.viking.com
- https://www.vikingcruises.com (oceans, expeditions)
- https://www.vikingrivercruises.com (redirects to viking.com)

## What's Tested

For each pricing page, the monitor verifies:

1. ✅ Page returns HTTP 200 (not 404/500)
2. ✅ Page loads within 10 seconds
3. ✅ At least one departure date is visible
4. ✅ Price values are present (not $0, not empty)
5. ✅ Stateroom/cabin categories display
6. ✅ "Request Quote" or booking CTA exists
7. ✅ No JS errors from `viking*.com` domains

## Quick Start

### Prerequisites

- Node.js 18+
- npm

### Installation

```bash
# Install dependencies
npm install

# Install Playwright browsers
npx playwright install chromium --with-deps
```

### Running Tests

```bash
# Step 1: Discover pricing URLs
npm run discover

# Optional: Include link-based crawling (more thorough, slower)
npm run discover -- --include-link-crawl

# Step 2: Run tests against discovered URLs
npm test

# Run with browser visible (for debugging)
npm run test:headed

# Run in debug mode
npm run test:debug
```

### View Reports

```bash
# Open Playwright HTML report
npm run report
```

## Project Structure

```
e2e-viking/
├── src/
│   ├── config.ts              # Configuration settings
│   ├── discovery/
│   │   ├── sitemap-crawler.ts # Sitemap XML parser
│   │   ├── link-crawler.ts    # Link-following crawler
│   │   ├── url-manifest.ts    # URL manifest management
│   │   └── run-discovery.ts   # Discovery entry point
│   ├── tests/
│   │   └── pricing-page.spec.ts # Playwright tests
│   └── utils/
│       └── reporter.ts        # Custom reporting
├── .github/
│   └── workflows/
│       └── pricing-monitor.yml # GitHub Actions workflow
├── playwright.config.ts       # Playwright configuration
├── package.json
└── tsconfig.json
```

## Output Files

| File | Description |
|------|-------------|
| `pricing-urls.json` | Discovered pricing page URLs manifest |
| `results.json` | Detailed test results in JSON format |
| `results.csv` | Test results in CSV format |
| `screenshots/` | Screenshots of failed pages |
| `playwright-report/` | HTML test report |

## GitHub Actions

The workflow runs:
- **Daily at 6am PT** (before business hours)
- **On push to main** (regression gate)
- **Manual trigger** (with optional link crawling)

### Setup

1. Add the Slack webhook URL as a repository secret:
   ```
   SLACK_WEBHOOK_URL=https://hooks.slack.com/services/XXX/YYY/ZZZ
   ```

2. The workflow will:
   - Discover pricing URLs from sitemaps
   - Test each URL for critical elements
   - Upload artifacts (results, screenshots, reports)
   - Post summary to Slack (if configured)

## Configuration

Edit `src/config.ts` to customize:

```typescript
export const config: VikingConfig = {
  // Target domains
  domains: [...],

  // URL patterns to match
  pricingPagePatterns: [/\/pricing\.html$/i, ...],

  // Sitemap locations
  sitemapUrls: [...],

  // Concurrency limits
  maxConcurrentDiscovery: 5,
  maxConcurrentTests: 10,

  // Timeouts
  requestTimeout: 10000,
  pageLoadTimeout: 10000,
};
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run discover` | Discover pricing URLs from sitemaps |
| `npm test` | Run Playwright tests |
| `npm run test:headed` | Run tests with browser visible |
| `npm run test:debug` | Run tests in debug mode |
| `npm run report` | Open HTML test report |
| `npm run build` | Build TypeScript |
| `npm run clean` | Remove build and test artifacts |

## Sample Results

### JSON Output
```json
{
  "runAt": "2024-01-15T14:00:00.000Z",
  "totalTested": 150,
  "passed": 147,
  "failed": 3,
  "warnings": 5,
  "avgLoadTimeMs": 2340,
  "results": [...]
}
```

### Slack Notification
```
✅ Viking Pricing Page Monitor
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total Tested: 150
Passed: 147
Failed: 3
Avg Load Time: 2340ms
```

## Troubleshooting

### No URLs discovered
- Check if sitemaps are accessible: `curl https://www.viking.com/sitemap.xml`
- Try including link crawling: `npm run discover -- --include-link-crawl`

### Tests timing out
- Increase timeout in `playwright.config.ts`
- Reduce parallel workers
- Check network connectivity

### Screenshot failures
- Ensure `screenshots/` directory is writable
- Check disk space

## License

MIT
