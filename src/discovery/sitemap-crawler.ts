/**
 * Sitemap Crawler - Discovers pricing URLs from Viking sitemaps
 *
 * Handles:
 * - Main sitemap.xml parsing
 * - Sitemap index files (nested sitemaps)
 * - URL filtering for pricing pages
 * - Redirect detection
 */

import { XMLParser } from 'fast-xml-parser';
import config from '../config.js';

export interface DiscoveredUrl {
  url: string;
  source: 'sitemap' | 'crawl';
  domain: string;
  lastModified?: string;
  discoveredAt: string;
}

export interface SitemapUrl {
  loc: string;
  lastmod?: string;
  changefreq?: string;
  priority?: string;
}

export interface SitemapIndex {
  loc: string;
  lastmod?: string;
}

export class SitemapCrawler {
  private parser: XMLParser;
  private discoveredUrls: Map<string, DiscoveredUrl> = new Map();
  private visitedSitemaps: Set<string> = new Set();

  constructor() {
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
    });
  }

  /**
   * Crawl all configured sitemaps and discover pricing URLs
   */
  async discoverPricingUrls(): Promise<DiscoveredUrl[]> {
    console.log('🔍 Starting URL discovery from sitemaps...\n');

    for (const sitemapUrl of config.sitemapUrls) {
      try {
        console.log(`📄 Processing: ${sitemapUrl}`);
        await this.processSitemap(sitemapUrl);
      } catch (error) {
        console.error(`❌ Failed to process ${sitemapUrl}:`, error);
      }
    }

    const urls = Array.from(this.discoveredUrls.values());
    console.log(`\n✅ Discovery complete. Found ${urls.length} pricing URLs.`);

    return urls;
  }

  /**
   * Process a single sitemap (handles both index and urlset)
   */
  private async processSitemap(sitemapUrl: string): Promise<void> {
    if (this.visitedSitemaps.has(sitemapUrl)) {
      return;
    }
    this.visitedSitemaps.add(sitemapUrl);

    try {
      const response = await this.fetchWithTimeout(sitemapUrl);

      if (!response.ok) {
        console.warn(`  ⚠️  HTTP ${response.status} for ${sitemapUrl}`);
        return;
      }

      const xml = await response.text();
      const parsed = this.parser.parse(xml);

      // Check if it's a sitemap index
      if (parsed.sitemapindex) {
        await this.processSitemapIndex(parsed.sitemapindex, sitemapUrl);
      }

      // Check if it's a urlset
      if (parsed.urlset) {
        this.processUrlset(parsed.urlset, sitemapUrl);
      }
    } catch (error) {
      console.error(`  ❌ Error processing ${sitemapUrl}:`, error);
    }
  }

  /**
   * Process a sitemap index file (contains references to other sitemaps)
   */
  private async processSitemapIndex(
    sitemapIndex: { sitemap: SitemapIndex | SitemapIndex[] },
    parentUrl: string
  ): Promise<void> {
    const sitemaps = Array.isArray(sitemapIndex.sitemap)
      ? sitemapIndex.sitemap
      : [sitemapIndex.sitemap];

    console.log(`  📁 Found sitemap index with ${sitemaps.length} child sitemaps`);

    // Process child sitemaps with concurrency limit
    const chunks = this.chunk(sitemaps, config.maxConcurrentDiscovery);

    for (const chunk of chunks) {
      await Promise.all(
        chunk.map(async (sitemap) => {
          const loc = typeof sitemap === 'string' ? sitemap : sitemap.loc;
          if (loc) {
            await this.processSitemap(loc);
          }
        })
      );
    }
  }

  /**
   * Process a urlset and extract pricing page URLs
   */
  private processUrlset(
    urlset: { url: SitemapUrl | SitemapUrl[] },
    sitemapUrl: string
  ): void {
    const urls = Array.isArray(urlset.url) ? urlset.url : [urlset.url];

    let pricingCount = 0;

    for (const urlEntry of urls) {
      const loc = typeof urlEntry === 'string' ? urlEntry : urlEntry.loc;
      if (!loc) continue;

      // Check if this matches a pricing page pattern
      if (this.isPricingUrl(loc)) {
        const domain = new URL(loc).hostname;

        this.discoveredUrls.set(loc, {
          url: loc,
          source: 'sitemap',
          domain,
          lastModified: typeof urlEntry === 'object' ? urlEntry.lastmod : undefined,
          discoveredAt: new Date().toISOString(),
        });

        pricingCount++;
      }
    }

    if (pricingCount > 0) {
      console.log(`  ✓ Found ${pricingCount} pricing URLs in ${sitemapUrl}`);
    }
  }

  /**
   * Check if a URL matches pricing page patterns
   */
  private isPricingUrl(url: string): boolean {
    return config.pricingPagePatterns.some((pattern) => pattern.test(url));
  }

  /**
   * Fetch with timeout
   */
  private async fetchWithTimeout(
    url: string,
    timeout: number = config.requestTimeout
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Viking-Pricing-Monitor/1.0 (Automated Testing)',
          Accept: 'application/xml, text/xml, */*',
        },
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Split array into chunks for concurrency control
   */
  private chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}

export default SitemapCrawler;
