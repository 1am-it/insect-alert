/**
 * Gemini vision adapter for scanImage.
 *
 * Adapter contract — every vendor adapter exports `scan({...})` with the same
 * signature. Vendor-specific options live in `params.options` (model, timeout,
 * apiKey, etc.). The public scanImage interface validates inputs before
 * calling here, so adapters can assume non-empty imageBuffer/prompt/schema.
 *
 * SDK-auth setup is delegated to `_gemini-client.js` (see 1AM-234). This file
 * focuses on vision-specific request construction and timeout handling.
 *
 * Last reviewed: 2026-05-26 (1AM-248)
 */

import { createClient } from './_gemini-client.js';

const DEFAULT_MODEL = 'gemini-2.5-flash';
const DEFAULT_TIMEOUT_MS = 15000;

/**
 * Run a vision scan via Gemini.
 *
 * @param {Object} params
 * @param {Buffer|Uint8Array} params.imageBuffer
 * @param {string} params.mimeType
 * @param {string} params.prompt
 * @param {Object} params.schema - JSON schema for response
 * @param {Object} [params.options]
 * @param {string} [params.options.model]
 * @param {number} [params.options.timeoutMs]
 * @param {string} [params.options.apiKey] - Override GEMINI_API_KEY env var
 * @returns {Promise<Object>}
 */
export async function scan({ imageBuffer, mimeType, prompt, schema, options = {} }) {
  const model = options.model || DEFAULT_MODEL;
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;

  // Delegate SDK + API key handling to _gemini-client.
  // createClient throws "gemini-client: GEMINI_API_KEY env var is not set"
  // when no key is available. Re-prefix to keep the existing
  // "gemini adapter: ..." error contract from this module's callers.
  let ai;
  try {
    ai = createClient(options.apiKey);
  } catch (error) {
    throw new Error(`gemini adapter: ${error.message}`);
  }

  // Convert buffer to base64 — Gemini's inlineData expects a base64 string
  const base64Image = Buffer.isBuffer(imageBuffer)
    ? imageBuffer.toString('base64')
    : Buffer.from(imageBuffer).toString('base64');

  // Race the API call against a manual timeout — Gemini SDK doesn't accept
  // AbortSignal directly, so we wrap with Promise.race
  const apiCall = ai.models.generateContent({
    model,
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType,
              data: base64Image,
            },
          },
        ],
      },
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: schema,
    },
  });

  const timeout = new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error(`gemini adapter: request timed out after ${timeoutMs}ms`)),
      timeoutMs
    )
  );

  let response;
  try {
    response = await Promise.race([apiCall, timeout]);
  } catch (error) {
    // Re-throw with adapter prefix for easier debugging
    if (error.message.startsWith('gemini adapter:')) {
      throw error;
    }
    throw new Error(`gemini adapter: ${error.message}`);
  }

  const text = response.text;
  if (!text) {
    throw new Error('gemini adapter: empty response from model');
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (parseError) {
    throw new Error(
      `gemini adapter: model returned invalid JSON — ${parseError.message}`
    );
  }

  return parsed;
}
