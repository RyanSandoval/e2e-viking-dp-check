/**
 * Viking Pricing Page Tests
 *
 * Tests each pricing URL from the manifest for:
 * 1. Page returns 200 (not 404/500)
 * 2. Page loads within 10 seconds
 * 3. At least one departure date is visible
 * 4. Price values are present (not $0, not empty)
 * 5. Stateroom/cabin categories display
 * 6. "Request Quote" or booking CTA exists
 * 7. No JS errors from viking*.com domains
 */

import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs/promises';
import * as path from 'path';
import config from '../config.js';
import { UrlManifest, DiscoveredUrl } from '../discovery/index.js';

// Store JS errors per page
const jsErrors: Map<string, string[]> = new Map();

// Load the URL manifest
let manifest: UrlManifest;
let pricingUrls: DiscoveredUrl[] = [];

test.beforeAll(async () => {
  try {
    const content = await fs.readFile(config.output.manifestFile, 'utf-8');
    manifest = JSON.parse(content);
    pricingUrls = manifest.urls;
    console.log(`Loaded ${pricingUrls.length} URLs from manifest`);
  } catch (error) {
    // If no manifest exists, use a sample URL for testing
    console.warn('No manifest found, using sample URLs for testing');
    pricingUrls = [
      {
        url: 'https://www.viking.com/cruises/ocean/viking-sky/british-isles-explorer/pricing.html',
        source: 'sitemap',
        domain: 'www.viking.com',
        discoveredAt: new Date().toISOString(),
      },
    ];
  }
});

// Generate tests dynamically from manifest
test.describe('Viking Pricing Page Monitor', () => {
  test.describe.configure({ mode: 'parallel' });

  // We need to generate tests at test discovery time, but we load URLs dynamically
  // Playwright requires static test definitions, so we use a workaround
  test('All pricing pages pass validation', async ({ page, browserName }, testInfo) => {
    // Skip if no URLs to test
    if (pricingUrls.length === 0) {
      test.skip(true, 'No pricing URLs in manifest');
      return;
    }

    const results: PricingPageResult[] = [];

    // Test each URL
    for (const urlInfo of pricingUrls) {
      const result = await testPricingPage(page, urlInfo, testInfo);
      results.push(result);

      // Soft assertion - collect all results, don't fail immediately
      if (!result.passed) {
        testInfo.annotations.push({
          type: 'failed-url',
          description: `${urlInfo.url}: ${result.errors.join(', ')}`,
        });
      }
    }

    // Write results to file for the reporter
    await writeResults(results);

    // Final assertion - fail if any pages failed
    const failedPages = results.filter((r) => !r.passed);
    if (failedPages.length > 0) {
      const summary = failedPages
        .map((r) => `${r.url}: ${r.errors.join(', ')}`)
        .join('\n');
      expect(failedPages.length, `${failedPages.length} pages failed:\n${summary}`).toBe(0);
    }
  });
});

interface PricingPageResult {
  url: string;
  domain: string;
  passed: boolean;
  loadTimeMs: number;
  httpStatus: number;
  checks: CheckResult[];
  errors: string[];
  warnings: string[];
  screenshotPath?: string;
  testedAt: string;
}

interface CheckResult {
  name: string;
  passed: boolean;
  details?: string;
}

/**
 * Test a single pricing page
 */
