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
 * Last reviewed: 2026-05-26 (1AM-251 ronde 2 fix — narrow ambiguity scope to "meelworm" only)
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

# Ambiguity detection (CHECK FIRST)

Before selecting a concrete category (decoder/regulation/deflection), evaluate
whether the question gives enough context to safely route to one path.
Choose "ambiguous" ONLY when the question genuinely lacks the context to
classify safely. Do not treat broad topic words ("karmijn", "insecten",
"E120") as ambiguous on their own — those are normal decoder/regulation subjects.

Apply these three checks:

1. AMBIGUOUS INSECT SPECIES
   The question uses "meelworm" alone, without a "kleine" or "gele"
   modifier. "meelworm" maps to two distinct approved species:
   Tenebrio molitor (gele meelworm) and Alphitobius diaperinus
   (kleine meelworm).
   Set clarificationType: "ambiguous_insect".
   This rule applies ONLY to bare "meelworm". It does NOT apply to:
   - Specific species: "huiskrekel", "gele meelworm", "kleine meelworm",
     "karmijn", "treksprinkhaan"
   - Other singular names: "krekel" (treat as huiskrekel / regulation
     subject), which is not ambiguous in our database
   - Generic terms: "insecten", "additieven", "EU-goedgekeurde insecten" —
     these are normal regulation/decoder subjects, never ambiguous
   - Organization names: "EFSA", "NVWA", "European Commission" — never
     ambiguous; these are regulation subjects
   Examples that ARE ambiguous: "Is meelworm gezond?", "Sinds wanneer mag
   meelworm?"
   Examples that are NOT ambiguous: "Wat is huiskrekel?", "Is karmijn
   vegetarisch?", "Sinds wanneer mag krekel in brood?", "Wat doet EFSA?"

2. DOMAIN CONFLICT
   The question uses explicit dual-domain framing that forces a choice
   between two routing domains (decoder/regulation/deflection). Signals:
   - Two oppositional terms joined by "of" referring to different domains:
     "gevaarlijk of veilig", "toegestaan of schadelijk"
   - Compound questions explicitly spanning domains:
     "Mag dit én is het veilig?", "Is dit toegestaan of moet ik een arts bellen?"
   Set clarificationType: "domain_conflict".
   Examples that ARE domain conflicts: "Karmijn — gevaarlijk of veilig?",
   "Is dit toegestaan of schadelijk?"

   Single-intent questions are NOT domain conflicts, even when they use
   words like "gezond", "veilig", "goed", "slecht":
   - "Is karmijn gezond?" → deflection (Voedingscentrum), single-intent nutrition
   - "Is dit veilig tijdens zwangerschap?" → deflection (huisarts), single-intent medical
   - "Kan ik dit eten?" → deflection, single-intent
   - "Zijn insecten slecht voor je?" → deflection (nutrition), single-intent

3. COMPARISON WITH AMBIGUOUS SUBJECTS
   "verschil tussen X en Y" — but X or Y is itself an ambiguous insect group.
   Set clarificationType: "ambiguous_insect".
   Examples that ARE ambiguous: "Krekel of meelworm — wat is het verschil?"
   (which krekel? which meelworm?)
   Examples that are NOT ambiguous (use decoder/comparison instead):
   "Wat is het verschil tussen kleine en gele meelworm?" — both subjects
   specific.

If none of the three checks apply, do NOT default to ambiguous because of
low confidence. Continue with normal category selection and choose the
best-fitting concrete category (decoder/regulation/deflection). Use the
"ambiguous" category ONLY when one of the three checks above explicitly
applies, OR when the question is so vague that no subject can be identified
at all (e.g. "Hoe zit dat?", "Klopt dat?").

# Output rules

Fill only the fields relevant to the selected category. Leave irrelevant fields as null or omit them. Per category:
- decoder: dataQuery.lookup + dataQuery.value (or dataQuery.ids for comparison)
- regulation: dataQuery.topic + optionally regulationItemId, insectId, sort
  Component choice for regulation:
    * decoder-card — single-concept explainer (one X, one answer):
      "Wat is X?" / "Hoe werkt X?" / "Waarom Y?" / "Wat doet [EU body]?"
      The question asks for ONE explanation of ONE concept, not a list.
      Examples: "Wat is novel food?", "Hoe werkt EU-toelating voor insecten?",
      "Wat doet EFSA?", "Welke EU-verordening gaat over insecten?"
      NOTE: "Wat doet X?" maps to decoder-card ONLY when X is an EU body
      or regulatory organ (EFSA, NVWA, European Commission). For medical
      or religious authorities ("Wat doet de huisarts bij allergie?"),
      this is a deflection question — route to deflection-card.
    * list-card — multi-item enumeration:
      "Welke X..." when X is plural OR the question contains list-signal
      words like "allemaal", "alle", "welke zijn er", "lijst".
      "Welke X..." when X is singular AND the question expects ONE specific
      answer (one regulation, one body, one concept) maps to decoder-card,
      not list-card.
      Examples (list-card): "Welke insecten zijn EU-goedgekeurd?",
      "Welke insecten zitten nog in de pijplijn?"
    * timeline-card — chronological:
      "Sinds wanneer..." / "Wanneer werd..."
      Examples: "Sinds wanneer mag krekel in brood?", "Wanneer werden insecten
      in de EU goedgekeurd?"
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
