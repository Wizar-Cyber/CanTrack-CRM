import { Candidate, Job } from "../types";
import { api } from "./apiClient";

export async function prepareMappingData(candidate: Candidate, job: Job) {
  try {
    const res = await api('/api/mapping/prepare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidate, job }),
    });
    if (!res.ok) throw new Error('Server error');
    return await res.json();
  } catch (error) {
    console.error("Error preparing mapping data:", error);
    // Fallback básico sin LLM
    return {
      personal_info: {
        first_name: candidate.name.split(" ")[0],
        last_name: candidate.name.split(" ").slice(1).join(" "),
        email: candidate.email,
        phone: candidate.phone,
        location: candidate.location,
      },
      links: {
        linkedin: candidate.linkedinUrl,
        portfolio: candidate.portfolioUrl,
      },
    };
  }
}



