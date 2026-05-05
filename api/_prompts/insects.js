/**
 * Domain-specific prompt + schema for InsectAlert photo scanning.
 *
 * This file is domain-coupled: insect-aware. Pairs with the domain-agnostic
 * scanImage utility in `_lib/scanImage.js`. Keep these two files separate so
 * the utility can be lifted to other projects unchanged.
 *
 * Strategy:
 * - Vision-LLM extracts the raw ingredient list from the photo (OCR-equivalent).
 * - The detector (src/detector.js) runs pattern-matching on that text — same
 *   logic as the paste-flow.
 * - Why not let the vision-LLM also classify (gevonden/niet-gevonden)?
 *   Because pattern-matching is deterministic and version-controlled. The
 *   moment we add a new pattern (e.g. zwarte soldatenvlieg goes live), we
 *   want consistency between paste-flow and photo-flow. One detector, one
 *   source of truth.
 *
 * Last reviewed: 2026-05-04 (1AM-57)
 */

export const insectExtractionPrompt = `
Extract the ingredient list from this product label photo.

Return ONLY the ingredient text, exactly as it appears on the label, in the
original language. Preserve all Latin names (e.g. "Acheta domesticus"),
E-numbers (e.g. "E120"), and percentage indicators (e.g. "(2%)").

If the image contains no readable ingredient list (blurry, unrelated photo,
nutrition table only, etc.), set "readable" to false and "ingredientText" to
an empty string.

Do not translate. Do not summarize. Do not add commentary. Return the raw
ingredient text as a single string.
`.trim();

/**
 * Response schema for the extraction step.
 * Gemini will populate these fields per the OpenAPI-style schema.
 */
export const insectExtractionSchema = {
  type: 'object',
  properties: {
    readable: {
      type: 'boolean',
      description: 'True if an ingredient list could be extracted from the image',
    },
    ingredientText: {
      type: 'string',
      description: 'The raw ingredient list as it appears on the label',
    },
    detectedLanguage: {
      type: 'string',
      description: 'ISO 639-1 code of the detected language (e.g. "nl", "en", "de")',
    },
  },
  required: ['readable', 'ingredientText'],
};
