/**
 * application-agent.service.ts
 *
 * Semi-autonomous agent that processes the job application queue
 * for LinkedIn and Indeed with rate limiting and human behavior simulation.
 *
 * Constraints:
 *   - Max. 8 applications per hour (configurable: MAX_PER_HOUR)
 *   - Random 2–8 min pause between applications
 *   - Only operates during business hours 9am–5pm (Toronto / America/Toronto)
 *   - Simulates natural scrolling and random delays between actions
 *
 * @module ApplicationAgentService
 */

import type { Pool } from 'pg';
import path from 'path';
import fs from 'fs';

export type AgentStatus = 'idle' | 'running' | 'stopped';

export interface AgentState {
  status: AgentStatus;
  startedAt: string | null;
  currentJobId: string | null;
  appliedLastHour: number;
  appliedToday: number;
  nextRunAt: string | null;
  lastError: string | null;
}

export interface QueueStats {
  appliedLastHour: number;
  appliedToday: number;
  byStatus: Record<string, number>;
}

// ─────────────────────────────────────────────────────────────────────────────

export class ApplicationAgentService {
  private static state: AgentState = {
    status: 'idle',
    startedAt: null,
    currentJobId: null,
    appliedLastHour: 0,
    appliedToday: 0,
    nextRunAt: null,
    lastError: null,
  };

  private static pool: Pool | null = null;
  private static stopRequested = false;

  // ── Configuration (can be overridden via env vars) ──────────────────────
  static get MAX_PER_HOUR() { return parseInt(process.env.AGENT_MAX_PER_HOUR || '8'); }
  static readonly MIN_DELAY_MS = 2 * 60_000;   // 2 minutes
  static readonly MAX_DELAY_MS = 8 * 60_000;   // 8 minutes
  static readonly BUSINESS_START = 9;           // 9:00 AM Toronto
  static readonly BUSINESS_END   = 17;          // 5:00 PM Toronto
  static readonly TIMEZONE       = 'America/Toronto';

  // ── Public API ────────────────────────────────────────────────────────────

  static getState(): AgentState {
    return { ...this.state };
  }

  /**
   * Checks if the current time falls within configured business hours.
   * Uses America/Toronto timezone.
   * Can be bypassed via AGENT_SKIP_HOURS=true env var (dev/testing only).
   */
  static isBusinessHours(): boolean {
    // SECURITY: Remove this bypass in production
    if (process.env.AGENT_SKIP_HOURS === 'true') return true;

    const fmt = new Intl.DateTimeFormat('en-CA', {
      hour: 'numeric', hour12: false, timeZone: this.TIMEZONE,
    });
    const hour = parseInt(fmt.format(new Date()));
    return hour >= this.BUSINESS_START && hour < this.BUSINESS_END;
  }

