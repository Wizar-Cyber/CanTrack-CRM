/**
 * application-agent.service.ts
 *
 * Agente semi-autónomo que procesa la cola de aplicaciones a vacantes
 * en LinkedIn e Indeed con rate limiting y simulación de comportamiento humano.
 *
 * Restricciones:
 *   - Máx. 8 aplicaciones por hora (configurable: MAX_PER_HOUR)
 *   - Pausa aleatoria 2–8 min entre aplicaciones
 *   - Solo opera en horario laboral 9am–5pm (Toronto / America/Toronto)
 *   - Simula scroll natural y delays aleatorios entre acciones
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

  // ── Config (puede sobreescribirse con env vars) ──────────────────────────
  static get MAX_PER_HOUR() { return parseInt(process.env.AGENT_MAX_PER_HOUR || '8'); }
  static readonly MIN_DELAY_MS = 2 * 60_000;   // 2 min
  static readonly MAX_DELAY_MS = 8 * 60_000;   // 8 min
  static readonly BUSINESS_START = 9;           // 9:00 AM
  static readonly BUSINESS_END   = 17;          // 5:00 PM
  static readonly TIMEZONE       = 'America/Toronto';

  // ── Public API ────────────────────────────────────────────────────────────

  static getState(): AgentState {
    return { ...this.state };
  }

  static isBusinessHours(): boolean {
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

  static async start(pool: Pool): Promise<void> {
    if (this.state.status === 'running') {
      throw new Error('El agente ya está corriendo.');
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

    // Corre en background — no bloquea el hilo principal
    this.runLoop().catch(err => {
      this.state.status    = 'stopped';
      this.state.lastError = err.message;
      console.error('[Agent] Error fatal en loop:', err.message);
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
        // 1. Verificar horario laboral
        if (!this.isBusinessHours()) {
          this.state.nextRunAt = this.nextBusinessHourISO();
          console.log(`[Agent] Fuera de horario laboral. Próxima revisión: ${this.state.nextRunAt}`);
          await sleep(60_000);
          continue;
        }

        // 2. Verificar rate limit
        const stats = await this.getStats(this.pool!);
        this.state.appliedLastHour = stats.appliedLastHour;
        this.state.appliedToday    = stats.appliedToday;

        if (stats.appliedLastHour >= this.MAX_PER_HOUR) {
          console.log(`[Agent] Rate limit alcanzado (${stats.appliedLastHour}/${this.MAX_PER_HOUR}/hr). Esperando 10 min...`);
          this.state.nextRunAt = new Date(Date.now() + 10 * 60_000).toISOString();
          await sleep(10 * 60_000);
          continue;
        }

        // 3. Obtener siguiente item de la cola
        const { rows } = await this.pool!.query<any>(`
          SELECT aq.id, aq.job_id, aq.priority,
                 j.url, j.title, j.source,
                 j.company_name, j.service_type_id
          FROM application_queue aq
          JOIN jobs j ON j.id = aq.job_id
          WHERE aq.status = 'queued'
          ORDER BY aq.priority DESC, aq.queued_at ASC
          LIMIT 1
        `);

        if (rows.length === 0) {
          this.state.nextRunAt = new Date(Date.now() + 5 * 60_000).toISOString();
          await sleep(5 * 60_000);
          continue;
        }

        // 4. Procesar item
        await this.processItem(rows[0]);

        // 5. Pausa aleatoria antes de la siguiente aplicación
        if (!this.stopRequested) {
          const delay = randInt(this.MIN_DELAY_MS, this.MAX_DELAY_MS);
          console.log(`[Agent] Próxima aplicación en ${Math.round(delay / 60_000)} min.`);
          this.state.nextRunAt = new Date(Date.now() + delay).toISOString();
          await sleep(delay);
        }

      } catch (err: any) {
        console.error('[Agent] Error en loop:', err.message);
        this.state.lastError = err.message;
        await sleep(30_000); // esperar 30s antes de reintentar
      }
    }

    this.state.status     = 'stopped';
    this.state.currentJobId = null;
    console.log('[Agent] Detenido.');
  }

  // ── Process one queue item ────────────────────────────────────────────────

  private static async processItem(item: any): Promise<void> {
    console.log(`[Agent] Procesando: "${item.title}" @ ${item.company_name} [${item.source}]`);
    this.state.currentJobId = item.job_id;

    // Marcar como "en proceso"
    await this.pool!.query(
      `UPDATE application_queue SET status='processing', started_at=NOW() WHERE id=$1`,
      [item.id]
    );

    // Cargar playwright-extra + stealth dinámicamente (evita romper el servidor si no está instalado)
    let chromium: any;
    let StealthPlugin: any;
    try {
      const pe   = await import('playwright-extra');
      const spMod = await import('playwright-extra-plugin-stealth');
      chromium     = pe.chromium;
      StealthPlugin = spMod.default ?? spMod;
      chromium.use(StealthPlugin());
    } catch {
      await this.markFailed(item.id,
        'playwright-extra no disponible. Ejecuta: npm install playwright && npx playwright install chromium'
      );
      return;
    }

    let browser: any = null;
    try {
      browser = await chromium.launch({
        headless: false,               // navegador visible (más difícil de detectar)
        channel: 'chrome',             // usa el Chrome instalado en el sistema
        args: [
          '--disable-blink-features=AutomationControlled',
          '--start-maximized',
        ],
        slowMo: randInt(40, 100),      // pequeño retardo entre acciones
      });

      const ctx = await browser.newContext({
        viewport:   { width: 1280, height: 800 },
        locale:     'fr-CA',
        timezoneId: this.TIMEZONE,
      });

      const page = await ctx.newPage();

      // Eliminar huella de webdriver
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        (window as any).chrome = { runtime: {} };
      });

      // Aplicar según plataforma
      let result: { success: boolean; reason?: string };

      if (item.source === 'linkedin') {
        result = await this.applyLinkedIn(page, item);
      } else if (item.source === 'indeed') {
        result = await this.applyIndeed(page, item);
      } else {
        result = { success: false, reason: `Fuente '${item.source}' no soportada por el agente` };
      }

      // Capturar screenshot de evidencia
      const shotDir  = path.join('screenshots', 'applications');
      fs.mkdirSync(shotDir, { recursive: true });
      const shotPath = path.join(shotDir, `${item.id}-${Date.now()}.png`);
      await page.screenshot({ path: shotPath, fullPage: false }).catch(() => {});

      // Actualizar estado en BD
      if (result.success) {
        await this.pool!.query(
          `UPDATE application_queue SET status='applied', applied_at=NOW(), notes='Aplicado por agente' WHERE id=$1`,
          [item.id]
        );
        console.log(`[Agent] ✅ Aplicado: "${item.title}"`);
      } else {
        const status = result.reason?.includes('CAPTCHA') ? 'captcha' : 'skipped';
        await this.pool!.query(
          `UPDATE application_queue SET status=$2, notes=$3 WHERE id=$1`,
          [item.id, status, result.reason ?? 'Sin motivo especificado']
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

  private static async applyLinkedIn(
    page: any, item: any
  ): Promise<{ success: boolean; reason?: string }> {

    await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await smallDelay(1500, 3000);
    await naturalScroll(page);

    // ¿Está autenticado?
    const authWall = await page.$('[data-tracking-control-name*="authwall"], a[href*="authwall"]');
    if (authWall) {
      return { success: false, reason: 'Sesión de LinkedIn no activa — inicia sesión en Chrome primero' };
    }

    // Buscar botón Easy Apply
    const easyApplyBtn = await page.$(
      'button.jobs-apply-button, [data-control-name="jobdetail_topcard_inapply"]'
    ) ?? await page.$('button:has-text("Easy Apply"), button:has-text("Solicitar")');

    if (!easyApplyBtn) {
      return { success: false, reason: 'No se encontró botón Easy Apply en esta vacante' };
    }

    await easyApplyBtn.click();
    await smallDelay(1200, 2500);

    // Iterar pasos del modal (máx. 10 pasos)
    for (let step = 0; step < 10; step++) {
      await smallDelay(700, 1400);

      // CAPTCHA detectado
      if (await page.$('iframe[src*="recaptcha"], .cf-challenge-running')) {
        return { success: false, reason: 'CAPTCHA detectado — se requiere intervención manual' };
      }

      // Confirmación de envío exitoso
      const sent = await page.$(
        '[data-test-modal-title*="application was sent"], h3:has-text("Application sent"), ' +
        'h2:has-text("Application submitted")'
      );
      if (sent) return { success: true };

      // Botón de submit final
      const submitBtn = await page.$('button[aria-label="Submit application"]');
      if (submitBtn) {
        await naturalScroll(page);
        await smallDelay(500, 1000);
        await submitBtn.click();
        await smallDelay(2500, 4000);
        return { success: true };
      }

      // Botón "Siguiente paso"
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

    return { success: false, reason: 'No se pudo completar el flujo de aplicación en LinkedIn' };
  }

  // ── Indeed Apply ──────────────────────────────────────────────────────────

  private static async applyIndeed(
    page: any, item: any
  ): Promise<{ success: boolean; reason?: string }> {

    await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await smallDelay(1500, 3000);
    await naturalScroll(page);

    // Botón principal de aplicación
    const applyBtn = await page.$(
      '#indeedApplyButton, button:has-text("Apply now"), a:has-text("Apply now"), ' +
      'button:has-text("Postularme ahora")'
    );
    if (!applyBtn) {
      return { success: false, reason: 'No se encontró botón de aplicación en Indeed' };
    }

    await applyBtn.click();
    await smallDelay(2000, 3500);

    // CAPTCHA
    if (await page.$('iframe[src*="recaptcha"], #cf-challenge-running')) {
      return { success: false, reason: 'CAPTCHA detectado — se requiere intervención manual' };
    }

    // Redirección a sitio externo
    if (!page.url().includes('indeed.com') && !page.url().includes('smartrecruiter')) {
      return { success: false, reason: `Redirigido a sitio externo: ${page.url()}` };
    }

    // Iterar pasos (máx. 10)
    for (let step = 0; step < 10; step++) {
      await smallDelay(800, 1600);

      const done = await page.$(
        '[data-testid="applicationComplete"], ' +
        'h1:has-text("Application submitted"), ' +
        'h1:has-text("Solicitud enviada")'
      );
      if (done) return { success: true };

      const submitBtn = await page.$(
        'button[data-testid="IndeedApplyButton-submit"], ' +
        'button:has-text("Submit your application")'
      );
      if (submitBtn) {
        await submitBtn.click();
        await smallDelay(2500, 4000);
        return { success: true };
      }

      const nextBtn = await page.$(
        'button:has-text("Continue"), ' +
        'button[data-testid="IndeedApplyButton-continue"]'
      );
      if (nextBtn) { await nextBtn.click(); continue; }

      break;
    }

    return { success: false, reason: 'No se pudo completar el flujo de aplicación en Indeed' };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private static async markFailed(id: string, message: string): Promise<void> {
    await this.pool!.query(
      `UPDATE application_queue SET status='failed', failed_at=NOW(), error_message=$2 WHERE id=$1`,
      [id, (message ?? 'Error desconocido').slice(0, 500)]
    );
    console.error(`[Agent] ❌ Falló: ${message}`);
  }

  private static nextBusinessHourISO(): string {
    const d = new Date();
    d.setHours(this.BUSINESS_START, 0, 0, 0);
    if (d <= new Date()) d.setDate(d.getDate() + 1);
    return d.toISOString();
  }
}

// ── Utilidades locales ────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min) + min);
}

async function smallDelay(minMs = 500, maxMs = 2000): Promise<void> {
  await sleep(randInt(minMs, maxMs));
}

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
