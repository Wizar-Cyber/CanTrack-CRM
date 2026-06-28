/**
 * GroqService — Company enrichment via Groq API.
 *
 * Groq offers a very generous free tier:
 *   - llama-3.1-8b-instant:  ~14 000 RPM on free tier
 *   - mixtral-8x7b-32768:    ~30 req/min
 *
 * Compatible with OpenAI interface, no extra SDKs (pure fetch).
 * Free registration: https://console.groq.com
 *
 * Env vars:
 *   GROQ_API_KEY=gsk_...
 *   GROQ_MODEL=llama-3.1-8b-instant   (optional, default: llama-3.1-8b-instant)
 */

export const GROQ_PROMPT = (companyName: string) => `You are a company research assistant for a Canadian staffing agency. Research the company "${companyName}" in Canada. Every field must be a real verified value or empty string. NEVER hallucinate data.

Return ONLY a valid JSON object with these exact keys:
- "industry": string (e.g., "Construction", "Manufacturing", "Retail", "Healthcare", "Hospitality", "Technology", "Transport", "Staffing", "Agriculture", "Food Services"). Empty if unknown.
- "company_size": string (EXACTLY one of: "1-10", "11-50", "51-200", "201-500", "501-1000", "1001-5000", "5001-10000", "10001+"). Empty if unknown.
- "hq_city": string. Empty if unknown.
- "hq_province": string ("ON" or "QC" or "BC" or "AB" etc). Empty if unknown.
- "hq_region": string (administrative region in Quebec or Ontario). Empty if unknown.
- "hq_town": string. Empty if unknown.
- "hq_country": string (always "Canada").
- "exact_address": string (COMPLETE address: number, street, city, province, postal code). IMPORTANT.
- "website": string (URL with https://). Empty if unknown.
- "phone": string (main phone with area code). IMPORTANT to find. Empty if unknown.
- "contact_email": string. Empty if unknown.
- "description": string (2-3 specific sentences about the company).
- "is_closed": boolean (true ONLY if permanently closed).
- "tipo": string (CRITICAL: "verde"=medium/large business 10+ employees, worth visit; "naranja"=small business under 10 employees, calls only; "morado"=home-based, calls only; "rojo"=closed/non-existent)
- "primary_service": string (CHEF, PLOMERO, ELECTRICISTA, SOLDADOR, MECANICO, CONSTRUCCION, LIMPIEZA, PERSONAL DE SEGURIDAD, CONDUCTORES DE VEHICULOS DE CARGA, ALMACEN, RESTAURANTE, HOTEL, MANTENIMIENTO, CARPINTERO, PINTOR, PANADERIA, EMPACADORES, OPERADORES DE MONTEACARGA, PAISAJISMO, MESEROS, CARGA Y DESCARGA, GENERAL)

Return ONLY the JSON object. No markdown, no extra text.`;

export interface EnrichmentData {
  industry?: string;
  company_size?: string;
  hq_city?: string;
  hq_province?: string;
  hq_region?: string;
  hq_town?: string;
  hq_country?: string;
  exact_address?: string;
  phone?: string;
  contact_email?: string;
  website?: string;
  description?: string;
  is_closed?: boolean;
  tipo?: string;
  primary_service?: string;
  confidence_score?: number;
  _provider?: string;
}

/**
 * Groq AI integration service.
 * Provides company enrichment via Groq's free API tier (llama-3.1-8b-instant, mixtral-8x7b).
 * Compatible with OpenAI interface — uses pure fetch, no SDK required.
 */
export class GroqService {
  /** Returns true if GROQ_API_KEY is configured in environment */
  static isConfigured(): boolean {
    return !!process.env.GROQ_API_KEY;
  }

  /**
   * Enriches a company using Groq AI.
   * Falls back gracefully with empty data on quota exhaustion or errors.
   * @throws If rate limited (429) — caller should retry with different provider
   */
  static async enrichCompany(companyName: string): Promise<EnrichmentData> {
    if (!this.isConfigured()) return { confidence_score: 0 };

    const model = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content: 'You are a company research assistant. Always respond with valid JSON only, no markdown.',
            },
            { role: 'user', content: GROQ_PROMPT(companyName) },
          ],
          temperature: 0.1,
          max_tokens: 512,
          response_format: { type: 'json_object' },
        }),
        signal: AbortSignal.timeout(20_000),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        // 429 = quota exhausted
        if (response.status === 429) throw new Error('GROQ_QUOTA_EXHAUSTED');
        throw new Error(`Groq HTTP ${response.status}: ${(err as any)?.error?.message ?? ''}`);
      }

      const json: any = await response.json();
      const text: string = json.choices?.[0]?.message?.content ?? '{}';
      let parsed = JSON.parse(text);

      // Some models nest under the company name: { "Acme Corp": {...} }
      // Check if the result has exactly one key whose value is an object
      const keys = Object.keys(parsed);
      if (keys.length === 1 && parsed[keys[0]] !== null && typeof parsed[keys[0]] === 'object') {
        parsed = parsed[keys[0]];
      }

      return { ...parsed, _provider: 'groq' };
    } catch (error: any) {
      console.error('[GroqService Error]', error.message);
      throw error; // Re-throw so EnrichmentService can continue to the next provider
    }
  }
}