async function testPricingPage(
  page: Page,
  urlInfo: DiscoveredUrl,
  testInfo: any
): Promise<PricingPageResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  const warnings: string[] = [];
  const checks: CheckResult[] = [];
  let httpStatus = 0;

  // Collect JS errors
  const pageJsErrors: string[] = [];
  page.on('pageerror', (error) => {
    // Only track errors from viking domains
    if (error.message.includes('viking')) {
      pageJsErrors.push(error.message);
    }
  });

  // Track console errors
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (text.includes('viking') && !text.includes('third-party')) {
        pageJsErrors.push(`Console error: ${text}`);
      }
    }
  });

  try {
    // Check 1: Page loads successfully (HTTP 200)
    const response = await page.goto(urlInfo.url, {
      waitUntil: 'domcontentloaded',
      timeout: config.pageLoadTimeout,
    });

    httpStatus = response?.status() || 0;
    const loadTimeMs = Date.now() - startTime;

    checks.push({
      name: 'HTTP Status 200',
      passed: httpStatus === 200,
      details: `Status: ${httpStatus}`,
    });

    if (httpStatus !== 200) {
      errors.push(`HTTP ${httpStatus}`);
    }

    // Check 2: Load time under 10 seconds
    checks.push({
      name: 'Load time < 10s',
      passed: loadTimeMs < 10000,
      details: `${loadTimeMs}ms`,
    });

    if (loadTimeMs >= 10000) {
      warnings.push(`Slow load: ${loadTimeMs}ms`);
    }

    // Only run content checks if page loaded successfully
    if (httpStatus === 200) {
      // Wait for dynamic content
      await page.waitForLoadState('networkidle').catch(() => {});

      // Check 3: Departure dates visible
      const departureDateCheck = await checkDepartureDates(page);
      checks.push(departureDateCheck);
      if (!departureDateCheck.passed) {
        errors.push('No departure dates found');
      }

      // Check 4: Price values present
      const priceCheck = await checkPriceValues(page);
      checks.push(priceCheck);
      if (!priceCheck.passed) {
        errors.push('No valid prices found');
      }

      // Check 5: Stateroom/cabin categories
      const stateroomCheck = await checkStateroomCategories(page);
      checks.push(stateroomCheck);
      if (!stateroomCheck.passed) {
        warnings.push('No stateroom categories found');
      }

      // Check 6: CTA button exists
      const ctaCheck = await checkCTAButton(page);
      checks.push(ctaCheck);
      if (!ctaCheck.passed) {
        warnings.push('No booking CTA found');
      }

      // Check 7: No JS errors from viking domains
      checks.push({
        name: 'No Viking JS errors',
        passed: pageJsErrors.length === 0,
        details:
          pageJsErrors.length > 0 ? `${pageJsErrors.length} errors` : 'Clean',
      });

      if (pageJsErrors.length > 0) {
        warnings.push(`JS errors: ${pageJsErrors.join('; ')}`);
      }
    }

    // Take screenshot if any checks failed
    const hasFailures = checks.some((c) => !c.passed);
    let screenshotPath: string | undefined;

    if (hasFailures) {
      const screenshotName = urlInfo.url
        .replace(/https?:\/\//, '')
        .replace(/[^a-zA-Z0-9]/g, '_')
        .slice(0, 100);

      screenshotPath = path.join(
        config.output.screenshotsDir,
        `${screenshotName}.png`
      );

      await fs.mkdir(config.output.screenshotsDir, { recursive: true });
      await page.screenshot({ path: screenshotPath, fullPage: true });
    }

    const criticalChecksFailed = checks
      .filter((c) => ['HTTP Status 200', 'Departure dates visible', 'Valid prices present'].includes(c.name))
      .some((c) => !c.passed);

    return {
      url: urlInfo.url,
      domain: urlInfo.domain,
      passed: !criticalChecksFailed,
      loadTimeMs: Date.now() - startTime,
      httpStatus,
      checks,
      errors,
      warnings,
      screenshotPath,
      testedAt: new Date().toISOString(),
    };
  } catch (error) {
    // Handle timeout or other navigation errors
    const errorMsg = error instanceof Error ? error.message : String(error);
    errors.push(errorMsg);

    return {
      url: urlInfo.url,
      domain: urlInfo.domain,
      passed: false,
      loadTimeMs: Date.now() - startTime,
      httpStatus,
      checks: [{ name: 'Page load', passed: false, details: errorMsg }],
      errors,
      warnings,
      testedAt: new Date().toISOString(),
    };
  }
}

/**
 * Check for departure dates on the page
 */
async function checkDepartureDates(page: Page): Promise<CheckResult> {
  // Look for common date patterns and elements
  const dateSelectors = [
    '[data-testid*="date"]',
    '[class*="departure"]',
    '[class*="date"]',
    '.sailing-date',
    '.departure-date',
    'time',
    '[datetime]',
  ];

  // Also check for date text patterns
  const datePatterns = [
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}/i,
    /\b\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i,
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}/i,
    /\d{1,2}\/\d{1,2}\/\d{2,4}/,
    /\d{4}-\d{2}-\d{2}/,
  ];

  // Check for date elements
  for (const selector of dateSelectors) {
    const count = await page.locator(selector).count();
    if (count > 0) {
      return {
        name: 'Departure dates visible',
        passed: true,
        details: `Found ${count} date elements`,
      };
    }
  }

  // Check page text for date patterns
  const pageText = await page.textContent('body') || '';
  for (const pattern of datePatterns) {
    if (pattern.test(pageText)) {
      return {
        name: 'Departure dates visible',
        passed: true,
        details: 'Found date in page text',
      };
    }
  }

  return {
    name: 'Departure dates visible',
    passed: false,
    details: 'No departure dates found',
  };
}

/**
 * Check for valid price values (not $0, not empty)
 */
