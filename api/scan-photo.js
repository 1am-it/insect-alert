/**
 * Vercel serverless function — POST /api/scan-photo
 *
 * Accepts a single image upload via multipart/form-data, extracts the ingredient
 * text using vision-LLM (Gemini), then runs the same detector as the paste-flow
 * (1AM-56) for a consistent result format.
 *
 * Two-stage architecture:
 *   1. Vision-LLM extracts raw ingredient text from photo
 *   2. Local detector (deterministic regex-based) classifies state + matches
 *
 * Why two stages instead of asking the LLM to do everything:
 *   - Single source of truth: detector + patterns are version-controlled and
 *     unit-tested. New patterns added via patterns.js automatically work for
 *     both paste-flow and photo-flow without prompt changes.
 *   - Cheaper: model only does OCR-equivalent extraction, no classification.
 *   - Reproducible: regex matching is deterministic; LLM classification is not.
 *
 * Last reviewed: 2026-05-04 (1AM-57)
 */

import { scanImage } from './_lib/scanImage.js';
import {
  insectExtractionPrompt,
  insectExtractionSchema,
} from './_prompts/insects.js';
import { detect } from '../src/detector.js';

// Vercel runtime config — Node.js for Buffer support
export const config = {
  runtime: 'nodejs',
  maxDuration: 30,
};

// Limit upload size to prevent abuse — phones produce ~3-8MB, after compression ~500KB
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB

export default async function handler(req, res) {
  // CORS — same-origin in production, but explicit for clarity
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'method_not_allowed',
      message: 'Only POST is supported',
    });
  }

  try {
    // Read the raw body — Vercel passes a stream for Node.js runtime
    const imageBuffer = await readRequestBody(req, MAX_IMAGE_BYTES);

    if (!imageBuffer || imageBuffer.length === 0) {
      return res.status(400).json({
        error: 'no_image',
        message: 'No image data received',
      });
    }

    // Determine MIME type from Content-Type header — frontend sets this
    // explicitly when constructing the FormData entry
    const mimeType = req.headers['content-type']?.split(';')[0]?.trim() || 'image/jpeg';

    if (!mimeType.startsWith('image/')) {
      return res.status(400).json({
        error: 'invalid_content_type',
        message: 'Content-Type must be an image type',
      });
    }

    // Stage 1: vision-LLM extracts raw ingredient text from the photo
    const extraction = await scanImage({
      imageBuffer,
      mimeType,
      prompt: insectExtractionPrompt,
      schema: insectExtractionSchema,
      vendor: 'gemini',
    });

    // If the photo had no readable ingredient list, return error state
    // so the frontend can show the "make a sharper photo" hint
    if (!extraction.readable || !extraction.ingredientText?.trim()) {
      return res.status(200).json({
        state: 'error',
        reason: 'no_text_detected',
        message: 'Geen ingrediëntenlijst herkend in de foto',
      });
    }

    // Stage 2: run the same detector as paste-flow on the extracted text
    const detection = detect(extraction.ingredientText);

    return res.status(200).json({
      state: detection.state,
      matches: detection.matches,
      // Include extracted text for debugging + transparency to the user
      // (we may show "we read this from your photo: ..." in the UI later)
      extractedText: extraction.ingredientText,
      detectedLanguage: extraction.detectedLanguage || null,
    });
  } catch (error) {
    // Log to Vercel function logs for debugging — don't leak internals to client
    console.error('[scan-photo] error:', error.message);

    // Map known error patterns to user-friendly messages
    const message = error.message.toLowerCase();
    if (message.includes('timed out')) {
      return res.status(504).json({
        error: 'timeout',
        message: 'De foto-analyse duurde te lang. Probeer het opnieuw.',
      });
    }
    if (message.includes('api_key') || message.includes('apikey')) {
      // Configuration issue — production should never see this if env var is set
      return res.status(500).json({
        error: 'configuration',
        message: 'De fotoscanner is tijdelijk niet beschikbaar.',
      });
    }

    return res.status(500).json({
      error: 'scan_failed',
      message: 'Er ging iets mis bij het analyseren van de foto.',
    });
  }
}

/**
 * Read the entire request body into a Buffer with a size cap.
 * Throws if the body exceeds maxBytes.
 */
async function readRequestBody(req, maxBytes) {
  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of req) {
    totalBytes += chunk.length;
    if (totalBytes > maxBytes) {
      throw new Error(`request body exceeds max size of ${maxBytes} bytes`);
    }
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}
