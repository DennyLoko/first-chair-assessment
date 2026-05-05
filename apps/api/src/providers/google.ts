import { GoogleGenAI, Type } from '@google/genai';
import { ZodSchema } from 'zod';
import {
  Capability,
  ChatMessage,
  LLMProvider,
  VisionExtractRequest,
} from './types.js';
import { withRetry } from './retry.js';
import type { ZodDef } from './zodSchema.js';

const VISION_MODEL = 'gemini-2.5-flash';
const EMBED_MODEL = 'text-embedding-004';
const GOOGLE_EMBED_DIM = 768;
const VLM_TIMEOUT_MS = 8000;
const EMBED_TIMEOUT_MS = 3000;
const RERANK_TIMEOUT_MS = 6000;
const EMBED_BATCH_SIZE = 100;

export class GoogleProvider implements LLMProvider {
  readonly id = 'google' as const;
  readonly capabilities: ReadonlySet<Capability> = new Set([
    'vision_extract',
    'text_embed',
    'chat_text',
    'rerank',
  ]);

  private client: GoogleGenAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenAI({ apiKey });
  }

  textEmbedDimensions(): number {
    return GOOGLE_EMBED_DIM;
  }

  textEmbedModelId(): string {
    return EMBED_MODEL;
  }

  async visionExtract<T>(req: VisionExtractRequest, schema: ZodSchema<T>): Promise<T> {
    const base64 = Buffer.from(req.imageBytes).toString('base64');
    const responseSchema = buildGoogleSchema(schema);

    return withRetry(async () => {
      const response = await this.client.models.generateContent({
        model: VISION_MODEL,
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType: req.mimeType, data: base64 } },
              { text: req.instruction },
            ],
          },
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema,
        },
      });
      const text = response.text ?? '{}';
      return schema.parse(JSON.parse(text));
    }, { timeoutMs: VLM_TIMEOUT_MS });
  }

  async textEmbed(texts: string[]): Promise<Float32Array[]> {
    const results: Float32Array[] = [];
    for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
      const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
      for (const text of batch) {
        const vec = await withRetry(async () => {
          const response = await this.client.models.embedContent({
            model: EMBED_MODEL,
            contents: text,
          });
          return new Float32Array(response.embeddings?.[0]?.values ?? []);
        }, { timeoutMs: EMBED_TIMEOUT_MS });
        results.push(vec);
      }
    }
    return results;
  }

  async rerank(query: string, docs: string[]): Promise<number[]> {
    const payload = docs.map((d, i) => ({ index: i, text: d }));
    return withRetry(async () => {
      const response = await this.client.models.generateContent({
        model: VISION_MODEL,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text:
                  `Query: ${query}\n\nCandidates:\n${JSON.stringify(payload)}\n\n` +
                  'Return a JSON object {"ranked": [indices in descending order of relevance]}.',
              },
            ],
          },
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              ranked: { type: Type.ARRAY, items: { type: Type.INTEGER } },
            },
            required: ['ranked'],
          },
        },
      });
      const text = response.text ?? '{"ranked":[]}';
      const parsed = JSON.parse(text) as { ranked: number[] };
      return parsed.ranked ?? [];
    }, { timeoutMs: RERANK_TIMEOUT_MS });
  }

  async chatText(messages: ChatMessage[]): Promise<string> {
    const systemMsg = messages.find((m) => m.role === 'system');
    const userMsgs = messages.filter((m) => m.role !== 'system');
    return withRetry(async () => {
      const response = await this.client.models.generateContent({
        model: VISION_MODEL,
        contents: userMsgs.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
        config: systemMsg ? { systemInstruction: systemMsg.content } : undefined,
      });
      return response.text ?? '';
    }, { timeoutMs: RERANK_TIMEOUT_MS });
  }
}

function buildGoogleSchema(schema: ZodSchema): Record<string, unknown> {
  const def = (schema as unknown as { _def: ZodDef })._def;
  return zodDefToGoogleSchema(def);
}

function zodDefToGoogleSchema(def: ZodDef): Record<string, unknown> {
  switch (def.typeName) {
    case 'ZodString': return { type: Type.STRING };
    case 'ZodNumber': return { type: Type.NUMBER };
    case 'ZodBoolean': return { type: Type.BOOLEAN };
    case 'ZodOptional':
      return def.innerType ? zodDefToGoogleSchema(def.innerType._def) : { type: Type.STRING };
    case 'ZodArray':
      return { type: Type.ARRAY, items: def.items ? zodDefToGoogleSchema(def.items._def) : { type: Type.STRING } };
    case 'ZodEnum':
      return { type: Type.STRING, enum: def.values };
    case 'ZodObject': {
      if (!def.shape) return { type: Type.OBJECT, properties: {} };
      const shape = def.shape();
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      for (const [key, val] of Object.entries(shape)) {
        properties[key] = zodDefToGoogleSchema(val._def);
        if (val._def.typeName !== 'ZodOptional') required.push(key);
      }
      return { type: Type.OBJECT, properties, required };
    }
    default: return { type: Type.STRING };
  }
}
