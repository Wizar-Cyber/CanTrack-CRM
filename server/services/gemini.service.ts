import { GoogleGenAI } from "@google/genai";

export class GeminiService {
  private static ai: GoogleGenAI | null = null;

  private static getAI() {
    if (!this.ai && process.env.GEMINI_API_KEY) {
      this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    }
    return this.ai;
  }

  static async enrichCompany(companyName: string): Promise<{
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
  }> {
    const ai = this.getAI();
    if (!ai) {
      console.warn('[Gemini] GEMINI_API_KEY not configured — enrichment skipped.');
      return {};
    }

    const prompt = `You are a company research assistant for a Canadian staffing agency. Research the company "${companyName}" in Canada and return ONLY a valid JSON object. Every field must be either a real verified value or an empty string/0/null. NEVER hallucinate data.

CRITICAL: If you cannot find a specific piece of information, return empty string for that field. Do NOT make up phone numbers, addresses, or emails.

Return ONLY a JSON object with these exact keys:
- "industry": string (e.g., "Construction", "Manufacturing", "Retail", "Healthcare", "Hospitality", "Technology", "Transport", "Staffing", "Agriculture", "Education", "Food Services"). Empty if unknown.
- "company_size": string (EXACTLY one of: "1-10", "11-50", "51-200", "201-500", "501-1000", "1001-5000", "5001-10000", "10001+"). Empty if unknown.
- "hq_city": string (city name). Empty if unknown.
- "hq_province": string (Canadian province: "ON" for Ontario, "QC" for Quebec, "BC", "AB", etc.). Empty if unknown.
- "hq_region": string (administrative region: for Quebec: "Montérégie", "Estrie", "Laurentides", "Montréal", "Laval", "Lanaudière", "Centre-du-Québec", "Chaudière-Appalaches", "Capitale-Nationale", "Outaouais", "Abitibi-Témiscamingue", "Côte-Nord", "Gaspésie-Îles-de-la-Madeleine", "Saguenay-Lac-Saint-Jean", "Bas-Saint-Laurent", "Nord-du-Québec"; for Ontario: "GTA", "Eastern Ontario", "Central Ontario", "Southwestern Ontario", "Northern Ontario", "Golden Horseshoe", "Hamilton-Niagara", "Kingston-Belleville", "Ottawa-Carleton", "Muskoka-Kawarthas", "London-Middlesex", "Windsor-Essex"). Empty if unknown.
- "hq_town": string (specific municipality or town). Empty if unknown.
- "hq_country": string (always "Canada" for Canadian companies). 
- "exact_address": string (COMPLETE street address: number, street, city, province, postal code. Example: "123 Main Street, Toronto, ON M5V 2T6, Canada"). This is VERY IMPORTANT. Empty if unknown.
- "phone": string (main office phone with area code, e.g. "416-555-1234" or "+1 416 555-1234"). This is VERY IMPORTANT to find. Empty if unknown.
- "contact_email": string (company email like "info@company.com" or HR email). Empty if unknown.
- "website": string (official URL with https://). Empty if unknown.
- "description": string (2-3 sentences about what the company does, what industry they serve, and what type of workers they employ). If generating, make it specific to this company, not generic.
- "is_closed": boolean (MUST be true ONLY if there is clear evidence the business is permanently closed. Otherwise ALWAYS false).
- "tipo": string (classify the company based on SIZE and TYPE. CRITICAL CLASSIFICATION:
  * "verde" = medium/large business with physical commercial location (retail store, restaurant chain, factory, warehouse, office building, hotel, construction company with yard) — worth an in-person sales visit. Generally 10+ employees.
  * "naranja" = small business (small shop, local service, small office) — phone calls only, not worth visiting. Generally under 10 employees.
  * "morado" = residential or home-based business — phone calls only. Do NOT visit in person.
  * "rojo" = permanently closed, dissolved, non-existent, or too micro/informal to contact. Based on is_closed field.
  Use company_size to help determine: 1-10 employees → naranja or morado; 11+ employees → verde)
- "primary_service": string (the main staffing service needed. Choose from: CHEF, PLOMERO, ELECTRICISTA, SOLDADOR, MECANICO, CONSTRUCCION, LIMPIEZA, PERSONAL DE SEGURIDAD, CONDUCTORES DE VEHICULOS DE CARGA, ALMACEN, RESTAURANTE, HOTEL, MANTENIMIENTO, CARPINTERO, PINTOR, PANADERIA, EMPACADORES, OPERADORES DE MONTEACARGA, PAISAJISMO, MESEROS, CARGA Y DESCARGA, GENERAL)

Return ONLY valid JSON. No markdown fences. No extra text.`;

    const response = await this.getAI()!.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    const text = (response.text || '{}').replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(text);
  }

  static async generateCoverLetter(candidate: any, job: any): Promise<string> {
    const ai = this.getAI();
    if (!ai) {
      return `Dear Hiring Manager,\n\nI am writing to express my interest in the ${job.title} position at ${job.companyName}. With my background in ${candidate.skills?.join(', ') || 'software development'}, I am confident I would be a great fit for your team.\n\nBest regards,\n${candidate.name}`;
    }

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Generate a short, professional cover letter for ${candidate.name} applying for the ${job.title} role at ${job.companyName}. 
        Candidate skills: ${candidate.skills?.join(', ') || 'Not specified'}. 
        Candidate experience: ${candidate.experience || 'Not specified'}.
        Keep it under 200 words.`,
      });

      return response.text || "Cover letter generation failed.";
    } catch (error) {
      console.error("[Gemini Error]", error);
      return `Dear Hiring Manager,\n\nI am writing to express my interest in the ${job.title} position at ${job.companyName}. Best regards,\n${candidate.name}`;
    }
  }

  /** Generic text generation — used by AI-improve endpoints */
  static async generateText(prompt: string): Promise<string> {
    const ai = this.getAI();
    if (!ai) throw new Error('GEMINI_API_KEY not configured');
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    return response.text || '';
  }
}
