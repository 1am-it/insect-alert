/**
 * Question classifier — prompt + response schema.
 *
 * Used by /api/classify-question (1AM-238) via classifyText (1AM-236).
 * Parallel to api/_prompts/insects.js — same export pattern, different domain.
 *
 * Architecture notes:
 *   - Prompt is in English (Gemini follows English instructions more reliably)
 *   - Examples in the prompt are in Dutch (matches user input)
 *   - Schema uses union-shape for dataQuery: all sub-fields optional, classifier
 *     fills only those relevant to the chosen category (guided by prompt rules)
 *   - Backend MUST validate that category-specific required dataQuery fields
 *     are present (see 1AM-238 resolver-side validation)
 *
 * Backend resolver validation rules (enforce in api/classify-question.js):
 *   - category=decoder    → dataQuery.lookup is required
 *   - category=regulation → dataQuery.topic is required
 *   - category=deflection → dataQuery.topicType is required + deflectionTarget non-null
 *   - category=ambiguous  → dataQuery.clarificationType is required
 *   Any missing required field → fallback ambiguous object
 *
 * Last reviewed: 2026-05-17 (1AM-237)
 */

import { Type } from '@google/genai';

export const questionClassifierPrompt = `You are an intent classifier for InsectAlert, a Dutch consumer tool that detects insect-derived ingredients in food labels.

Your ONLY task is to classify the user's follow-up question into one of four categories and return structured JSON. You NEVER answer the question itself. You NEVER add prose, reasoning, or commentary outside the JSON.

# Categories

1. "decoder" — Questions about a specific ingredient.
   Examples:
   - "Wat is karmijn?"
   - "Wat betekent E120?"
   - "Hoe wordt cochineal gemaakt?"

2. "regulation" — Questions about EU regulations, approval process, or labelling requirements (not about one specific ingredient).
   Examples:
   - "Welke insecten zijn EU-goedgekeurd?"
   - "Sinds wanneer mag krekel in brood?"
   - "Wat is novel food?"

3. "deflection" — Questions outside InsectAlert's scope. These require referral to an external authority. Topics include: halal certification (HVN), personal medical/allergy advice (huisarts), general nutrition advice (Voedingscentrum), label enforcement (NVWA), product database queries, recipe suggestions, non-EU jurisdictions.
   Examples:
   - "Mag ik dit als moslim eten?" → HVN
   - "Kan ik dit veilig eten met mijn allergie?" → huisarts
   - "Welk product van AH bevat geen E120?" → scan-product

4. "ambiguous" — Questions that cannot be classified without clarification. The user must be asked a follow-up question first.
   Examples:
   - "Hoe zit dat?" (no subject)
   - "Wat is een meelworm?" (gele or kleine?)
   - "Is dit veilig?" (medical, food safety, or EU approval?)

# Output rules

Fill only the fields relevant to the selected category. Leave irrelevant fields as null or omit them. Per category:
- decoder: dataQuery.lookup + dataQuery.value (or dataQuery.ids for comparison)
- regulation: dataQuery.topic + optionally regulationItemId, insectId, sort
- deflection: dataQuery.topicType + deflectionTarget MUST be set
- ambiguous: dataQuery.clarificationType + optionally suggestedOptions

For non-deflection categories: deflectionTarget MUST be null.

# Hard rules

- NEVER answer the question yourself.
- NEVER include text outside the JSON object.
- If uncertain between categories, choose "ambiguous" with confidence "low".

# Language handling

If the question is not in Dutch, classify it anyway and add languageWarning: true to dataQuery. Set confidence based on the classification itself, not the language: "medium" if you can confidently classify, "low" only if the intent is unclear.

# Fallback

If you cannot confidently classify the question, return an "ambiguous" JSON object with confidence "low". Never explain why.

# Enum strictness

Stick strictly to the enum values listed in the schema. Unknown values will be rejected by the backend and replaced with a fallback ambiguous object.`;

/**
 * Response schema for the classifier.
 *
 * Union-shape: dataQuery contains all possible sub-fields from all four
 * categories. The classifier fills only the relevant ones based on the
 * selected category (guided by the prompt's "Output rules" section).
 *
 * The backend enforces category-specific required fields after parsing —
 * see header comment for the validation rules.
 */
export const questionClassifierSchema = {
  type: Type.OBJECT,
  properties: {
    category: {
      type: Type.STRING,
      enum: ['decoder', 'regulation', 'deflection', 'ambiguous'],
      description: 'The intent category of the user question.',
    },
    component: {
      type: Type.STRING,
      enum: [
        'decoder-card',
        'list-card',
        'timeline-card',
        'deflection-card',
        'clarification-card',
      ],
      description: 'Which UI component should render the response.',
    },
    dataQuery: {
      type: Type.OBJECT,
      description:
        'Category-specific query parameters. Fill only fields relevant to the chosen category.',
      properties: {
        // decoder fields
        lookup: {
          type: Type.STRING,
          enum: ['id', 'eNumber', 'latinName', 'synonym', 'comparison'],
          nullable: true,
        },
        value: { type: Type.STRING, nullable: true },
        ids: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          nullable: true,
        },
        // regulation fields
        topic: {
          type: Type.STRING,
          enum: [
            'approved_insects',
            'pending_insects',
            'approval_timeline',
            'regulation_item',
          ],
          nullable: true,
        },
        regulationItemId: { type: Type.STRING, nullable: true },
        insectId: { type: Type.STRING, nullable: true },
        sort: {
          type: Type.STRING,
          enum: ['asc', 'desc'],
          nullable: true,
        },
        // deflection fields
        topicType: {
          type: Type.STRING,
          enum: [
            'halal',
            'medical_personal',
            'medical_acute',
            'nutrition',
            'enforcement',
            'product_database',
            'recipe',
            'foreign_jurisdiction',
            'organic',
          ],
          nullable: true,
        },
        // ambiguous fields
        clarificationType: {
          type: Type.STRING,
          enum: [
            'missing_subject',
            'ambiguous_insect',
            'domain_conflict',
            'missing_jurisdiction',
            'scan_context_needed',
          ],
          nullable: true,
        },
        suggestedOptions: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          nullable: true,
        },
        // language handling
        languageWarning: { type: Type.BOOLEAN, nullable: true },
      },
    },
    deflectionTarget: {
      type: Type.STRING,
      enum: [
        'HVN',
        'huisarts',
        'huisartsenpost',
        'Voedingscentrum',
        'NVWA',
        'scan-product',
        'recipe-out-of-scope',
        'foreign-authority',
      ],
      nullable: true,
      description: 'Required when category=deflection, null otherwise.',
    },
    confidence: {
      type: Type.STRING,
      enum: ['high', 'medium', 'low'],
    },
  },
  required: ['category', 'component', 'dataQuery', 'confidence'],
};
