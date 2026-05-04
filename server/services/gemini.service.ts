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
  }> {
    const ai = this.getAI();
    if (!ai) {
      console.warn('[Gemini] GEMINI_API_KEY not configured — enrichment skipped.');
      return {};
    }

    const prompt = `Research the company "${companyName}" and return ONLY a valid JSON object with these exact keys:
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

Return ONLY the JSON object. No markdown code fences, no extra text.`;

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
}
