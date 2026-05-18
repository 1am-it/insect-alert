/**
 * Vendor-agnostic text-classification utility.
 *
 * Public interface. Delegates to vendor-specific adapters in `./adapters/`.
 * Mirror of `scanImage.js` for text-classification — same registry pattern,
 * different input contract (question instead of imageBuffer+mimeType).
 *
 * Designed to be lifted as-is alongside scanImage into a shared npm package
 * once a second project needs the same pattern (see Linear 1AM-131). Until
 * then, lives here.
 *
 * Usage:
 *   const result = await classifyText({
 *     question, prompt, schema,
 *     vendor: 'gemini',
 *     options: { model, timeoutMs }
 *   });
 *
 * Adding a new vendor:
 *   1. Create `./adapters/<vendor>-text.js` exporting a `scan({...})` function
 *   2. Register it in the `adapters` map below
 *   3. No changes to public API needed
 *
 * Last reviewed: 2026-05-17 (1AM-236)
 */

import { scan as geminiScan } from './adapters/gemini-text.js';

/**
 * Registry of vendor adapters. Keys are vendor identifiers used by callers.
 * Values are async functions matching the adapter contract — see
 * adapters/gemini-text.js.
 */
const adapters = {
  gemini: geminiScan,
  // Future: anthropic: anthropicScan, openai: openaiScan
};

/**
 * Classify a text question with an LLM and return parsed JSON matching the schema.
 *
 * @param {Object} params
 * @param {string} params.question - User question to classify
 * @param {string} params.prompt - Classifier system instruction
 * @param {Object} params.schema - JSON schema describing expected output
 * @param {'gemini'} [params.vendor='gemini'] - Which vendor to use
 * @param {Object} [params.options] - Vendor-specific options (model, timeoutMs, apiKey, etc.)
 * @returns {Promise<Object>} Parsed structured response
 * @throws {Error} On invalid input, unknown vendor, or vendor-side failure
 */
export async function classifyText({
  question,
  prompt,
  schema,
  vendor = 'gemini',
  options = {},
}) {
  // Vendor-agnostic input validation — fail fast with clear errors
  if (!question || typeof question !== 'string') {
    throw new Error('classifyText: question is required');
  }
  if (!prompt || typeof prompt !== 'string') {
    throw new Error('classifyText: prompt is required');
  }
  if (!schema || typeof schema !== 'object') {
    throw new Error('classifyText: schema is required');
  }
  const adapter = adapters[vendor];
  if (!adapter) {
    const supported = Object.keys(adapters).join(', ');
    throw new Error(
      `classifyText: unsupported vendor "${vendor}". Supported: ${supported}`
    );
  }
  return adapter({ question, prompt, schema, options });
}
