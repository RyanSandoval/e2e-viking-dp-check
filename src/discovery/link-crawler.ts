/**
 * Link Crawler - Discovers pricing URLs by crawling destination pages
 *
 * Complements sitemap discovery by:
 * - Starting from destination index pages
 * - Following links to individual cruise pages
 * - Extracting pricing URLs from page links
 */

import { chromium, Browser, Page } from 'playwright';
import config from '../config.js';
import { DiscoveredUrl } from './sitemap-crawler.js';

export interface CrawlOptions {
  maxPages?: number;
  maxDepth?: number;
  followExternalLinks?: boolean;
}

export class LinkCrawler {
  private discoveredUrls: Map<string, DiscoveredUrl> = new Map();
  private visitedPages: Set<string> = new Set();
  private browser: Browser | null = null;

  /**
   * Known starting points for destination/cruise pages
   */
  private readonly seedUrls = [
    // Viking main site - cruise types
    'https://www.viking.com/cruises',
    'https://www.viking.com/oceans',
    'https://www.viking.com/rivers',
    'https://www.viking.com/expeditions',
    // Destinations
    'https://www.viking.com/cruise-destinations',
    // Viking Cruises site
    'https://www.vikingcruises.com/cruises',
    'https://www.vikingcruises.com/oceans',
    'https://www.vikingcruises.com/expeditions',
  ];

  /**
   * Crawl from seed URLs to discover pricing pages
   */
  async discoverPricingUrls(options: CrawlOptions = {}): Promise<DiscoveredUrl[]> {
    const { maxPages = 100, maxDepth = 3 } = options;

    console.log('🕷️  Starting link-based URL discovery...\n');

    try {
      this.browser = await chromium.launch({ headless: true });

      for (const seedUrl of this.seedUrls) {
        if (this.visitedPages.size >= maxPages) break;

        try {
          console.log(`🌱 Crawling from: ${seedUrl}`);
          await this.crawlPage(seedUrl, 0, maxDepth, maxPages);
        } catch (error) {
          console.error(`  ❌ Failed to crawl ${seedUrl}:`, error);
        }
      }
    } finally {
      if (this.browser) {
        await this.browser.close();
      }
    }

    const urls = Array.from(this.discoveredUrls.values());
    console.log(`\n✅ Link crawl complete. Found ${urls.length} pricing URLs.`);

    return urls;
  }

  /**
   * Crawl a single page and extract pricing links
   */
  private async crawlPage(
    url: string,
    depth: number,
    maxDepth: number,
    maxPages: number
  ): Promise<void> {
    // Skip if already visited or at max pages
    if (this.visitedPages.has(url) || this.visitedPages.size >= maxPages) {
      return;
    }

    // Skip non-Viking domains
    const urlObj = new URL(url);
    if (!this.isVikingDomain(urlObj.hostname)) {
      return;
    }

    this.visitedPages.add(url);

    // Check if this URL itself is a pricing page
    if (this.isPricingUrl(url)) {
      this.addDiscoveredUrl(url);
    }

    // Stop if at max depth
    if (depth >= maxDepth) {
      return;
    }

    const page = await this.browser!.newPage();

    try {
      // Set timeout and navigate
      page.setDefaultTimeout(config.requestTimeout);
      await page.goto(url, { waitUntil: 'domcontentloaded' });

      // Extract all links
      const links = await this.extractLinks(page);

      // Process links
      for (const link of links) {
        if (this.visitedPages.size >= maxPages) break;

        if (this.isPricingUrl(link)) {
          this.addDiscoveredUrl(link);
        } else if (this.shouldFollowLink(link, depth, maxDepth)) {
          // Follow cruise/destination pages to find more pricing links
          await this.crawlPage(link, depth + 1, maxDepth, maxPages);
        }
      }
    } catch (error) {
      // Page load failures are expected for some URLs
      console.log(`  ⚠️  Could not load: ${url}`);
    } finally {
      await page.close();
    }
  }

  /**
   * Extract all links from a page
   */
  private async extractLinks(page: Page): Promise<string[]> {
    try {
      const links = await page.evaluate(() => {
        const anchors = document.querySelectorAll('a[href]');
        return Array.from(anchors)
          .map((a) => (a as HTMLAnchorElement).href)
          .filter((href) => href.startsWith('http'));
      });
      return links;
    } catch {
      return [];
    }
  }

  /**
   * Check if URL is a pricing page
   */
  private isPricingUrl(url: string): boolean {
    return config.pricingPagePatterns.some((pattern) => pattern.test(url));
  }

  /**
   * Check if hostname is a Viking domain
   */
  private isVikingDomain(hostname: string): boolean {
    return (
      hostname.includes('viking.com') ||
      hostname.includes('vikingcruises.com') ||
      hostname.includes('vikingrivercruises.com')
    );
  }

  /**
   * Determine if we should follow a link for further crawling
   */
  private shouldFollowLink(url: string, depth: number, maxDepth: number): boolean {
    if (depth >= maxDepth - 1) return false;

    const urlObj = new URL(url);
    if (!this.isVikingDomain(urlObj.hostname)) return false;

    // Follow cruise-related paths that might lead to pricing pages
    const cruisePathPatterns = [
      /\/cruises?\//i,
      /\/oceans?\//i,
      /\/rivers?\//i,
      /\/expeditions?\//i,
      /\/destinations?\//i,
      /\/itinerar/i,
      /\/voyage/i,
    ];

    return cruisePathPatterns.some((pattern) => pattern.test(url));
  }

  /**
   * Add a discovered URL to the map
   */
  private addDiscoveredUrl(url: string): void {
    if (!this.discoveredUrls.has(url)) {
      const domain = new URL(url).hostname;
      this.discoveredUrls.set(url, {
        url,
        source: 'crawl',
        domain,
        discoveredAt: new Date().toISOString(),
      });
      console.log(`  ✓ Found pricing URL: ${url}`);
    }
  }
}

export default LinkCrawler;
