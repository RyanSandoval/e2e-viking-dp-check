/**
 * URL Manifest - Manages the discovered pricing URLs
 *
 * Handles:
 * - Merging URLs from different sources
 * - Persisting to/loading from JSON
 * - URL deduplication and validation
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import config from '../config.js';
import { DiscoveredUrl } from './sitemap-crawler.js';

export interface UrlManifest {
  version: string;
  generatedAt: string;
  totalUrls: number;
  byDomain: Record<string, number>;
  bySource: Record<string, number>;
  urls: DiscoveredUrl[];
}

export class ManifestManager {
  private manifestPath: string;

  constructor(manifestPath?: string) {
    this.manifestPath = manifestPath || config.output.manifestFile;
  }

  /**
   * Create a manifest from discovered URLs
   */
  createManifest(urls: DiscoveredUrl[]): UrlManifest {
    // Deduplicate by URL
    const uniqueUrls = this.deduplicateUrls(urls);

    // Count by domain
    const byDomain: Record<string, number> = {};
    for (const url of uniqueUrls) {
      byDomain[url.domain] = (byDomain[url.domain] || 0) + 1;
    }

    // Count by source
    const bySource: Record<string, number> = {};
    for (const url of uniqueUrls) {
      bySource[url.source] = (bySource[url.source] || 0) + 1;
    }

    return {
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      totalUrls: uniqueUrls.length,
      byDomain,
      bySource,
      urls: uniqueUrls,
    };
  }

  /**
   * Save manifest to file
   */
  async saveManifest(manifest: UrlManifest): Promise<void> {
    const dir = path.dirname(this.manifestPath);
    if (dir !== '.') {
      await fs.mkdir(dir, { recursive: true });
    }

    await fs.writeFile(this.manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

    console.log(`\n📝 Manifest saved to: ${this.manifestPath}`);
    console.log(`   Total URLs: ${manifest.totalUrls}`);
    console.log('   By domain:');
    for (const [domain, count] of Object.entries(manifest.byDomain)) {
      console.log(`     - ${domain}: ${count}`);
    }
  }

  /**
   * Load manifest from file
   */
  async loadManifest(): Promise<UrlManifest> {
    try {
      const content = await fs.readFile(this.manifestPath, 'utf-8');
      return JSON.parse(content) as UrlManifest;
    } catch (error) {
      throw new Error(`Failed to load manifest from ${this.manifestPath}: ${error}`);
    }
  }

  /**
   * Check if manifest exists
   */
  async manifestExists(): Promise<boolean> {
    try {
      await fs.access(this.manifestPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Merge multiple URL arrays, preserving the most recent discovery
   */
  mergeUrls(...urlArrays: DiscoveredUrl[][]): DiscoveredUrl[] {
    const merged = new Map<string, DiscoveredUrl>();

    for (const urls of urlArrays) {
      for (const url of urls) {
        const existing = merged.get(url.url);
        if (
          !existing ||
          new Date(url.discoveredAt) > new Date(existing.discoveredAt)
        ) {
          merged.set(url.url, url);
        }
      }
    }

    return Array.from(merged.values());
  }

  /**
   * Deduplicate URLs by URL string
   */
  private deduplicateUrls(urls: DiscoveredUrl[]): DiscoveredUrl[] {
    const seen = new Map<string, DiscoveredUrl>();

    for (const url of urls) {
      // Normalize URL (remove trailing slashes, etc.)
      const normalized = this.normalizeUrl(url.url);

      if (!seen.has(normalized)) {
        seen.set(normalized, { ...url, url: normalized });
      }
    }

    return Array.from(seen.values()).sort((a, b) => a.url.localeCompare(b.url));
  }

  /**
   * Normalize URL for deduplication
   */
  private normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      // Remove trailing slash except for root
      if (parsed.pathname !== '/' && parsed.pathname.endsWith('/')) {
        parsed.pathname = parsed.pathname.slice(0, -1);
      }
      // Remove default ports
      parsed.port = '';
      // Sort query params
      parsed.searchParams.sort();
      return parsed.toString();
    } catch {
      return url;
    }
  }
}

export default ManifestManager;
