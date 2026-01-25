/**
 * Viking Pricing Page Tests
 *
 * Tests each pricing URL from the manifest for:
 * 1. Page returns 200 (not 404/500)
 * 2. Page loads within 10 seconds
 * 3. No "no availability" error messages displayed
 * 4. At least one departure date is visible
 * 5. Price values are present (not $0, not empty)
 * 6. Stateroom/cabin categories display
 * 7. "Request Quote" or booking CTA exists
 * 8. No JS errors from viking*.com domains
 */

import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import config from '../config.js';
import { UrlManifest, DiscoveredUrl } from '../discovery/index.js';

// Load URLs synchronously at module load time for parallel test generation
let pricingUrls: DiscoveredUrl[] = [];

try {
  const content = fs.readFileSync(config.output.manifestFile, 'utf-8');
  const manifest: UrlManifest = JSON.parse(content);
  pricingUrls = manifest.urls;
  console.log(`Loaded ${pricingUrls.length} URLs from manifest for parallel testing`);
} catch (error) {
  console.warn('No manifest found, using sample URL for testing');
  pricingUrls = [
    {
      url: 'https://www.vikingcruises.com/oceans/cruise-destinations/caribbean/western-caribbean/pricing.html',
      source: 'sitemap',
      domain: 'www.vikingcruises.com',
      discoveredAt: new Date().toISOString(),
    },
  ];
}

// Results collector for summary (shared across parallel tests)
const allResults: PricingPageResult[] = [];

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

// Configure parallel execution
test.describe.configure({ mode: 'parallel' });

// Generate individual tests for each URL - enables true parallel execution
for (const urlInfo of pricingUrls) {
  // Extract a short name for the test from the URL (include domain for uniqueness)
  const urlObj = new URL(urlInfo.url);
  const domain = urlObj.hostname.replace('www.', '').replace('vikingcruises', 'vc').replace('.com', '');
  const urlPath = urlObj.pathname.replace('/pricing.html', '').replace('/pricing', '').split('/').slice(-2).join('/');
  const shortName = `[${domain}] ${urlPath}`;

  test(`Pricing: ${shortName}`, async ({ page }, testInfo) => {
    const result = await testPricingPage(page, urlInfo, testInfo);
    allResults.push(result);

    // Fail the test if critical checks failed
    if (!result.passed) {
      expect.soft(result.passed, `Failed: ${result.errors.join(', ')}`).toBe(true);
    }
  });
}

