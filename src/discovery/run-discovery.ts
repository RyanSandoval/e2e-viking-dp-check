#!/usr/bin/env tsx
/**
 * Run URL Discovery
 *
 * Discovers all pricing page URLs from Viking domains using:
 * 1. Sitemap crawling
 * 2. Link-based crawling (optional)
 *
 * Usage:
 *   npm run discover
 *   npm run discover -- --include-link-crawl
 */

import { SitemapCrawler } from './sitemap-crawler.js';
import { LinkCrawler } from './link-crawler.js';
import { ManifestManager } from './url-manifest.js';

interface DiscoveryOptions {
  includeLinkCrawl: boolean;
  maxLinkCrawlPages: number;
}

async function runDiscovery(options: DiscoveryOptions): Promise<void> {
  console.log('═══════════════════════════════════════════════════════');
  console.log('       Viking Pricing Page URL Discovery');
  console.log('═══════════════════════════════════════════════════════\n');

  const manifestManager = new ManifestManager();

  // Phase 1: Sitemap Discovery
  console.log('Phase 1: Sitemap Discovery');
  console.log('───────────────────────────────────────────────────────');
  const sitemapCrawler = new SitemapCrawler();
  const sitemapUrls = await sitemapCrawler.discoverPricingUrls();

  let allUrls = [...sitemapUrls];

  // Phase 2: Link Crawling (optional)
  if (options.includeLinkCrawl) {
    console.log('\nPhase 2: Link-based Discovery');
    console.log('───────────────────────────────────────────────────────');
    const linkCrawler = new LinkCrawler();
    const linkUrls = await linkCrawler.discoverPricingUrls({
      maxPages: options.maxLinkCrawlPages,
      maxDepth: 3,
    });

    // Merge URLs from both sources
    allUrls = manifestManager.mergeUrls(sitemapUrls, linkUrls);
  }

  // Create and save manifest
  console.log('\n───────────────────────────────────────────────────────');
  const manifest = manifestManager.createManifest(allUrls);
  await manifestManager.saveManifest(manifest);

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('                    Discovery Complete');
  console.log('═══════════════════════════════════════════════════════');
}

// Parse command line arguments
function parseArgs(): DiscoveryOptions {
  const args = process.argv.slice(2);

  return {
    includeLinkCrawl: args.includes('--include-link-crawl'),
    maxLinkCrawlPages: parseInt(
      args.find((a) => a.startsWith('--max-pages='))?.split('=')[1] || '100',
      10
    ),
  };
}

// Main entry point
runDiscovery(parseArgs()).catch((error) => {
  console.error('\n❌ Discovery failed:', error);
  process.exit(1);
});
