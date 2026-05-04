/**
 * GroqService — Enriquecimiento de empresas via Groq API.
 *
 * Groq ofrece una capa gratuita muy generosa:
 *   - llama-3.1-8b-instant:  ~14 000 RPM en capa free
 *   - mixtral-8x7b-32768:    ~30 req/min
 *
 * Compatible con la interfaz OpenAI, sin SDKs adicionales (fetch puro).
 * Registro gratuito: https://console.groq.com
 *
 * Env vars:
 *   GROQ_API_KEY=gsk_...
 *   GROQ_MODEL=llama-3.1-8b-instant   (opcional, default: llama-3.1-8b-instant)
 */

export const GROQ_PROMPT = (companyName: string) => `Research the company "${companyName}" and return ONLY a valid JSON object with these exact keys:
- "industry": string (e.g., "Manufacturing", "Retail", "Healthcare", "Hospitality", "Construction", "Staffing", "Technology", "Transport")
- "company_size": string (one of: "1-10", "11-50", "51-200", "201-500", "501-1000", "1001-5000", "5001-10000", "10001+")
- "hq_city": string (city name)
- "hq_province": string (province or state abbreviation, e.g. "QC", "ON", "BC", "AB")
- "hq_region": string (administrative region / sub-province, e.g. in Quebec: "Montérégie", "Estrie", "Laurentides", "Montréal"; in Ontario: "GTA", "Eastern Ontario"; empty string if unknown)
- "hq_town": string (specific municipality or town if different from hq_city, empty string otherwise)
- "hq_country": string (country name in English, e.g. "Canada", "United States")
- "exact_address": string (full street address: number, street, city, province, postal code — as precise as possible, empty string if unknown)
- "website": string (official URL with https://, or empty string if unknown)
- "phone": string (main office phone number with country code, e.g. "+1 514 555-1234", empty string if unknown)
- "contact_email": string (main company contact or HR email address, e.g. "info@company.com", empty string if unknown)
- "description": string (2-3 sentences about what the company does and what type of workers they employ)
- "is_closed": boolean (set to true ONLY if you find clear evidence this business is permanently closed, permanently out of business, or does not exist — e.g. "permanently closed" on Google Maps, "business closed", "company dissolved". Otherwise always false)

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
  confidence_score?: number;
  _provider?: string;
}

export class GroqService {
  static isConfigured(): boolean {
    return !!process.env.GROQ_API_KEY;
  }

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

      // Algunos modelos anidan bajo el nombre de la empresa: { "Acme Corp": {...} }
      // Comprobamos si el resultado tiene exactamente una clave cuyo valor es un objeto
      const keys = Object.keys(parsed);
      if (keys.length === 1 && parsed[keys[0]] !== null && typeof parsed[keys[0]] === 'object') {
        parsed = parsed[keys[0]];
      }

      return { ...parsed, _provider: 'groq' };
    } catch (error: any) {
      console.error('[GroqService Error]', error.message);
      throw error; // Re-lanzar para que EnrichmentService continúe al siguiente proveedor
    }
  }
}
