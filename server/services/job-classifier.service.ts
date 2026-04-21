/**
 * JobClassifierService — Agente IA para clasificación de vacantes
 *
 * Responsabilidades:
 * 1. classifyJob()       → Mapea una vacante entrante a uno de los 52 servicios de CanTrack
 * 2. suggestForCompany() → Dado el perfil enriquecido de una empresa, sugiere qué servicios ofrecer
 *
 * Cadena de proveedores (igual que EnrichmentService):
 *   Gemini 2.5-Flash → Groq (llama-3.1-8b) → Respuesta mínima por keywords
 */

import { GoogleGenAI } from '@google/genai';
import { SERVICE_TYPES, SERVICE_TYPES_COMPACT, SERVICE_TYPE_BY_ID } from '../data/serviceTypes.js';

// ── Tipos públicos ────────────────────────────────────────────────────────────

export interface ClassificationResult {
  /** id del servicio CanTrack que mejor hace match (null si ninguno aplica) */
  service_id: string | null;
  service_name: string | null;
  service_number: number | null;
  /** Confianza 0-1 */
  confidence: number;
  /** Razón del match */
  reasoning: string;
  /** true si la vacante no matchea ningún servicio pero la empresa podría necesitar otros */
  no_direct_match: boolean;
  /** Provider que respondió */
  _provider?: string;
}

export interface ServiceSuggestion {
  service_id: string;
  service_name: string;
  service_number: number;
  relevance_score: number;  // 0-1
  reasoning: string;
}

export interface CompanySuggestionsResult {
  suggestions: ServiceSuggestion[];
  company_summary: string;
  _provider?: string;
}

// ── Prompt builders ───────────────────────────────────────────────────────────

function buildServiceCatalog(): string {
  return SERVICE_TYPES_COMPACT
    .map(s => `#${s.number} [${s.id}] ${s.name} (${s.category}) — keywords: ${s.keywords}`)
    .join('\n');
}

function buildClassifyPrompt(jobTitle: string, jobDescription: string, companyName: string, companyIndustry?: string): string {
  return `Eres el agente clasificador de una empresa de staffing llamada CanTrack. Tu tarea es determinar cuál de los 52 servicios de CanTrack mejor corresponde a esta vacante.

VACANTE:
- Título: ${jobTitle}
- Empresa: ${companyName}${companyIndustry ? ` (${companyIndustry})` : ''}
- Descripción: ${jobDescription || 'No disponible'}

CATÁLOGO DE SERVICIOS CANTRACK (52 servicios):
${buildServiceCatalog()}

REGLAS:
1. Busca el servicio cuyas keywords o nombre sea semánticamente más cercano al título de la vacante.
2. Ejemplo: "barista" → "Bartenders" (id: ga-bartenders); "albañil" → "Construcción" (id: co-construccion)
3. Si la vacante es para un perfil técnico-profesional que definitivamente CanTrack no maneja (ej. ingeniero aeroespacial, abogado, médico especialista), pon service_id: null y no_direct_match: true.
4. Para vacantes ambiguas usa el contexto de la empresa para decidir.

Responde SOLO con un JSON válido, sin markdown ni texto extra:
{
  "service_id": "id-del-servicio-o-null",
  "service_name": "nombre del servicio o null",
  "service_number": número_entero_o_null,
  "confidence": 0.0_a_1.0,
  "reasoning": "explicación breve de por qué hace match o por qué no",
  "no_direct_match": true_o_false
}`;
}

function buildSuggestPrompt(
  companyName: string,
  industry: string,
  description: string,
  companySize: string,
  city: string,
  country: string
): string {
  return `Eres el agente de ventas de CanTrack, una empresa de staffing. Analiza el perfil de esta empresa y determina cuáles de nuestros 52 servicios son más relevantes para ofrecerles.

EMPRESA:
- Nombre: ${companyName}
- Industria: ${industry || 'Desconocida'}
- Tamaño: ${companySize || 'Desconocido'}
- Ciudad: ${city || 'Desconocida'}, ${country || ''}
- Descripción: ${description || 'No disponible'}

CATÁLOGO DE SERVICIOS CANTRACK:
${buildServiceCatalog()}

INSTRUCCIONES:
1. Selecciona entre 3 y 6 servicios que esta empresa probablemente necesita según su industria y descripción.
2. Prioriza los más obvios (ej. un restaurante necesita Meseros, Chef, Limpieza).
3. Incluye también servicios no obvios pero útiles (ej. un hotel también necesita Lavandería, Seguridad, Mantenimiento).
4. Asigna un relevance_score de 0 a 1 (1 = esencial, 0.5 = probable, 0.3 = posible).

Responde SOLO con JSON válido, sin markdown:
{
  "suggestions": [
    {
      "service_id": "id-del-servicio",
      "service_name": "nombre",
      "service_number": número,
      "relevance_score": 0.0_a_1.0,
      "reasoning": "por qué esta empresa necesita este servicio"
    }
  ],
  "company_summary": "resumen en 1 oración de qué tipo de empresa es y qué necesitan"
}`;
}

