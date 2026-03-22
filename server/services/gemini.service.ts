import { GoogleGenAI } from "@google/genai";

export class GeminiService {
  private static ai: GoogleGenAI | null = null;

  private static getAI() {
    if (!this.ai && process.env.GEMINI_API_KEY) {
      this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    }
    return this.ai;
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
