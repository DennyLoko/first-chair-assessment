import OpenAI from 'openai';
import { ZodSchema } from 'zod';
import {
  Capability,
  ChatMessage,
  LLMProvider,
  MissingCapabilityError,
  VisionExtractRequest,
} from './types.js';

const EMBED_MODEL_SMALL = 'text-embedding-3-small';
const EMBED_MODEL_LARGE = 'text-embedding-3-large';
const EMBED_DIM_SMALL = 1536;
const EMBED_DIM_LARGE = 3072;
const EMBED_BATCH_SIZE = 100;
const VISION_MODEL = 'gpt-4o-mini';
const RERANK_MODEL = 'gpt-4o-mini';

export class OpenAIProvider implements LLMProvider {
  readonly id = 'openai' as const;
  readonly capabilities: ReadonlySet<Capability> = new Set([
    'vision_extract',
    'text_embed',
    'rerank',
    'chat_text',
  ]);

  private client: OpenAI;
  private embedModel: string;

  constructor(apiKey: string, embedModel: string = EMBED_MODEL_SMALL) {
    this.client = new OpenAI({ apiKey });
    this.embedModel = embedModel;
  }

  textEmbedDimensions(): number {
    return this.embedModel === EMBED_MODEL_LARGE ? EMBED_DIM_LARGE : EMBED_DIM_SMALL;
  }

  textEmbedModelId(): string {
    return this.embedModel;
  }

  async visionExtract<T>(req: VisionExtractRequest, schema: ZodSchema<T>): Promise<T> {
    const base64 = Buffer.from(req.imageBytes).toString('base64');
    const dataUrl = `data:${req.mimeType};base64,${base64}`;

    const attempt = async (): Promise<T> => {
      const response = await this.client.chat.completions.create({
        model: VISION_MODEL,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: dataUrl } },
              { type: 'text', text: req.instruction },
            ],
          },
        ],
      });
      const raw = response.choices[0]?.message?.content ?? '{}';
      return schema.parse(JSON.parse(raw));
    };

    try {
      return await attempt();
    } catch {
      return await attempt();
    }
  }

  async textEmbed(texts: string[]): Promise<Float32Array[]> {
    const results: Float32Array[] = [];
    for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
      const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
      const response = await this.client.embeddings.create({
        model: this.embedModel,
        input: batch,
        encoding_format: 'float',
      });
      for (const item of response.data) {
        results.push(new Float32Array(item.embedding));
      }
    }
    return results;
  }

  async rerank(query: string, docs: string[]): Promise<number[]> {
    const payload = docs.map((d, i) => ({ index: i, text: d }));
    const response = await this.client.chat.completions.create({
      model: RERANK_MODEL,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You are a reranking assistant. Given a query and a list of candidates, return a JSON object with key "ranked" containing the candidate indices in descending order of relevance to the query.',
        },
        {
          role: 'user',
          content: `Query: ${query}\n\nCandidates:\n${JSON.stringify(payload)}`,
        },
      ],
    });
    const raw = response.choices[0]?.message?.content ?? '{"ranked":[]}';
    const parsed = JSON.parse(raw) as { ranked: number[] };
    return parsed.ranked;
  }

  async chatText(messages: ChatMessage[]): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: RERANK_MODEL,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });
    return response.choices[0]?.message?.content ?? '';
  }
}
