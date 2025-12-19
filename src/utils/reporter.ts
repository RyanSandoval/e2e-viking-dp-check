/**
 * Custom Reporter - Handles test results and notifications
 *
 * Features:
 * - JSON/CSV result generation
 * - Slack webhook integration
 * - Summary statistics
 */

import * as fs from 'fs/promises';
import config from '../config.js';

export interface TestResult {
  url: string;
  domain: string;
  passed: boolean;
  loadTimeMs: number;
  httpStatus: number;
  checks: {
    name: string;
    passed: boolean;
    details?: string;
  }[];
  errors: string[];
  warnings: string[];
  screenshotPath?: string;
  testedAt: string;
}

export interface TestSummary {
  runAt: string;
  totalTested: number;
  passed: number;
  failed: number;
  warnings: number;
  avgLoadTimeMs: number;
  results: TestResult[];
}

export class Reporter {
  /**
   * Generate summary from test results
   */
  generateSummary(results: TestResult[]): TestSummary {
    return {
      runAt: new Date().toISOString(),
      totalTested: results.length,
      passed: results.filter((r) => r.passed).length,
      failed: results.filter((r) => !r.passed).length,
      warnings: results.filter((r) => r.warnings.length > 0).length,
      avgLoadTimeMs:
        results.reduce((sum, r) => sum + r.loadTimeMs, 0) / results.length || 0,
      results,
    };
  }

  /**
   * Write results to JSON file
   */
  async writeJsonReport(summary: TestSummary): Promise<void> {
    await fs.writeFile(
      config.output.resultsJson,
      JSON.stringify(summary, null, 2),
      'utf-8'
    );
    console.log(`📄 JSON report written to: ${config.output.resultsJson}`);
  }

  /**
   * Write results to CSV file
   */
  async writeCsvReport(summary: TestSummary): Promise<void> {
    const header = [
      'URL',
      'Domain',
      'Passed',
      'Load Time (ms)',
      'HTTP Status',
      'Errors',
      'Warnings',
      'Tested At',
    ].join(',');

    const rows = summary.results.map((r) =>
      [
        `"${r.url}"`,
        `"${r.domain}"`,
        r.passed,
        r.loadTimeMs,
        r.httpStatus,
        `"${r.errors.join('; ')}"`,
        `"${r.warnings.join('; ')}"`,
        `"${r.testedAt}"`,
      ].join(',')
    );

    await fs.writeFile(
      config.output.resultsCsv,
      [header, ...rows].join('\n'),
      'utf-8'
    );
    console.log(`📄 CSV report written to: ${config.output.resultsCsv}`);
  }

  /**
   * Post summary to Slack webhook
   */
  async postToSlack(summary: TestSummary): Promise<void> {
    const webhookUrl = config.slackWebhookUrl;

    if (!webhookUrl) {
      console.log('⚠️  No Slack webhook configured, skipping notification');
      return;
    }

    const statusEmoji = summary.failed === 0 ? '✅' : '🚨';
    const failedUrls = summary.results
      .filter((r) => !r.passed)
      .slice(0, 5) // Limit to first 5 failures
      .map((r) => `• <${r.url}|${new URL(r.url).pathname}>: ${r.errors.join(', ')}`);

    const message = {
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `${statusEmoji} Viking Pricing Page Monitor`,
            emoji: true,
          },
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Total Tested:*\n${summary.totalTested}`,
            },
            {
              type: 'mrkdwn',
              text: `*Passed:*\n${summary.passed}`,
            },
            {
              type: 'mrkdwn',
              text: `*Failed:*\n${summary.failed}`,
            },
            {
              type: 'mrkdwn',
              text: `*Avg Load Time:*\n${Math.round(summary.avgLoadTimeMs)}ms`,
            },
          ],
        },
      ],
    };

    // Add failed URLs section if there are failures
    if (failedUrls.length > 0) {
      message.blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Failed Pages:*\n${failedUrls.join('\n')}${summary.failed > 5 ? `\n_...and ${summary.failed - 5} more_` : ''}`,
        },
      } as any);
    }

    // Add timestamp
    message.blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Run at: ${new Date(summary.runAt).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })} PT`,
        },
      ],
    } as any);

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      });

      if (response.ok) {
        console.log('📤 Slack notification sent successfully');
      } else {
        console.error(`❌ Slack notification failed: ${response.status}`);
      }
    } catch (error) {
      console.error('❌ Failed to send Slack notification:', error);
    }
  }

  /**
   * Print summary to console
   */
  printSummary(summary: TestSummary): void {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('           Viking Pricing Page Monitor Results');
    console.log('═══════════════════════════════════════════════════════\n');

    console.log(`📊 Summary:`);
    console.log(`   Total Tested: ${summary.totalTested}`);
    console.log(`   ✅ Passed:    ${summary.passed}`);
    console.log(`   ❌ Failed:    ${summary.failed}`);
    console.log(`   ⚠️  Warnings:  ${summary.warnings}`);
    console.log(`   ⏱️  Avg Load:  ${Math.round(summary.avgLoadTimeMs)}ms`);

    if (summary.failed > 0) {
      console.log('\n❌ Failed Pages:');
      for (const result of summary.results.filter((r) => !r.passed)) {
        console.log(`\n   ${result.url}`);
        console.log(`   Errors: ${result.errors.join(', ')}`);
        if (result.screenshotPath) {
          console.log(`   Screenshot: ${result.screenshotPath}`);
        }
      }
    }

    console.log('\n═══════════════════════════════════════════════════════\n');
  }
}

export default Reporter;
