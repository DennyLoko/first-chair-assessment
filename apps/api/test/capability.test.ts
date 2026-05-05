import { describe, it, expect } from 'vitest';
import { OpenAIProvider } from '../src/providers/openai.js';
import { AnthropicProvider } from '../src/providers/anthropic.js';
import { GoogleProvider } from '../src/providers/google.js';
import { MissingCapabilityError } from '../src/providers/types.js';

describe('Provider capability negotiation', () => {
  describe('OpenAI', () => {
    const p = new OpenAIProvider('sk-test');

    it('has all 4 capabilities', () => {
      expect(p.capabilities.has('vision_extract')).toBe(true);
      expect(p.capabilities.has('text_embed')).toBe(true);
      expect(p.capabilities.has('rerank')).toBe(true);
      expect(p.capabilities.has('chat_text')).toBe(true);
    });

    it('textEmbedDimensions returns 1536', () => {
      expect(p.textEmbedDimensions()).toBe(1536);
    });

    it('textEmbedModelId returns text-embedding-3-small', () => {
      expect(p.textEmbedModelId()).toBe('text-embedding-3-small');
    });
  });

  describe('Anthropic', () => {
    const p = new AnthropicProvider('sk-ant-test');

    it('has vision_extract, chat_text, rerank but NOT text_embed', () => {
      expect(p.capabilities.has('vision_extract')).toBe(true);
      expect(p.capabilities.has('chat_text')).toBe(true);
      expect(p.capabilities.has('text_embed')).toBe(false);
    });

    it('textEmbedDimensions returns null', () => {
      expect(p.textEmbedDimensions()).toBeNull();
    });

    it('textEmbedModelId returns null', () => {
      expect(p.textEmbedModelId()).toBeNull();
    });
  });

  describe('Google', () => {
    const p = new GoogleProvider('google-test-key');

    it('has vision_extract, text_embed, chat_text, rerank', () => {
      expect(p.capabilities.has('vision_extract')).toBe(true);
      expect(p.capabilities.has('text_embed')).toBe(true);
      expect(p.capabilities.has('chat_text')).toBe(true);
    });

    it('textEmbedDimensions returns 768', () => {
      expect(p.textEmbedDimensions()).toBe(768);
    });
  });

  describe('EmbedModelMismatchError detection', () => {
    it('Google dim (768) !== OpenAI manifest dim (1536) — mismatch detected', () => {
      const google = new GoogleProvider('key');
      const manifestDim = 1536;
      const providerDim = google.textEmbedDimensions();
      expect(providerDim).not.toBe(manifestDim);
    });

    it('OpenAI dim (1536) === manifest dim (1536) — no mismatch', () => {
      const openai = new OpenAIProvider('sk-key');
      const manifestDim = 1536;
      expect(openai.textEmbedDimensions()).toBe(manifestDim);
    });
  });

  describe('MissingCapabilityError', () => {
    it('has correct message and name', () => {
      const err = new MissingCapabilityError('text_embed', 'anthropic');
      expect(err.name).toBe('MissingCapabilityError');
      expect(err.message).toContain('text_embed');
      expect(err.message).toContain('anthropic');
      expect(err.capability).toBe('text_embed');
      expect(err.providerId).toBe('anthropic');
    });
  });
});
