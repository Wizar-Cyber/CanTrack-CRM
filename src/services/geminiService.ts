import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { Company } from "../types";

function getAI() {
  const key = (import.meta as any).env?.VITE_GEMINI_API_KEY || (typeof process !== 'undefined' ? process.env.GEMINI_API_KEY : '') || '';
  return new GoogleGenAI({ apiKey: key });
}

export async function getCompanyIntelligence(companyName: string, location?: string): Promise<Partial<Company>> {
  const ai = getAI();
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Provide detailed intelligence for the company "${companyName}"${location ? ` located in ${location}` : ""}. 
      Include: industry, approximate size, official website, a brief description, and any known contact information for recruitment.
      Focus on their presence in Canada.
      
      IMPORTANT: Return ONLY a valid JSON object with the keys: "industry", "size", "website", "description". Do not include markdown formatting like \`\`\`json.`,
      config: {
        tools: [{ googleMaps: {} }],
      },
    });

    // Note: In a real app, we'd parse the JSON response. 
    // For this demo, we'll simulate the extraction if the model doesn't return perfect JSON.
    try {
      const text = response.text || "{}";
      // Clean up potential markdown blocks if the model still includes them
      const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(cleanedText);
    } catch {
      // Fallback if JSON parsing fails
      return {
        description: response.text?.substring(0, 500)
      };
    }
  } catch (error) {
    console.error("Error fetching company intelligence:", error);
    return {};
  }
}

export async function analyzeJobFit(jobTitle: string, companyName: string, notes: string) {
  const ai = getAI();
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: `Analyze my fit for the role of "${jobTitle}" at "${companyName}". 
      Context/Notes: ${notes}. 
      Provide a professional assessment of potential challenges and strengths for this application in the Canadian market.`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH }
      }
    });

    return response.text;
  } catch (error) {
    console.error("Error analyzing job fit:", error);
    return "Could not analyze fit at this time.";
  }
}