  static async getStats(pool: Pool): Promise<QueueStats> {
    const [hourRes, todayRes, byStatusRes] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM application_queue WHERE status='applied' AND applied_at > NOW() - INTERVAL '1 hour'`),
      pool.query(`SELECT COUNT(*) FROM application_queue WHERE status='applied' AND applied_at >= CURRENT_DATE`),
      pool.query(`SELECT status, COUNT(*) as cnt FROM application_queue GROUP BY status`),
    ]);
    return {
      appliedLastHour: parseInt(hourRes.rows[0].count),
      appliedToday:    parseInt(todayRes.rows[0].count),
      byStatus: Object.fromEntries(
        byStatusRes.rows.map((r: any) => [r.status, parseInt(r.cnt)])
      ),
    };
  }

  /**
   * Starts the agent loop in the background.
   * Throws if the agent is already running.
   * @param pool - Database connection pool
   */
  static async start(pool: Pool): Promise<void> {
    if (this.state.status === 'running') {
      throw new Error('Agent is already running.');
    }
    this.pool         = pool;
    this.stopRequested = false;
    this.state         = {
      ...this.state,
      status: 'running',
      startedAt: new Date().toISOString(),
      lastError: null,
      nextRunAt: null,
    };

    // Runs in background — does not block the main thread
    this.runLoop().catch(err => {
      this.state.status    = 'stopped';
      this.state.lastError = err.message;
      console.error('[Agent] Fatal loop error:', err.message);
    });
  }

  static stop(): void {
    this.stopRequested    = true;
    this.state.status     = 'stopped';
    this.state.nextRunAt  = null;
    console.log('[Agent] Detención solicitada.');
  }

  // ── Main loop ─────────────────────────────────────────────────────────────

  private static async runLoop(): Promise<void> {
    console.log('[Agent] Loop iniciado.');

    while (!this.stopRequested) {
      try {
        // 1. Check business hours
        if (!this.isBusinessHours()) {
          this.state.nextRunAt = this.nextBusinessHourISO();
          console.log(`[Agent] Outside business hours. Next check: ${this.state.nextRunAt}`);
          await sleep(60_000);
          continue;
        }

        // 2. Check rate limit
        const stats = await this.getStats(this.pool!);
        this.state.appliedLastHour = stats.appliedLastHour;
        this.state.appliedToday    = stats.appliedToday;

        if (stats.appliedLastHour >= this.MAX_PER_HOUR) {
          console.log(`[Agent] Rate limit reached (${stats.appliedLastHour}/${this.MAX_PER_HOUR}/hr). Waiting 10 min...`);
          this.state.nextRunAt = new Date(Date.now() + 10 * 60_000).toISOString();
          await sleep(10 * 60_000);
          continue;
        }

        // 3. Fetch next queue item
        const { rows } = await this.pool!.query<any>(`
          SELECT aq.id, aq.job_id, aq.priority,
                 j.url, j.title, j.source, j.service_type_id,
                 COALESCE(c.name, j.raw_company_name) as company_name
          FROM application_queue aq
          JOIN jobs j ON j.id = aq.job_id
          LEFT JOIN companies c ON c.id = j.company_id
          WHERE aq.status = 'queued'
          ORDER BY aq.priority DESC, aq.queued_at ASC
          LIMIT 1
        `);

        if (rows.length === 0) {
          this.state.nextRunAt = new Date(Date.now() + 5 * 60_000).toISOString();
          await sleep(5 * 60_000);
          continue;
        }

        // 4. Process item
        await this.processItem(rows[0]);

        // 5. Random delay before next application
        if (!this.stopRequested) {
          const delay = randInt(this.MIN_DELAY_MS, this.MAX_DELAY_MS);
          console.log(`[Agent] Next application in ${Math.round(delay / 60_000)} min.`);
          this.state.nextRunAt = new Date(Date.now() + delay).toISOString();
          await sleep(delay);
        }

      } catch (err: any) {
        console.error('[Agent] Loop error:', err.message);
        this.state.lastError = err.message;
        await sleep(30_000); // wait 30s before retrying
      }
    }

    this.state.status     = 'stopped';
    this.state.currentJobId = null;
    console.log('[Agent] Stopped.');
  }

  // ── Process One Queue Item ─────────────────────────────────────────────────

  /**
   * Processes a single queue item: launches a browser, navigates to the job,
   * and attempts to apply via LinkedIn or Indeed depending on source.
   * @param item - Queue item with job details
   */
  private static async processItem(item: any): Promise<void> {
    console.log(`[Agent] Processing: "${item.title}" @ ${item.company_name} [${item.source}]`);
    this.state.currentJobId = item.job_id;

    // Mark as "processing"
    await this.pool!.query(
      `UPDATE application_queue SET status='processing', started_at=NOW() WHERE id=$1`,
      [item.id]
    );

    // Load playwright (with stealth plugin if available)
    let chromium: any;
    try {
      // Try playwright-extra with stealth first
      try {
        const pe   = await import('playwright-extra');
        const spMod = await import('playwright-extra-plugin-stealth');
        chromium     = pe.chromium;
        const StealthPlugin = spMod.default ?? spMod;
        chromium.use(StealthPlugin());
      } catch {
        // Fall back to regular playwright
        const pw = await import('playwright');
        chromium = pw.chromium;
      }
    } catch (err: any) {
      await this.markFailed(item.id,
        'Playwright not available. Run: npm install playwright && npx playwright install chromium'
      );
      return;
    }

    let browser: any = null;
    try {
      browser = await chromium.launch({
        headless: true,                // headless mode to avoid display issues
        args: [
          '--disable-blink-features=AutomationControlled',
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
        ],
        slowMo: randInt(40, 100),      // small delay between actions
      });

      const ctx = await browser.newContext({
        viewport:   { width: 1280, height: 800 },
        locale:     'fr-CA',
        timezoneId: this.TIMEZONE,
      });

      const page = await ctx.newPage();

      // Remove webdriver fingerprint
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        (window as any).chrome = { runtime: {} };
      });

      // Apply based on platform
      let result: { success: boolean; reason?: string };

      if (item.source === 'linkedin') {
        result = await this.applyLinkedIn(page, item);
      } else if (item.source === 'indeed') {
        result = await this.applyIndeed(page, item);
      } else {
        result = { success: false, reason: `Source '${item.source}' not supported by agent` };
      }

      // Capture evidence screenshot
      const shotDir  = path.join('screenshots', 'applications');
      fs.mkdirSync(shotDir, { recursive: true });
      const shotPath = path.join(shotDir, `${item.id}-${Date.now()}.png`);
      await page.screenshot({ path: shotPath, fullPage: false }).catch(() => {});

      // Update DB status
      if (result.success) {
        await this.pool!.query(
          `UPDATE application_queue SET status='applied', applied_at=NOW(), notes='Applied by agent' WHERE id=$1`,
          [item.id]
        );
        console.log(`[Agent] ✅ Applied: "${item.title}"`);
      } else {
        const status = result.reason?.includes('CAPTCHA') ? 'captcha' : 'skipped';
        await this.pool!.query(
          `UPDATE application_queue SET status=$2, notes=$3 WHERE id=$1`,
          [item.id, status, result.reason ?? 'No reason specified']
        );
        console.log(`[Agent] ⏭️  ${status}: ${result.reason}`);
      }

    } catch (err: any) {
      await this.markFailed(item.id, err.message);
    } finally {
      this.state.currentJobId = null;
      if (browser) await browser.close().catch(() => {});
    }
  }

  // ── LinkedIn Easy Apply ───────────────────────────────────────────────────

  /**
   * Attempts to apply to a LinkedIn job via Easy Apply flow.
   * Navigates to the job page, finds the Easy Apply button,
   * iterates through modal steps, and handles CAPTCHA detection.
   * @param page - Playwright page object
   * @param item - Queue item with job URL
   */
  private static async applyLinkedIn(
    page: any, item: any
  ): Promise<{ success: boolean; reason?: string }> {

    await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await smallDelay(1500, 3000);
    await naturalScroll(page);

    // Check if authenticated
    const authWall = await page.$('[data-tracking-control-name*="authwall"], a[href*="authwall"]');
    if (authWall) {
      return { success: false, reason: 'LinkedIn session not active — log in to Chrome first' };
    }

    // Find Easy Apply button by analyzing the HTML
    const buttonInfo = await page.evaluate(() => {
      const applyKeywords = ['easy apply', 'solicitar', 'apply', 'postulate'];

      const buttons = Array.from(document.querySelectorAll('button, a, [role="button"]'));

      let bestMatch = null;
      let bestScore = 0;
      let bestSelector = null;

      for (const btn of buttons) {
        const text = (btn.textContent || '').toLowerCase().trim();
        const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
        const dataTestId = (btn.getAttribute('data-testid') || '').toLowerCase();
        const id = (btn.id || '').toLowerCase();
        const className = (btn.className || '').toLowerCase();

        let score = 0;

        // Prioriza "Easy Apply" (puntuación máxima)
        if (text.includes('easy apply') || ariaLabel.includes('easy apply')) score += 100;

        // Palabras clave de aplicación
        if (text.includes('apply') || ariaLabel.includes('apply') || dataTestId.includes('apply')) score += 10;
        if (text.includes('solicitar') || text.includes('postulate')) score += 10;
        if (text.includes('postularse')) score += 8;

        // Excluir botones de navegación
        if (text.match(/home|login|sign|register|save|share|report|message|contact|back|return|reviews/)) {
          continue;
        }

        // Priorizar botones destacados
        if (className.includes('primary') || className.includes('cta') || id.includes('apply')) score += 5;

        if (score > bestScore) {
          bestScore = score;
          bestMatch = btn;
          // Generar selector para el botón
          if (btn.id) {
            bestSelector = `#${btn.id}`;
          } else if (btn.className) {
            bestSelector = `${btn.tagName.toLowerCase()}.${btn.className.split(' ')[0]}`;
          } else {
            bestSelector = btn.tagName.toLowerCase();
          }
        }
      }

      return {
        found: !!bestMatch,
        selector: bestSelector,
        score: bestScore,
        text: bestMatch ? (bestMatch.textContent || '').substring(0, 50) : null,
      };
    });

    if (!buttonInfo.found || !buttonInfo.selector) {
      console.log('[Agent] DEBUG LinkedIn: No se encontró botón. Info:', JSON.stringify(buttonInfo));
      return { success: false, reason: 'No se encontró botón Easy Apply analizando el HTML. Puede requerir aplicación externa.' };
    }

    // Usar locator para hacer click (Playwright API correcta)
    try {
      const locator = page.locator(buttonInfo.selector).first();
      await locator.click();
    } catch (err: any) {
      // If selector fails, try a broader search
      try {
        await page.click('button:has-text("Easy Apply"), button:has-text("Apply"), [role="button"]:has-text("Apply")');
      } catch {
        return { success: false, reason: 'Could not click the Easy Apply button.' };
      }
    }
    await smallDelay(1200, 2500);

    // Iterate through modal steps (max 10)
    for (let step = 0; step < 10; step++) {
      await smallDelay(700, 1400);

      // CAPTCHA detected
      if (await page.$('iframe[src*="recaptcha"], .cf-challenge-running')) {
        return { success: false, reason: 'CAPTCHA detected — manual intervention required' };
      }

      // Successful submission confirmation
      const sent = await page.$(
        '[data-test-modal-title*="application was sent"], h3:has-text("Application sent"), ' +
        'h2:has-text("Application submitted")'
      );
      if (sent) return { success: true };

      // Final submit button
      const submitBtn = await page.$('button[aria-label="Submit application"]');
      if (submitBtn) {
        await naturalScroll(page);
        await smallDelay(500, 1000);
        await submitBtn.click();
        await smallDelay(2500, 4000);
        return { success: true };
      }

      // Next step button
      const nextBtn = await page.$(
        'button[aria-label="Continue to next step"], ' +
        'button[aria-label="Review your application"], ' +
        'button:has-text("Next"), button:has-text("Siguiente")'
      );
      if (nextBtn) {
        await nextBtn.click();
        continue;
      }

      break;
    }

    return { success: false, reason: 'Could not complete the LinkedIn application flow' };
  }

  // ── Indeed Apply ──────────────────────────────────────────────────────────

  /**
   * Attempts to apply to an Indeed job via their apply flow.
   * Navigates to the job page, finds the apply button,
   * iterates through steps, and handles CAPTCHA detection.
   * @param page - Playwright page object
   * @param item - Queue item with job URL
   */
  private static async applyIndeed(
    page: any, item: any
  ): Promise<{ success: boolean; reason?: string }> {

    try {
      await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    } catch (err: any) {
      return { success: false, reason: `Error navigating to Indeed: ${err.message}` };
    }
    await smallDelay(1500, 3000);
    await naturalScroll(page);

    // Find the apply button by analyzing the HTML
    const buttonInfo = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, a[role="button"], a, [role="button"]'));

      let bestMatch = null;
      let bestScore = 0;
      let bestSelector = null;

      for (const btn of buttons) {
        const el = btn as HTMLElement;
        if (!el.offsetParent && el.offsetParent !== null) continue;

        const text = (btn.textContent || '').toLowerCase().trim();
        const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
        const dataTestId = (btn.getAttribute('data-testid') || '').toLowerCase();
        const id = (btn.id || '').toLowerCase();
        const className = (btn.className || '').toLowerCase();

        let score = 0;

        // Apply keywords
        if (text.includes('apply') || ariaLabel.includes('apply') || dataTestId.includes('apply')) score += 10;
        if (text.includes('solicitar') || text.includes('postular')) score += 10;
        if (text.includes('candidato')) score += 5;

        // Exclude navigation buttons
        if (text.match(/home|login|sign|register|search|filter|sort|save|share|report|message|contact|reviews|salary|company|jobs/)) {
          continue;
        }

        // Prioritize prominent buttons
        if (className.includes('blue') || className.includes('primary') || className.includes('cta')) score += 5;
        if (id.includes('apply')) score += 5;

        if (text && text.length > 0 && text.length < 100) {
          const style = window.getComputedStyle(btn);
          if (style.display !== 'none' && style.visibility !== 'hidden') {
            if (style.backgroundColor && !style.backgroundColor.includes('rgba(0, 0, 0, 0)')) {
              score += 2;
            }
          }
        }

        if (score > bestScore) {
          bestScore = score;
          bestMatch = btn;
          // Generate selector for the button
          if (btn.id) {
            bestSelector = `#${btn.id}`;
          } else if (btn.className) {
            bestSelector = `${btn.tagName.toLowerCase()}.${btn.className.split(' ')[0]}`;
          } else {
            bestSelector = btn.tagName.toLowerCase();
          }
        }
      }

      return {
        found: !!bestMatch,
        selector: bestSelector,
        score: bestScore,
        text: bestMatch ? (bestMatch.textContent || '').substring(0, 50) : null,
      };
    });

    if (!buttonInfo.found || !buttonInfo.selector) {
      console.log('[Agent] DEBUG: No button found. Info:', JSON.stringify(buttonInfo));
      return { success: false, reason: 'No apply button found. Listing may require external site application.' };
    }

    // Use locator to click (proper Playwright API)
    try {
      const locator = page.locator(buttonInfo.selector).first();
      await locator.click();
      console.log(`[Agent] ✓ Button clicked. Text: "${buttonInfo.text}"`);
    } catch (err: any) {
      // If selector fails, try a broader search
      try {
        await page.click('button:has-text("Apply"), button:has-text("apply"), [role="button"]:has-text("Apply")');
        console.log('[Agent] ✓ Button clicked via fallback selector');
      } catch {
        return { success: false, reason: 'Could not click the apply button.' };
      }
    }
    await smallDelay(2000, 3500);

    // CAPTCHA check
    if (await page.$('iframe[src*="recaptcha"], #cf-challenge-running')) {
      return { success: false, reason: 'CAPTCHA detected — manual intervention required' };
    }

    // Log URL after click
    const urlAfterClick = page.url();
    console.log(`[Agent] URL after click: ${urlAfterClick}`);

    // External site redirect check
    if (!urlAfterClick.includes('indeed.com') && !urlAfterClick.includes('smartrecruiter')) {
      return { success: false, reason: `Redirected to external site: ${urlAfterClick}` };
    }

    // Iterate steps (max 10)
    for (let step = 0; step < 10; step++) {
      await smallDelay(800, 1600);
      console.log(`[Agent] Step ${step + 1}: Checking for completion indicators...`);

      const done = await page.$(
        '[data-testid="applicationComplete"], ' +
        'h1:has-text("Application submitted"), ' +
        'h1:has-text("Solicitud enviada")'
      );
      if (done) {
        console.log('[Agent] ✓ Application completed detected');
        return { success: true };
      }

      const submitBtn = await page.$(
        'button[data-testid="IndeedApplyButton-submit"], ' +
        'button:has-text("Submit your application")'
      );
      if (submitBtn) {
        console.log('[Agent] Submitting application...');
        await submitBtn.click();
        await smallDelay(2500, 4000);
        return { success: true };
      }

      const nextBtn = await page.$(
        'button:has-text("Continue"), ' +
        'button[data-testid="IndeedApplyButton-continue"]'
      );
      if (nextBtn) {
        console.log('[Agent] Moving to next step...');
        await nextBtn.click();
        continue;
      }

      console.log(`[Agent] Step ${step + 1}: No buttons found, breaking loop`);
      break;
    }

    return { success: false, reason: 'Could not complete the Indeed application flow' };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Marks a queue item as failed with an error message.
   * @param id - Queue item ID
   * @param message - Error description
   */
  private static async markFailed(id: string, message: string): Promise<void> {
    await this.pool!.query(
      `UPDATE application_queue SET status='failed', failed_at=NOW(), error_message=$2 WHERE id=$1`,
      [id, (message ?? 'Unknown error').slice(0, 500)]
    );
    console.error(`[Agent] ❌ Failed: ${message}`);
  }

  /**
   * Calculates the next business hour start time as an ISO string.
   * Returns the next day's start if current time is past business hours.
   */
  private static nextBusinessHourISO(): string {
    const d = new Date();
    d.setHours(this.BUSINESS_START, 0, 0, 0);
    if (d <= new Date()) d.setDate(d.getDate() + 1);
    return d.toISOString();
  }
}

// ── Local Utilities ────────────────────────────────────────────────────────────

/** Async sleep/delay utility */
function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

/** Random integer in [min, max) range */
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min) + min);
}

/** Random small delay to simulate human timing */
async function smallDelay(minMs = 500, maxMs = 2000): Promise<void> {
  await sleep(randInt(minMs, maxMs));
}

/** Simulate natural scrolling behavior */
async function naturalScroll(page: any): Promise<void> {
  const steps = randInt(1, 4);
  for (let i = 0; i < steps; i++) {
    await page.evaluate(
      (d: number) => window.scrollBy({ top: d, behavior: 'smooth' }),
      randInt(100, 400)
    );
    await sleep(randInt(300, 900));
  }
}