async function checkPriceValues(page: Page): Promise<CheckResult> {
  const priceSelectors = [
    '[data-testid*="price"]',
    '[class*="price"]',
    '.price',
    '.cost',
    '.fare',
    '.rate',
  ];

  // Price patterns: $X,XXX or $XX,XXX (must be > $0)
  const pricePattern = /\$[\d,]+(?:\.\d{2})?/g;

  for (const selector of priceSelectors) {
    const elements = page.locator(selector);
    const count = await elements.count();

    for (let i = 0; i < count; i++) {
      const text = await elements.nth(i).textContent();
      if (text) {
        const prices = text.match(pricePattern);
        if (prices) {
          // Check that at least one price is not $0
          for (const price of prices) {
            const value = parseFloat(price.replace(/[$,]/g, ''));
            if (value > 0) {
              return {
                name: 'Valid prices present',
                passed: true,
                details: `Found price: ${price}`,
              };
            }
          }
        }
      }
    }
  }

  // Check full page text
  const pageText = await page.textContent('body') || '';
  const prices = pageText.match(pricePattern);

  if (prices) {
    for (const price of prices) {
      const value = parseFloat(price.replace(/[$,]/g, ''));
      if (value > 0) {
        return {
          name: 'Valid prices present',
          passed: true,
          details: `Found price: ${price}`,
        };
      }
    }
  }

  return {
    name: 'Valid prices present',
    passed: false,
    details: 'No valid prices found (all $0 or empty)',
  };
}

/**
 * Check for stateroom/cabin category displays
 */
async function checkStateroomCategories(page: Page): Promise<CheckResult> {
  const categorySelectors = [
    '[class*="stateroom"]',
    '[class*="cabin"]',
    '[class*="category"]',
    '[class*="accommodation"]',
    '[data-testid*="stateroom"]',
    '[data-testid*="cabin"]',
  ];

  const categoryKeywords = [
    'veranda',
    'balcony',
    'suite',
    'penthouse',
    'explorer',
    'deluxe',
    'standard',
    'category',
    'stateroom',
    'cabin',
  ];

  // Check for category elements
  for (const selector of categorySelectors) {
    const count = await page.locator(selector).count();
    if (count > 0) {
      return {
        name: 'Stateroom categories displayed',
        passed: true,
        details: `Found ${count} category elements`,
      };
    }
  }

  // Check page text for category keywords
  const pageText = (await page.textContent('body') || '').toLowerCase();
  for (const keyword of categoryKeywords) {
    if (pageText.includes(keyword)) {
      return {
        name: 'Stateroom categories displayed',
        passed: true,
        details: `Found keyword: ${keyword}`,
      };
    }
  }

  return {
    name: 'Stateroom categories displayed',
    passed: false,
    details: 'No stateroom categories found',
  };
}

/**
 * Check for "Request Quote" or booking CTA button
 */
async function checkCTAButton(page: Page): Promise<CheckResult> {
  const ctaSelectors = [
    'button:has-text("Request Quote")',
    'a:has-text("Request Quote")',
    'button:has-text("Book")',
    'a:has-text("Book")',
    'button:has-text("Reserve")',
    'a:has-text("Reserve")',
    '[data-testid*="cta"]',
    '[class*="cta"]',
    '[class*="book-now"]',
    '[class*="request-quote"]',
  ];

  for (const selector of ctaSelectors) {
    try {
      const count = await page.locator(selector).count();
      if (count > 0) {
        const text = await page.locator(selector).first().textContent();
        return {
          name: 'Booking CTA exists',
          passed: true,
          details: `Found CTA: "${text?.trim()}"`,
        };
      }
    } catch {
      continue;
    }
  }

  return {
    name: 'Booking CTA exists',
    passed: false,
    details: 'No booking CTA found',
  };
}

/**
 * Write test results to file
 */
async function writeResults(results: PricingPageResult[]): Promise<void> {
  const summary = {
    runAt: new Date().toISOString(),
    totalTested: results.length,
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed).length,
    warnings: results.filter((r) => r.warnings.length > 0).length,
    avgLoadTimeMs:
      results.reduce((sum, r) => sum + r.loadTimeMs, 0) / results.length || 0,
    results,
  };

  // Write JSON
  await fs.writeFile(
    config.output.resultsJson,
    JSON.stringify(summary, null, 2),
    'utf-8'
  );

  // Write CSV
  const csvHeader =
    'URL,Domain,Passed,Load Time (ms),HTTP Status,Errors,Warnings,Tested At\n';
  const csvRows = results
    .map(
      (r) =>
        `"${r.url}","${r.domain}",${r.passed},${r.loadTimeMs},${r.httpStatus},"${r.errors.join('; ')}","${r.warnings.join('; ')}","${r.testedAt}"`
    )
    .join('\n');

  await fs.writeFile(config.output.resultsCsv, csvHeader + csvRows, 'utf-8');

  console.log(`\n📊 Results written to ${config.output.resultsJson} and ${config.output.resultsCsv}`);
}