// ── Helpers de parse ──────────────────────────────────────────────────────────

function parseJson<T>(raw: string): T | null {
  try {
    const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}

function validateClassification(data: any): ClassificationResult | null {
  if (!data || typeof data !== 'object') return null;
  // Validate service_id exists in catalog if not null
  if (data.service_id && !SERVICE_TYPE_BY_ID[data.service_id]) {
    // Try to find by name similarity
    const match = SERVICE_TYPES.find(s =>
      s.name.toLowerCase() === String(data.service_name || '').toLowerCase()
    );
    if (match) data.service_id = match.id;
    else data.service_id = null;
  }
  return {
    service_id: data.service_id || null,
    service_name: data.service_name || null,
    service_number: data.service_number || null,
    confidence: Math.min(1, Math.max(0, Number(data.confidence) || 0)),
    reasoning: String(data.reasoning || ''),
    no_direct_match: Boolean(data.no_direct_match),
  };
}

function validateSuggestions(data: any): CompanySuggestionsResult | null {
  if (!data || !Array.isArray(data.suggestions)) return null;
  const suggestions: ServiceSuggestion[] = data.suggestions
    .filter((s: any) => s.service_id && SERVICE_TYPE_BY_ID[s.service_id])
    .map((s: any) => ({
      service_id: s.service_id,
      service_name: SERVICE_TYPE_BY_ID[s.service_id].name,
      service_number: SERVICE_TYPE_BY_ID[s.service_id].number,
      relevance_score: Math.min(1, Math.max(0, Number(s.relevance_score) || 0.5)),
      reasoning: String(s.reasoning || ''),
    }))
    .sort((a: ServiceSuggestion, b: ServiceSuggestion) => b.relevance_score - a.relevance_score);
  return {
    suggestions,
    company_summary: String(data.company_summary || ''),
  };
}

// ── Keyword fallback (sin LLM) ────────────────────────────────────────────────

function keywordFallbackClassify(jobTitle: string): ClassificationResult {
  const title = jobTitle.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  let bestMatch: { service: typeof SERVICE_TYPES[0]; score: number } | null = null;

  for (const service of SERVICE_TYPES) {
    let score = 0;
    const keywords = [service.name, ...service.keywords].map(k =>
      k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    );
    for (const kw of keywords) {
      if (title === kw) { score = 10; break; }
      if (title.includes(kw) || kw.includes(title)) score = Math.max(score, 5);
      const titleWords = title.split(/\s+/);
      const kwWords = kw.split(/\s+/);
      const overlap = titleWords.filter(w => kwWords.includes(w)).length;
      if (overlap > 0) score = Math.max(score, overlap * 2);
    }
    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { service, score };
    }
  }

  if (bestMatch && bestMatch.score >= 2) {
    return {
      service_id: bestMatch.service.id,
      service_name: bestMatch.service.name,
      service_number: bestMatch.service.number,
      confidence: Math.min(0.7, bestMatch.score / 10),
      reasoning: `Match por palabras clave: "${jobTitle}" → ${bestMatch.service.name}`,
      no_direct_match: false,
      _provider: 'keyword-fallback',
    };
  }

  return {
    service_id: null,
    service_name: null,
    service_number: null,
    confidence: 0,
    reasoning: `No se encontró match para "${jobTitle}" en el catálogo de 52 servicios.`,
    no_direct_match: true,
    _provider: 'keyword-fallback',
  };
}

// ── Servicio principal ────────────────────────────────────────────────────────

export class JobClassifierService {
  private static gemini: GoogleGenAI | null = null;

  private static getGemini(): GoogleGenAI | null {
    if (!this.gemini && process.env.GEMINI_API_KEY) {
      this.gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    }
    return this.gemini;
  }

