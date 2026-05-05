/**
 * Vendor-agnostic vision-scan utility.
 *
 * Public interface. Delegates to vendor-specific adapters in `./adapters/`.
 * Designed to be lifted as-is into a shared npm package once a second project
 * needs the same pattern (see Linear 1AM-131). Until then, lives here.
 *
 * Usage:
 *   const result = await scanImage({
 *     imageBuffer, mimeType, prompt, schema,
 *     vendor: 'gemini',
 *     options: { model, timeoutMs }
 *   });
 *
 * Adding a new vendor:
 *   1. Create `./adapters/<vendor>.js` exporting a `scan({...})` function
 *   2. Register it in the `adapters` map below
 *   3. No changes to public API needed
 *
 * Last reviewed: 2026-05-04 (1AM-57)
 */

import { scan as geminiScan } from './adapters/gemini.js';

/**
 * Registry of vendor adapters. Keys are vendor identifiers used by callers.
 * Values are async functions matching the adapter contract — see adapters/gemini.js.
 */
const adapters = {
  gemini: geminiScan,
  // Future: anthropic: anthropicScan, openai: openaiScan
};

/**
 * Scan an image with a vision-LLM and return parsed JSON matching the schema.
 *
 * @param {Object} params
 * @param {Buffer|Uint8Array} params.imageBuffer - Image bytes
 * @param {string} params.mimeType - MIME type (e.g. "image/jpeg")
 * @param {string} params.prompt - Instruction for the model
 * @param {Object} params.schema - JSON schema describing expected output
 * @param {'gemini'} [params.vendor='gemini'] - Which vendor to use
 * @param {Object} [params.options] - Vendor-specific options (model, timeoutMs, apiKey, etc.)
 * @returns {Promise<Object>} Parsed structured response
 * @throws {Error} On invalid input, unknown vendor, or vendor-side failure
 */
export async function scanImage({
  imageBuffer,
  mimeType,
  prompt,
  schema,
  vendor = 'gemini',
  options = {},
}) {
  // Vendor-agnostic input validation — fail fast with clear errors
  if (!imageBuffer || imageBuffer.length === 0) {
    throw new Error('scanImage: imageBuffer is required and cannot be empty');
  }
  if (!mimeType || typeof mimeType !== 'string') {
    throw new Error('scanImage: mimeType is required (e.g. "image/jpeg")');
  }
  if (!prompt || typeof prompt !== 'string') {
    throw new Error('scanImage: prompt is required');
  }
  if (!schema || typeof schema !== 'object') {
    throw new Error('scanImage: schema is required');
  }

  const adapter = adapters[vendor];
  if (!adapter) {
    const supported = Object.keys(adapters).join(', ');
    throw new Error(
      `scanImage: unsupported vendor "${vendor}". Supported: ${supported}`
    );
  }

  return adapter({ imageBuffer, mimeType, prompt, schema, options });
}
