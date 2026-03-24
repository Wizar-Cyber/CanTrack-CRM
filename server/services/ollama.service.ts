/**
 * OllamaService — Enriquecimiento via Ollama (LLM local, costo cero).
 *
 * Ollama corre en tu máquina sin conexión a internet.
 * Instalación: https://ollama.com/download
 * Modelos recomendados:
 *   ollama pull llama3.2       (2GB, bueno)
 *   ollama pull mistral        (4GB, más preciso)
 *   ollama pull gemma2:2b      (1.4GB, muy ligero)
 *
 * Env vars:
 *   OLLAMA_BASE_URL=http://localhost:11434   (opcional, default)
 *   OLLAMA_MODEL=llama3.2                    (opcional, default)
 */

import { GROQ_PROMPT, EnrichmentData } from './groq.service.js';

export class OllamaService {
  private static get baseUrl() {
    return (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, '');
  }

  private static get model() {
    return process.env.OLLAMA_MODEL || 'llama3.2';
  }

  /** Verifica si Ollama está corriendo haciendo un ping al endpoint de versión */
  static async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/version`, {
        signal: AbortSignal.timeout(3_000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  static async enrichCompany(companyName: string): Promise<EnrichmentData> {
    const prompt = GROQ_PROMPT(companyName);

    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model:  this.model,
          prompt,
          stream: false,
          format: 'json',   // Ollama ≥ 0.1.9 soporta formato JSON nativo
          options: {
            temperature: 0.1,
            num_predict: 512,
          },
        }),
        signal: AbortSignal.timeout(60_000), // Los modelos locales pueden tardar más
      });

      if (!response.ok) {
        const err = await response.text().catch(() => '');
        throw new Error(`Ollama HTTP ${response.status}: ${err}`);
      }

      const json: any = await response.json();
      const text: string = (json.response ?? '{}').trim();
      
      // Extraer JSON del texto (Ollama a veces añade texto extra)
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Ollama no devolvió JSON válido');
      
      const parsed = JSON.parse(jsonMatch[0]);
      return { ...parsed, _provider: `ollama:${this.model}` };
    } catch (error: any) {
      console.error('[OllamaService Error]', error.message);
      throw error;
    }
  }
}
