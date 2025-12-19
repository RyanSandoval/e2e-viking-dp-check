/**
 * Sitemap Crawler - Discovers pricing URLs from Viking sitemaps
 *
 * Handles:
 * - Local sitemap.xml files (preferred)
 * - Remote sitemap.xml fetching (fallback)
 * - Sitemap index files (nested sitemaps)
 * - URL filtering for pricing pages
 */

import * as fs from 'fs/promises';
import * as path from 'path';
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
   * Checks local files first, then falls back to remote URLs
   */
  async discoverPricingUrls(): Promise<DiscoveredUrl[]> {
    console.log('🔍 Starting URL discovery from sitemaps...\n');

    // First, try local sitemap files
    const localSitemaps = await this.findLocalSitemaps();

    if (localSitemaps.length > 0) {
      console.log(`📂 Found ${localSitemaps.length} local sitemap file(s)\n`);

      for (const localPath of localSitemaps) {
        try {
          console.log(`📄 Processing local: ${localPath}`);
          await this.processLocalSitemap(localPath);
        } catch (error) {
          console.error(`❌ Failed to process ${localPath}:`, error);
        }
      }
    } else {
      console.log('📂 No local sitemaps found, trying remote URLs...\n');

      // Fall back to remote URLs
      for (const sitemapUrl of config.sitemapUrls) {
        try {
          console.log(`📄 Processing remote: ${sitemapUrl}`);
          await this.processRemoteSitemap(sitemapUrl);
        } catch (error) {
          console.error(`❌ Failed to process ${sitemapUrl}:`, error);
        }
      }
    }

    const urls = Array.from(this.discoveredUrls.values());
    console.log(`\n✅ Discovery complete. Found ${urls.length} pricing URLs.`);

    return urls;
  }

  /**
   * Find all local sitemap XML files in the sitemaps directory
   */
  private async findLocalSitemaps(): Promise<string[]> {
    const sitemapDir = config.localSitemapDir;
    const sitemaps: string[] = [];

    try {
      const files = await fs.readdir(sitemapDir);

      for (const file of files) {
        if (file.endsWith('.xml')) {
          sitemaps.push(path.join(sitemapDir, file));
        }
      }
    } catch {
      // Directory doesn't exist or is not readable
    }

    return sitemaps.sort();
  }

  /**
   * Process a local sitemap file
   */
  private async processLocalSitemap(filePath: string): Promise<void> {
    if (this.visitedSitemaps.has(filePath)) {
      return;
    }
    this.visitedSitemaps.add(filePath);

    try {
      const xml = await fs.readFile(filePath, 'utf-8');
      const parsed = this.parser.parse(xml);

      // Check if it's a sitemap index
      if (parsed.sitemapindex) {
        await this.processSitemapIndex(parsed.sitemapindex, filePath);
      }

      // Check if it's a urlset
      if (parsed.urlset) {
        this.processUrlset(parsed.urlset, filePath);
      }
    } catch (error) {
      console.error(`  ❌ Error processing ${filePath}:`, error);
    }
  }

  /**
   * Process a remote sitemap URL
   */
  private async processRemoteSitemap(sitemapUrl: string): Promise<void> {
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
   * For local files, looks for referenced sitemaps locally first
   */
  private async processSitemapIndex(
    sitemapIndex: { sitemap: SitemapIndex | SitemapIndex[] },
    parentSource: string
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
          if (!loc) return;

          // If parent is local, try to find referenced sitemap locally
          if (!parentSource.startsWith('http')) {
            const localPath = this.resolveLocalSitemap(loc);
            if (localPath) {
              await this.processLocalSitemap(localPath);
              return;
            }
          }

          // Fall back to remote
          await this.processRemoteSitemap(loc);
        })
      );
    }
  }

  /**
   * Try to resolve a sitemap URL to a local file path
   */
  private resolveLocalSitemap(url: string): string | null {
    try {
      const urlObj = new URL(url);
      const filename = path.basename(urlObj.pathname);
      const localPath = path.join(config.localSitemapDir, filename);

      // We'll check if it exists when we try to read it
      return localPath;
    } catch {
      return null;
    }
  }

  /**
   * Process a urlset and extract pricing page URLs
   */
  private processUrlset(
    urlset: { url: SitemapUrl | SitemapUrl[] },
    source: string
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
      console.log(`  ✓ Found ${pricingCount} pricing URLs in ${path.basename(source)}`);
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
