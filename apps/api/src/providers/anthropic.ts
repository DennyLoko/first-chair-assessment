import Anthropic from '@anthropic-ai/sdk';
import { ZodSchema } from 'zod';
import {
  Capability,
  ChatMessage,
  LLMProvider,
  MissingCapabilityError,
  VisionExtractRequest,
} from './types.js';
import { withRetry } from './retry.js';
import type { ZodDef } from './zodSchema.js';

const VISION_MODEL = 'claude-sonnet-4-5';
const VLM_TIMEOUT_MS = 8000;
const RERANK_TIMEOUT_MS = 6000;

export class AnthropicProvider implements LLMProvider {
  readonly id = 'anthropic' as const;
  readonly capabilities: ReadonlySet<Capability> = new Set([
    'vision_extract',
    'chat_text',
    'rerank',
  ]);

  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  textEmbedDimensions(): null {
    return null;
  }

  textEmbedModelId(): null {
    return null;
  }

  async visionExtract<T>(req: VisionExtractRequest, schema: ZodSchema<T>): Promise<T> {
    const base64 = Buffer.from(req.imageBytes).toString('base64');
    const jsonSchema = zodToJsonSchema(schema);

    return withRetry(async () => {
      const response = await this.client.messages.create({
        model: VISION_MODEL,
        max_tokens: 1024,
        tools: [
          {
            name: 'extract_product_info',
            description: req.instruction,
            input_schema: jsonSchema as Anthropic.Tool['input_schema'],
          },
        ],
        tool_choice: { type: 'tool', name: 'extract_product_info' },
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: req.mimeType,
                  data: base64,
                },
              },
              { type: 'text', text: req.instruction },
            ],
          },
        ],
      });

      const toolUse = response.content.find((b) => b.type === 'tool_use');
      if (!toolUse || toolUse.type !== 'tool_use') {
        throw new Error('Anthropic visionExtract: no tool_use block in response');
      }
      return schema.parse(toolUse.input);
    }, { timeoutMs: VLM_TIMEOUT_MS });
  }

  async textEmbed(_texts: string[]): Promise<Float32Array[]> {
    throw new MissingCapabilityError('text_embed', 'anthropic');
  }

  async rerank(query: string, docs: string[]): Promise<number[]> {
    const payload = docs.map((d, i) => ({ index: i, text: d }));
    return withRetry(async () => {
      const response = await this.client.messages.create({
        model: VISION_MODEL,
        max_tokens: 512,
        tools: [
          {
            name: 'rerank_results',
            description: 'Return the candidate indices in descending order of relevance to the query.',
            input_schema: {
              type: 'object' as const,
              properties: {
                ranked: {
                  type: 'array',
                  items: { type: 'integer' },
                  description: 'Candidate indices ordered by relevance, most relevant first.',
                },
              },
              required: ['ranked'],
            },
          },
        ],
        tool_choice: { type: 'tool', name: 'rerank_results' },
        messages: [
          {
            role: 'user',
            content: `Query: ${query}\n\nCandidates:\n${JSON.stringify(payload)}`,
          },
        ],
      });

      const toolUse = response.content.find((b) => b.type === 'tool_use');
      if (!toolUse || toolUse.type !== 'tool_use') return [];
      const parsed = toolUse.input as { ranked: number[] };
      return parsed.ranked ?? [];
    }, { timeoutMs: RERANK_TIMEOUT_MS });
  }

  async chatText(messages: ChatMessage[]): Promise<string> {
    const systemMsg = messages.find((m) => m.role === 'system');
    const userMsgs = messages.filter((m) => m.role !== 'system');
    return withRetry(async () => {
      const response = await this.client.messages.create({
        model: VISION_MODEL,
        max_tokens: 1024,
        system: systemMsg?.content,
        messages: userMsgs.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
      });
      const textBlock = response.content.find((b) => b.type === 'text');
      return textBlock && textBlock.type === 'text' ? textBlock.text : '';
    }, { timeoutMs: RERANK_TIMEOUT_MS });
  }
}

function zodToJsonSchema(schema: ZodSchema): Record<string, unknown> {
  const def = (schema as unknown as { _def: ZodDef })._def;
  return zodDefToJsonSchema(def);
}

function zodDefToJsonSchema(def: ZodDef): Record<string, unknown> {
  switch (def.typeName) {
    case 'ZodString': return { type: 'string' };
    case 'ZodNumber': return { type: 'number' };
    case 'ZodBoolean': return { type: 'boolean' };
    case 'ZodOptional':
      return def.innerType ? zodDefToJsonSchema(def.innerType._def) : { type: 'string' };
    case 'ZodArray':
      return { type: 'array', items: def.items ? zodDefToJsonSchema(def.items._def) : { type: 'string' } };
    case 'ZodEnum':
      return { type: 'string', enum: def.values };
    case 'ZodObject': {
      if (!def.shape) return { type: 'object', properties: {} };
      const shape = def.shape();
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      for (const [key, val] of Object.entries(shape)) {
        properties[key] = zodDefToJsonSchema(val._def);
        if (val._def.typeName !== 'ZodOptional') required.push(key);
      }
      return { type: 'object', properties, required };
    }
    default: return { type: 'string' };
  }
}
