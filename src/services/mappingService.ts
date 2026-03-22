import { GoogleGenAI } from "@google/genai";
import { Candidate, Job } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function prepareMappingData(candidate: Candidate, job: Job) {
  const prompt = `
    You are an expert recruitment assistant. 
    I need to prepare a JSON payload for a browser extension that will auto-fill a job application on ${job.source}.
    
    Candidate Profile:
    - Name: ${candidate.name}
    - Role: ${candidate.role}
    - Experience: ${candidate.yearsOfExperience} years
    - Skills: ${candidate.skills.join(", ")}
    - Bio: ${candidate.bio}
    
    Job Details:
    - Title: ${job.title}
    - Company: ${job.companyName}
    - Required Skills: ${job.requiredSkills?.join(", ")}
    
    Please generate a JSON object with the following structure:
    {
      "personal_info": { "first_name": "...", "last_name": "...", "email": "...", "phone": "...", "location": "..." },
      "links": { "linkedin": "...", "portfolio": "..." },
      "experience_summary": "A 2-sentence summary tailored for this role",
      "common_questions": [
        { "question": "Years of experience with ${job.requiredSkills?.[0] || 'relevant tech'}", "answer": "..." },
        { "question": "Why are you a good fit for ${job.companyName}?", "answer": "..." }
      ]
    }
    
    Ensure the answers are professional and based on the candidate's profile.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("Error preparing mapping data:", error);
    // Fallback basic data
    return {
      personal_info: {
        first_name: candidate.name.split(" ")[0],
        last_name: candidate.name.split(" ").slice(1).join(" "),
        email: candidate.email,
        phone: candidate.phone,
        location: candidate.location
      },
      links: {
        linkedin: candidate.linkedinUrl,
        portfolio: candidate.portfolioUrl
      }
    };
  }
}