// After all tests, write summary
test.afterAll(async () => {
  if (allResults.length > 0) {
    await writeResults(allResults);
  }
});

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
    if (error.message.includes('viking')) {
      pageJsErrors.push(error.message);
    }
  });

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
      await page.waitForLoadState('networkidle').catch(() => {});

      // Check 3: No error messages displayed
      const errorMessageCheck = await checkForErrorMessages(page);
      checks.push(errorMessageCheck);
      if (!errorMessageCheck.passed) {
        errors.push(errorMessageCheck.details || 'Error message displayed on page');
      }

      // Check 4: Departure dates visible
      const departureDateCheck = await checkDepartureDates(page);
      checks.push(departureDateCheck);
      if (!departureDateCheck.passed) {
        errors.push('No departure dates found');
      }

      // Check 5: Price values present
      const priceCheck = await checkPriceValues(page);
      checks.push(priceCheck);
      if (!priceCheck.passed) {
        errors.push('No valid prices found');
      }

      // Check 6: Stateroom/cabin categories
      const stateroomCheck = await checkStateroomCategories(page);
      checks.push(stateroomCheck);
      if (!stateroomCheck.passed) {
        warnings.push('No stateroom categories found');
      }

      // Check 7: CTA button exists
      const ctaCheck = await checkCTAButton(page);
      checks.push(ctaCheck);
      if (!ctaCheck.passed) {
        warnings.push('No booking CTA found');
      }

      // Check 8: No JS errors from viking domains
      checks.push({
        name: 'No Viking JS errors',
        passed: pageJsErrors.length === 0,
        details: pageJsErrors.length > 0 ? `${pageJsErrors.length} errors` : 'Clean',
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

      screenshotPath = path.join(config.output.screenshotsDir, `${screenshotName}.png`);
      await fsp.mkdir(config.output.screenshotsDir, { recursive: true });
      await page.screenshot({ path: screenshotPath, fullPage: true });

      // Attach screenshot to test report
      await testInfo.attach('screenshot', { path: screenshotPath });
    }

    // Critical checks determine pass/fail
    const criticalChecksFailed = checks
      .filter((c) => ['HTTP Status 200', 'No error messages', 'Departure dates visible', 'Valid prices present'].includes(c.name))
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
 * Check for error messages indicating no pricing data available
 */
async function checkForErrorMessages(page: Page): Promise<CheckResult> {
  const errorPatterns = [
    'Based on your selections there are no available sailings',
    'no available sailings',
    'Please adjust your filters to see all availability',
    'No sailings available',
    'No departures available',
    'Currently unavailable',
    'No prices available',
    'Pricing not available',
  ];

  const unavailablePanel = page.locator('#pricing-unavailable');
  if (await unavailablePanel.count() > 0) {
    const isVisible = await unavailablePanel.isVisible();
    if (isVisible) {
      const text = await unavailablePanel.textContent() || '';
      return {
        name: 'No error messages',
        passed: false,
        details: `Unavailable panel visible: "${text.trim().substring(0, 100)}"`,
      };
    }
  }

  for (const errorMsg of errorPatterns) {
    const locator = page.locator(`text="${errorMsg}"`).first();
    if (await locator.count() > 0) {
      try {
        const isVisible = await locator.isVisible();
        if (isVisible) {
          return {
            name: 'No error messages',
            passed: false,
            details: `Found visible: "${errorMsg}"`,
          };
        }
      } catch {
        // Element might have been removed
      }
    }
  }

  return {
    name: 'No error messages',
    passed: true,
    details: 'No visible error messages found',
  };
}

/**
 * Check for departure dates on the page
 */
async function checkDepartureDates(page: Page): Promise<CheckResult> {
  const dateSelectors = [
    '[data-testid*="date"]',
    '[class*="departure"]',
    '[class*="date"]',
    '.sailing-date',
    '.departure-date',
    'time',
    '[datetime]',
  ];

  const datePatterns = [
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\b/i,
    /\b\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i,
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}\b/i,
    /\d{1,2}\/\d{1,2}\/\d{2,4}/,
    /\d{4}-\d{2}-\d{2}/,
  ];

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

  const pageText = await page.textContent('body') || '';
  for (const pattern of datePatterns) {
    const match = pageText.match(pattern);
    if (match) {
      return {
        name: 'Departure dates visible',
        passed: true,
        details: `Found date: "${match[0]}"`,
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
 * Supports multiple currencies: $, £, €, A$, C$
 */
async function checkPriceValues(page: Page): Promise<CheckResult> {
  const priceSelectors = [
    '[data-testid*="price"]',
    '[data-testid*="fare"]',
    '[class*="price"]',
    '[class*="fare"]',
    '.price',
    '.cost',
    '.fare',
    '.rate',
  ];

  // Support multiple currency formats: $, £, €, A$, C$
  const pricePattern = /(?:[$£€]|A\$|C\$)[\d,]+(?:\.\d{2})?/g;

  for (const selector of priceSelectors) {
    const elements = page.locator(selector);
    const count = await elements.count();

    for (let i = 0; i < count; i++) {
      const text = await elements.nth(i).textContent();
      if (text) {
        const prices = text.match(pricePattern);
        if (prices) {
          for (const price of prices) {
            const value = parseFloat(price.replace(/[$£€A$C$,]/g, ''));
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

  const pageText = await page.textContent('body') || '';
  const prices = pageText.match(pricePattern);

  if (prices) {
    for (const price of prices) {
      const value = parseFloat(price.replace(/[$£€A$C$,]/g, ''));
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
    '[class*="availability"]',
    '[data-testid*="stateroom"]',
    '[data-testid*="cabin"]',
  ];

  const categoryKeywords = [
    'suite', 'veranda', 'french balcony', 'nordic balcony', 'balcony',
    'standard', 'penthouse', 'explorer', 'deluxe', 'category', 'stateroom', 'cabin',
  ];

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
    'button:has-text("Price")', 'a:has-text("Price")',
    'button:has-text("Build")', 'a:has-text("Build")',
    'button:has-text("Request Quote")', 'a:has-text("Request Quote")',
    'button:has-text("Request a Quote")', 'a:has-text("Request a Quote")',
    'button:has-text("Book")', 'a:has-text("Book")',
    'button:has-text("Reserve")', 'a:has-text("Reserve")',
    'button:has-text("More Info")', 'a:has-text("More Info")',
    '[data-testid*="cta"]', '[class*="cta"]',
    '[class*="book-now"]', '[class*="request-quote"]', '[class*="price-build"]',
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
 * Write test results to file and print summary
 */
async function writeResults(results: PricingPageResult[]): Promise<void> {
  const passedResults = results.filter((r) => r.passed);
  const failedResults = results.filter((r) => !r.passed);

  const summary = {
    runAt: new Date().toISOString(),
    totalTested: results.length,
    passed: passedResults.length,
    failed: failedResults.length,
    warnings: results.filter((r) => r.warnings.length > 0).length,
    avgLoadTimeMs: results.reduce((sum, r) => sum + r.loadTimeMs, 0) / results.length || 0,
    results,
  };

  // Write JSON
  await fsp.writeFile(config.output.resultsJson, JSON.stringify(summary, null, 2), 'utf-8');

  // Write CSV
  const csvHeader = 'URL,Domain,Passed,Load Time (ms),HTTP Status,Errors,Warnings,Tested At\n';
  const csvRows = results
    .map((r) => `"${r.url}","${r.domain}",${r.passed},${r.loadTimeMs},${r.httpStatus},"${r.errors.join('; ')}","${r.warnings.join('; ')}","${r.testedAt}"`)
    .join('\n');

  await fsp.writeFile(config.output.resultsCsv, csvHeader + csvRows, 'utf-8');

  // Print summary
  const lines: string[] = [];
  lines.push('');
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('              Viking Pricing Page Monitor Results');
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push(`  Total Tested:  ${results.length}`);
  lines.push(`  PASSED:        ${passedResults.length}`);
  lines.push(`  FAILED:        ${failedResults.length}`);
  lines.push(`  Avg Load:      ${Math.round(summary.avgLoadTimeMs)}ms`);
  lines.push('═══════════════════════════════════════════════════════════════');

  if (passedResults.length > 0) {
    lines.push('');
    lines.push(`PASSED URLs: ${passedResults.length} URLs passed all checks`);
    const maxToShow = 10;
    if (passedResults.length <= maxToShow) {
      for (const r of passedResults) {
        lines.push(`   ✓ ${r.url}`);
      }
    } else {
      for (let i = 0; i < maxToShow; i++) {
        lines.push(`   ✓ ${passedResults[i].url}`);
      }
      lines.push(`   ... and ${passedResults.length - maxToShow} more passed URLs`);
    }
  }

  if (failedResults.length > 0) {
    lines.push('');
    lines.push('FAILED URLs (grouped by error type):');

    const errorGroups: Map<string, PricingPageResult[]> = new Map();
    for (const r of failedResults) {
      let errorType = 'Other';
      const errorStr = r.errors.join(', ');

      if (errorStr.includes('HTTP 404')) errorType = 'HTTP 404 (Page Not Found)';
      else if (errorStr.includes('HTTP 5')) errorType = 'HTTP 5xx (Server Error)';
      else if (errorStr.includes('Unavailable panel visible')) errorType = 'Pricing Unavailable (Call for fares)';
      else if (errorStr.includes('No departure dates')) errorType = 'No Departure Dates';
      else if (errorStr.includes('No valid prices')) errorType = 'No Valid Prices';
      else if (errorStr.includes('timeout') || errorStr.includes('Timeout')) errorType = 'Page Load Timeout';

      if (!errorGroups.has(errorType)) errorGroups.set(errorType, []);
      errorGroups.get(errorType)!.push(r);
    }

    const sortedGroups = Array.from(errorGroups.entries()).sort((a, b) => b[1].length - a[1].length);

    for (const [errorType, urls] of sortedGroups) {
      lines.push('');
      lines.push(`   [${errorType}] (${urls.length} URLs):`);
      for (const r of urls) {
        lines.push(`      - ${r.url}`);
      }
    }
  }

  lines.push('');
  lines.push('───────────────────────────────────────────────────────────────');
  lines.push(`Full results: ${config.output.resultsJson}`);
  lines.push(`CSV export:   ${config.output.resultsCsv}`);
  lines.push('───────────────────────────────────────────────────────────────');

  console.log(lines.join('\n'));
}
