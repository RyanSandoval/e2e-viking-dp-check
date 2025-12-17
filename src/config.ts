/**
 * Viking Pricing Page Monitor - Configuration
 */

export interface VikingConfig {
  /** Target domains to monitor */
  domains: DomainConfig[];

  /** URL patterns to match for pricing pages */
  pricingPagePatterns: RegExp[];

  /** Known sitemap locations */
  sitemapUrls: string[];

  /** Maximum concurrent requests during discovery */
  maxConcurrentDiscovery: number;

  /** Maximum concurrent tests */
  maxConcurrentTests: number;

  /** Request timeout in milliseconds */
  requestTimeout: number;

  /** Page load timeout in milliseconds */
  pageLoadTimeout: number;

  /** Output paths */
  output: {
    manifestFile: string;
    resultsJson: string;
    resultsCsv: string;
    screenshotsDir: string;
  };

  /** Slack webhook URL (optional) */
  slackWebhookUrl?: string;
}

export interface DomainConfig {
  name: string;
  baseUrl: string;
  enabled: boolean;
  notes?: string;
}

export const config: VikingConfig = {
  domains: [
    {
      name: 'Viking Main',
      baseUrl: 'https://www.viking.com',
      enabled: true,
    },
    {
      name: 'Viking Cruises (Oceans/Expeditions)',
      baseUrl: 'https://www.vikingcruises.com',
      enabled: true,
    },
    {
      name: 'Viking River Cruises',
      baseUrl: 'https://www.vikingrivercruises.com',
      enabled: true,
      notes: 'May redirect to viking.com - verify behavior',
    },
  ],

  // Patterns to identify pricing pages
  pricingPagePatterns: [
    /\/pricing\.html$/i,
    /\/pricing$/i,
    /\/prices\.html$/i,
  ],

  // Known sitemap locations
  sitemapUrls: [
    'https://www.viking.com/sitemap.xml',
    'https://www.vikingcruises.com/sitemap.xml',
    'https://www.vikingrivercruises.com/sitemap.xml',
  ],

  maxConcurrentDiscovery: 5,
  maxConcurrentTests: 10,
  requestTimeout: 10000,
  pageLoadTimeout: 10000,

  output: {
    manifestFile: 'pricing-urls.json',
    resultsJson: 'results.json',
    resultsCsv: 'results.csv',
    screenshotsDir: 'screenshots',
  },

  // Set via environment variable: SLACK_WEBHOOK_URL
  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
};

export default config;
