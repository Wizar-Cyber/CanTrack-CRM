import FormData from 'form-data';
import axios from 'axios';

export class LeverService {
  static async apply({ endpoint, candidate, job, coverLetter }: {
    endpoint: string;
    candidate: any;
    job: any;
    coverLetter: string;
  }) {
    const form = new FormData();

    // Standard Lever fields
    form.append('name', candidate.name);
    form.append('email', candidate.email);
    form.append('phone', candidate.phone || '');
    form.append('location', candidate.location || 'Remote');

    // LinkedIn URL
    if (candidate.linkedinUrl) {
      form.append('urls[linkedin]', candidate.linkedinUrl);
    }

    // Cover letter
    form.append('summary', coverLetter);

    try {
      console.log(`[Lever] Submitting application to ${endpoint}`);
      
      const response = await axios.post(endpoint, form, {
        headers: {
          ...form.getHeaders(),
          'Origin': 'https://jobs.lever.co',
          'Referer': job.applicationUrl,
        },
        timeout: 15000,
      });

      return {
        success: true,
        applicationId: String(response.data.id || response.data.application_id || 'LV-' + Math.random().toString(36).substr(2, 9).toUpperCase()),
        raw: response.data,
      };

    } catch (err: any) {
      console.error(`[Lever Error]`, err.response?.data || err.message);
      
      if (err.response?.status === 422) {
        const missing = err.response.data?.errors?.map((e: any) => e.message).join(', ');
        return { success: false, error: `Missing required fields: ${missing}` };
      }
      
      return { success: false, error: `Portal submission failed: ${err.message}` };
    }
  }
}