  private static async callGroq(prompt: string, maxTokens = 512): Promise<string | null> {
    if (!process.env.GROQ_API_KEY) return null;
    try {
      const model = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.2,
          max_tokens: maxTokens,
          response_format: { type: 'json_object' },
        }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) return null;
      const json: any = await response.json();
      return json.choices?.[0]?.message?.content ?? null;
    } catch {
      return null;
    }
  }

  // ── classifyJob ─────────────────────────────────────────────────────────────

  /**
   * Clasifica una vacante y la mapea al servicio CanTrack más cercano.
   * Intenta Gemini → Groq → fallback por keywords.
   */
  static async classifyJob(
    jobTitle: string,
    jobDescription: string = '',
    companyName: string = '',
    companyIndustry: string = ''
  ): Promise<ClassificationResult> {
    const prompt = buildClassifyPrompt(jobTitle, jobDescription, companyName, companyIndustry);

    // 1. Gemini
    const gemini = this.getGemini();
    if (gemini) {
      try {
        const response = await gemini.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
        });
        const data = parseJson<any>(response.text || '{}');
        const result = data ? validateClassification(data) : null;
        if (result) return { ...result, _provider: 'gemini' };
      } catch (err) {
        console.warn('[JobClassifier] Gemini error:', (err as Error).message);
      }
    }

    // 2. Groq (fetch directo, sin SDK)
    const groqRaw = await this.callGroq(prompt, 512);
    if (groqRaw) {
      const data = parseJson<any>(groqRaw);
      const result = data ? validateClassification(data) : null;
      if (result) return { ...result, _provider: 'groq' };
    }

    // 3. Keyword fallback
    return keywordFallbackClassify(jobTitle);
  }

  // ── suggestForCompany ───────────────────────────────────────────────────────

  /**
   * Dado el perfil enriquecido de una empresa, sugiere qué servicios de CanTrack
   * se le pueden ofrecer según su industria y descripción.
   */
  static async suggestForCompany(company: {
    name: string;
    industry?: string;
    description?: string;
    company_size?: string;
    hq_city?: string;
    hq_country?: string;
  }): Promise<CompanySuggestionsResult> {
    const prompt = buildSuggestPrompt(
      company.name,
      company.industry || '',
      company.description || '',
      company.company_size || '',
      company.hq_city || '',
      company.hq_country || ''
    );

    // 1. Gemini
    const gemini = this.getGemini();
    if (gemini) {
      try {
        const response = await gemini.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
        });
        const data = parseJson<any>(response.text || '{}');
        const result = data ? validateSuggestions(data) : null;
        if (result && result.suggestions.length > 0) {
          return { ...result, _provider: 'gemini' };
        }
      } catch (err) {
        console.warn('[JobClassifier] Gemini suggest error:', (err as Error).message);
      }
    }

    // 2. Groq (fetch directo)
    const groqRaw = await this.callGroq(prompt, 1024);
    if (groqRaw) {
      const data = parseJson<any>(groqRaw);
      const result = data ? validateSuggestions(data) : null;
      if (result && result.suggestions.length > 0) {
        return { ...result, _provider: 'groq' };
      }
    }

    // 3. Fallback por industria
    return industryFallbackSuggestions(company);
  }
}

// ── Fallback de sugerencias por industria (sin LLM) ───────────────────────────

function industryFallbackSuggestions(company: {
  name: string;
  industry?: string;
  description?: string;
}): CompanySuggestionsResult {
  const industry = (company.industry || '').toLowerCase();

  // Mapeo industria → servicios relevantes
  const industryMap: Record<string, string[]> = {
    'food': ['ga-chef', 'ga-meseros', 'ga-asistente-cocina', 'lm-limpieza', 'se-seguridad'],
    'hospitality': ['ht-hotel', 'sh-mucama', 'lm-lavanderia', 'lm-mantenimiento', 'se-seguridad', 'ga-meseros'],
    'manufacturing': ['in-operario-produccion', 'in-operario-maquinaria', 'lm-limpieza-industrial', 'mt-mecanico-industrial', 'co-soldador'],
    'logistics': ['lg-montacargas', 'lg-conductores', 'lg-carga-descarga', 'lg-almacen', 'se-seguridad'],
    'construction': ['co-construccion', 'co-plomero', 'mt-electricista', 'co-pintor', 'co-carpintero'],
    'retail': ['cr-supermercado', 'lm-limpieza', 'se-seguridad', 'lm-mantenimiento', 'lg-almacen'],
    'agriculture': ['ag-recolectores', 'ag-operario-agricola', 'ag-invernaderos', 'ag-agricultor', 'ag-paisajismo'],
    'healthcare': ['lm-limpieza-industrial', 'lm-limpieza', 'mt-reparadores-refrigeradoras', 'ht-recepcionista'],
    'property': ['lm-limpieza', 'lm-mantenimiento', 'co-plomero', 'mt-electricista', 'ag-paisajismo'],
  };

  let matchedIds: string[] = [];
  for (const [key, ids] of Object.entries(industryMap)) {
    if (industry.includes(key)) {
      matchedIds = ids;
      break;
    }
  }

  // Default si no hay match de industria
  if (matchedIds.length === 0) {
    matchedIds = ['lm-limpieza', 'lm-mantenimiento', 'se-seguridad', 'gn-general'];
  }

  const suggestions: ServiceSuggestion[] = matchedIds
    .map((id, i) => {
      const service = SERVICE_TYPE_BY_ID[id];
      if (!service) return null;
      return {
        service_id: id,
        service_name: service.name,
        service_number: service.number,
        relevance_score: Math.max(0.3, 0.9 - i * 0.1),
        reasoning: `Común en empresas de ${company.industry || 'esta industria'}`,
      };
    })
    .filter(Boolean) as ServiceSuggestion[];

  return {
    suggestions,
    company_summary: `${company.name} — sugerencias basadas en industria: ${company.industry || 'general'}.`,
    _provider: 'industry-fallback',
  };
}
