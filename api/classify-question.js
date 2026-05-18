/**
 * Vercel serverless function — POST /api/classify-question
 *
 * Accepts a user follow-up question and returns routing-metadata: which
 * category the question falls into, which UI component should render the
 * answer, and what data query to run. Does NOT generate the answer itself —
 * answer-generation lives in the frontend resolver-layer + component library.
 *
 * Why this endpoint exists:
 *   InsectAlert positions itself as a strict ingredient-decoder. Free-form
 *   LLM answers risk hallucinating outside that scope (medical/halal/etc.).
 *   By forcing all LLM output through a bounded category schema, the LLM
 *   can only route — never invent.
 *
 * Stateless — no user questions are persisted. Vercel function logs may
 * capture requests for debugging but are subject to log retention policies,
 * not application-level storage.
 *
 * Two failure modes, two response shapes:
 *   - Real error states (Gemini down/timeout/missing key) → 503/504/500
 *     with error code. Frontend shows "temporarily unavailable".
 *   - Recoverable LLM-output issues (invalid JSON, unknown enum, missing
 *     required field) → 200 OK with fallback ambiguous object. Frontend
 *     shows a clarification-card.
 *
 * Last reviewed: 2026-05-17 (1AM-238)
 */

import { classifyText } from './_lib/classifyText.js';
import {
  questionClassifierPrompt,
  questionClassifierSchema,
} from './_prompts/question-classifier.js';

export const config = {
  runtime: 'nodejs',
  maxDuration: 10,
};

const MAX_QUESTION_LENGTH = 1000;

// Valid enum values — mirror of question-classifier.js schema.
// Used for backend-side validation: unknown values trigger fallback.
const VALID_CATEGORIES = ['decoder', 'regulation', 'deflection', 'ambiguous'];
const VALID_COMPONENTS = [
  'decoder-card',
  'list-card',
  'timeline-card',
  'deflection-card',
  'clarification-card',
];
const VALID_DEFLECTION_TARGETS = [
  'HVN',
  'huisarts',
  'huisartsenpost',
  'Voedingscentrum',
  'NVWA',
  'scan-product',
  'recipe-out-of-scope',
  'foreign-authority',
];
const VALID_CONFIDENCE = ['high', 'medium', 'low'];

/**
 * Fallback response shown when the classifier produces invalid output.
 * Frontend renders this as a clarification-card asking the user to rephrase.
 */
const FALLBACK_AMBIGUOUS = {
  category: 'ambiguous',
  component: 'clarification-card',
  dataQuery: {},
  deflectionTarget: null,
  confidence: 'low',
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'method_not_allowed',
      message: 'Only POST is supported',
    });
  }

  try {
    const body = await readJsonBody(req);
    if (!body || typeof body.question !== 'string') {
      return res.status(400).json({
        error: 'invalid_body',
        message: 'Request body must be JSON with a "question" field',
      });
    }

    const question = body.question.trim();

    if (question.length === 0) {
      return res.status(400).json({
        error: 'empty_question',
        message: 'Geen vraag ontvangen',
      });
    }

    if (question.length > MAX_QUESTION_LENGTH) {
      return res.status(413).json({
        error: 'question_too_long',
        message: `Vraag is te lang (max ${MAX_QUESTION_LENGTH} tekens)`,
      });
    }

    // Call classifier — may throw on Gemini-down/timeout/missing-key.
    // These throws are caught below and mapped to real error responses.
    let response;
    try {
      response = await classifyText({
        question,
        prompt: questionClassifierPrompt,
        schema: questionClassifierSchema,
        vendor: 'gemini',
      });
    } catch (error) {
      return mapClassifierError(error, res);
    }

    // Validate classifier output. Any failure → fallback ambiguous (200 OK).
    const validated = validateResponse(response);
    return res.status(200).json(validated);
  } catch (error) {
    // Unexpected error — log without leaking internals
    console.error('[classify-question] unexpected error:', truncate(error.message, 200));
    return res.status(500).json({
      error: 'classification_failed',
      message: 'Er ging iets mis bij het analyseren van je vraag.',
    });
  }
}

/**
 * Validate classifier response against the schema's enum constraints and
 * category-specific required dataQuery fields. Returns either the validated
 * response (possibly with confidence safety-net applied) or the fallback
 * ambiguous object.
 *
 * Per question-classifier.js header comment:
 *   - category=decoder    → dataQuery.lookup required
 *   - category=regulation → dataQuery.topic required
 *   - category=deflection → dataQuery.topicType required + deflectionTarget non-null
 *   - category=ambiguous  → dataQuery.clarificationType required
 */
