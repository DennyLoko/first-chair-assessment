import { VlmJsonSchema, type VlmJson } from '@first-chair/shared';
import type { LLMProvider, VisionExtractRequest } from '../providers/types.js';
import { MissingCapabilityError } from '../providers/types.js';

const INSTRUCTION = `Analyze this furniture product image and return a JSON object with:
- category: broad category (e.g. "chair", "table", "sofa", "shelf", "bed")
- type: specific type (e.g. "office chair", "coffee table", "sectional sofa")
- materials: array of visible materials (e.g. ["leather", "steel", "wood"])
- palette: array of dominant colors (e.g. ["black", "walnut brown"])
- dims: optional object with width, height, depth in cm if estimable from image
- features: array of notable features (e.g. ["adjustable height", "armrests", "lumbar support"])
- caption: one sentence describing the product for search purposes`;

export async function extractVlmJson(
  provider: LLMProvider,
  imageBytes: Uint8Array,
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
): Promise<VlmJson> {
  if (!provider.capabilities.has('vision_extract') || !provider.visionExtract) {
    throw new MissingCapabilityError('vision_extract', provider.id);
  }

  const req: VisionExtractRequest = {
    imageBytes,
    mimeType,
    instruction: INSTRUCTION,
  };

  return provider.visionExtract(req, VlmJsonSchema);
}
