/**
 * Gemini vision adapter for scanImage.
 *
 * Adapter contract — every vendor adapter exports `scan({...})` with the same
 * signature. Vendor-specific options live in `params.options` (model, timeout,
 * apiKey, etc.). The public scanImage interface validates inputs before
 * calling here, so adapters can assume non-empty imageBuffer/prompt/schema.
 *
 * Last reviewed: 2026-05-04 (1AM-57)
 */

import { GoogleGenAI } from '@google/genai';

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
  const apiKey = options.apiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('gemini adapter: GEMINI_API_KEY env var is not set');
  }

  const model = options.model || DEFAULT_MODEL;
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;

  const ai = new GoogleGenAI({ apiKey });

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