function validateResponse(response) {
  if (!response || typeof response !== 'object') {
    console.error('[classify-question] invalid response: not an object');
    return FALLBACK_AMBIGUOUS;
  }

  // Required top-level fields
  const requiredFields = ['category', 'component', 'dataQuery', 'confidence'];
  for (const field of requiredFields) {
    if (response[field] === undefined || response[field] === null) {
      if (field !== 'dataQuery' || response[field] === undefined) {
        console.error(`[classify-question] missing field: ${field}`);
        return FALLBACK_AMBIGUOUS;
      }
    }
  }

  // Enum validation on top-level fields
  if (!VALID_CATEGORIES.includes(response.category)) {
    console.error(`[classify-question] unknown enum: category=${response.category}`);
    return FALLBACK_AMBIGUOUS;
  }
  if (!VALID_COMPONENTS.includes(response.component)) {
    console.error(`[classify-question] unknown enum: component=${response.component}`);
    return FALLBACK_AMBIGUOUS;
  }
  if (!VALID_CONFIDENCE.includes(response.confidence)) {
    console.error(`[classify-question] unknown enum: confidence=${response.confidence}`);
    return FALLBACK_AMBIGUOUS;
  }
  if (
    response.deflectionTarget !== null &&
    response.deflectionTarget !== undefined &&
    !VALID_DEFLECTION_TARGETS.includes(response.deflectionTarget)
  ) {
    console.error(
      `[classify-question] unknown enum: deflectionTarget=${response.deflectionTarget}`
    );
    return FALLBACK_AMBIGUOUS;
  }

  // Normalize dataQuery to an object (Gemini may return null for empty objects)
  const dataQuery = response.dataQuery || {};

  // Category-specific required-field check
  const categoryRequired = {
    decoder: 'lookup',
    regulation: 'topic',
    deflection: 'topicType',
    ambiguous: 'clarificationType',
  };
  const requiredQueryField = categoryRequired[response.category];
  if (!dataQuery[requiredQueryField]) {
    console.error(
      `[classify-question] missing field: dataQuery.${requiredQueryField} for category=${response.category}`
    );
    return FALLBACK_AMBIGUOUS;
  }

  // deflection requires deflectionTarget to be non-null
  if (response.category === 'deflection' && !response.deflectionTarget) {
    console.error('[classify-question] missing field: deflectionTarget for deflection');
    return FALLBACK_AMBIGUOUS;
  }

  // Confidence safety-net: low + non-ambiguous is potential hallucination
  if (response.confidence === 'low' && response.category !== 'ambiguous') {
    console.error(
      `[classify-question] low confidence on category=${response.category}, forcing fallback`
    );
    return FALLBACK_AMBIGUOUS;
  }

  // All checks passed — return normalized response
  return {
    category: response.category,
    component: response.component,
    dataQuery,
    deflectionTarget: response.deflectionTarget || null,
    confidence: response.confidence,
  };
}

/**
 * Map adapter-side errors (Gemini unreachable, timeout, missing API key) to
 * appropriate HTTP responses. These are "real error states" per 1AM-232
 * sectie 6 — frontend should show a temporarily-unavailable message, NOT
 * a clarification-card.
 */
function mapClassifierError(error, res) {
  const message = (error.message || '').toLowerCase();

  if (message.includes('timed out') || message.includes('timeout')) {
    console.error('[classify-question] timeout');
    return res.status(504).json({
      error: 'timeout',
      message: 'De analyse duurde te lang. Probeer een kortere vraag.',
    });
  }

  if (message.includes('api_key') || message.includes('api key') || message.includes('apikey')) {
    console.error('[classify-question] GEMINI_API_KEY not set');
    return res.status(500).json({
      error: 'configuration',
      message: 'De vragenfunctie is tijdelijk niet beschikbaar.',
    });
  }

  console.error('[classify-question] gemini unreachable:', truncate(error.message, 200));
  return res.status(503).json({
    error: 'service_unavailable',
    message: 'De vragenfunctie is tijdelijk niet beschikbaar. Probeer het later opnieuw.',
  });
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function truncate(str, maxLength) {
  if (!str) return '';
  return str.length > maxLength ? str.slice(0, maxLength) + '...' : str;
}
