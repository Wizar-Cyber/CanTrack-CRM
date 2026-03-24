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
    sector?: string;
    company_size?: string;
    hq_city?: string;
    hq_country?: string;
    website?: string;
    description?: string;
    is_publicly_traded?: boolean;
    confidence_score?: number;
  }> {
    const ai = this.getAI();
    if (!ai) {
      console.warn('[Gemini] GEMINI_API_KEY no configurado — enriquecimiento omitido.');
      return { confidence_score: 0 };
    }

    const prompt = `Research the company "${companyName}" and return ONLY a valid JSON object with these exact keys:
- "industry": string (e.g., "Technology", "Banking", "Retail", "Healthcare", "Manufacturing")
- "sector": string (e.g., "Software", "Finance", "Consumer Goods", "IT Services")
- "company_size": string (one of: "1-10", "11-50", "51-200", "201-500", "501-1000", "1001-5000", "5001-10000", "10001+")
- "hq_city": string (city name)
- "hq_country": string (country name in English)
- "website": string (official URL with https://, or empty string if unknown)
- "description": string (2-3 sentences about what the company does)
- "is_publicly_traded": boolean
- "confidence_score": integer 0-100 (how confident you are in this data)

Return ONLY the JSON object. No markdown code fences, no extra text.`;

    try {
      const response = await this.getAI()!.models.generateContent({
        model: 'gemini-2.0-flash-lite',
        contents: prompt,
      });
      const text = (response.text || '{}').replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(text);
    } catch (error) {
      console.error('[Gemini enrichCompany Error]', error);
      return { confidence_score: 0 };
    }
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
