import { LLMProvider } from './types.js';
import { OpenAIProvider } from './openai.js';
import { AnthropicProvider } from './anthropic.js';
import { GoogleProvider } from './google.js';

export type ProviderId = 'openai' | 'anthropic' | 'google';

export function createProvider(id: ProviderId, apiKey: string): LLMProvider {
  switch (id) {
    case 'openai':
      return new OpenAIProvider(apiKey);
    case 'anthropic':
      return new AnthropicProvider(apiKey);
    case 'google':
      return new GoogleProvider(apiKey);
  }
}

export { OpenAIProvider } from './openai.js';
export { AnthropicProvider } from './anthropic.js';
export { GoogleProvider } from './google.js';
export * from './types.js';
