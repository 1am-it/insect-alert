/**
 * ⚠️ TEMPORARY COPY for Sprint 2.
 *
 * Source of truth remains backend: 1am-it/insect-alert/src/data/patterns.js
 * Replace with /api/patterns endpoint or shared package in v0.5.
 *
 * See Linear ticket 1AM-250 for consolidation plan.
 *
 * When the backend patterns.js is updated, this file MUST be manually synced
 * until 1AM-250 is resolved. Last manual sync: 2026-05-17.
 *
 * ---
 *
 * InsectAlert pattern database
 *
 * Each entry describes one insect species or one colorant family, with the regex
 * patterns that match it on real Dutch product labels, plus the decoder text shown
 * to the user when a match is found.
 *
 * Sources:
 * - NVWA (Nederlandse Voedsel- en Warenautoriteit) — official labelling rules
 * - Foodwatch NL — verified labelling formulations per insect species
 * - EU Implementing Regulation 2017/2470 (Novel Food union list)
 * - Vegetariersbond NL — labelling guidance for consumers
 *
 * Last reviewed: 2026-05-17 (1AM-239)
 */

export type PatternType = 'insect' | 'colorant';
export type PatternCertainty = 'high' | 'twijfel';

export interface Pattern {
  id: string;
  type: PatternType;
  nlName: string | null;
  latinName: string | null;
  pending?: boolean;
  regexPatterns: string[];
  decoderText: string;
  certainty: PatternCertainty;
}

export const patterns: Pattern[] = [
  // ==========================================================================
  // EU-approved insects (all have novel-food authorisation, allowed in food)
  // ==========================================================================

  {
    id: 'huiskrekel',
    type: 'insect',
    nlName: 'Huiskrekel',
    latinName: 'Acheta domesticus',
    regexPatterns: [
      '\\bacheta\\s+domesticus\\b',
      '\\bhuiskrekel\\b',
      '\\bhouse\\s+cricket\\b',
      '\\bkrekelpoeder\\b',
      '\\bkrekelmeel\\b',
    ],
    decoderText:
      'Huiskrekel is sinds 2022 in de EU toegelaten als ingrediënt voor menselijke consumptie. ' +
      'Komt voor als poeder in brood, pasta, koekjes, snacks, sauzen en vleesvervangers. ' +
      'Het etiket vermeldt dit verplicht als "Acheta domesticus (huiskrekel)".',
    certainty: 'high',
  },

  {
    id: 'gele-meelworm',
    type: 'insect',
    nlName: 'Gele meelworm',
    latinName: 'Tenebrio molitor',
    regexPatterns: [
      '\\btenebrio\\s+molitor\\b',
      '\\bgele\\s+meelworm\\b',
      '\\bmeeltor\\b',
      '\\byellow\\s+mealworm\\b',
    ],
    decoderText:
      'Gele meelworm (de larve van de meeltor) is sinds 2021 in de EU toegelaten als ' +
      'ingrediënt voor menselijke consumptie. Komt voor in koekjes, pasta en eiwitrijke ' +
      'snacks. Het etiket vermeldt dit verplicht als "gele meelworm (Tenebrio molitor)".',
    certainty: 'high',
  },

  {
    id: 'kleine-meelworm',
    type: 'insect',
    nlName: 'Kleine meelworm',
    latinName: 'Alphitobius diaperinus',
    regexPatterns: [
      '\\balphitobius\\s+diaperinus\\b',
      '\\bkleine\\s+meelworm\\b',
      '\\bbuffaloworm\\b',
      '\\bbuffalowormen\\b',
      '\\blesser\\s+mealworm\\b',
    ],
    decoderText:
      'Kleine meelworm (ook bekend als buffaloworm) is sinds 2025 in de EU toegelaten ' +
      'als ingrediënt in brood, pasta, koekjes en vleesvervangers. Het etiket vermeldt ' +
      'dit als "Alphitobius diaperinus (kleine meelworm)". Niet bedoeld voor consumenten ' +
      'jonger dan 18 jaar.',
    certainty: 'high',
  },

  {
    id: 'treksprinkhaan',
    type: 'insect',
    nlName: 'Treksprinkhaan',
    latinName: 'Locusta migratoria',
    regexPatterns: [
      '\\blocusta\\s+migratoria\\b',
      '\\btreksprinkhaan\\b',
      '\\beuropese\\s+treksprinkhaan\\b',
      '\\bmigratory\\s+locust\\b',
    ],
    decoderText:
      'Treksprinkhaan is sinds 2021 in de EU toegelaten als ingrediënt voor menselijke ' +
      'consumptie. Komt voor in meergranenproducten, peulvruchten en eiwitrijke snacks. ' +
      'Het etiket vermeldt dit als "Europese treksprinkhaan (Locusta migratoria)".',
    certainty: 'high',
  },

  {
    id: 'bandkrekel',
    type: 'insect',
    nlName: 'Bandkrekel',
    latinName: 'Gryllodes sigillatus',
    regexPatterns: [
      '\\bgryllodes\\s+sigillatus\\b',
      '\\bbandkrekel\\b',
      '\\bgedroogde\\s+bandkrekel\\b',
      '\\btropical\\s+banded\\s+cricket\\b',
    ],
    decoderText:
      'Bandkrekel (gedroogd) is sinds 2024 in de EU toegelaten als ingrediënt voor ' +
      'menselijke consumptie. Mag de komende vijf jaar alleen door de oorspronkelijke ' +
      'aanvrager op de markt worden gebracht (gegevensbescherming). Het etiket vermeldt ' +
      'dit als "Gryllodes sigillatus (bandkrekel)".',
    certainty: 'high',
  },

  // ==========================================================================
  // Pending EU approval — still in novel-food review process
  // ==========================================================================

  {
    id: 'zwarte-soldatenvlieg',
    type: 'insect',
    nlName: 'Zwarte soldatenvlieg',
    latinName: 'Hermetia illucens',
    pending: true,
    regexPatterns: [
      '\\bhermetia\\s+illucens\\b',
      '\\bzwarte\\s+soldatenvlieg\\b',
      '\\bzwarte\\s+soldaatvlieg\\b',
      '\\bblack\\s+soldier\\s+fly\\b',
      '\\bbsf\\s+larvae\\b',
    ],
    decoderText:
      'Zwarte soldatenvlieg (Hermetia illucens) is per 2026 nog niet toegelaten voor ' +
      'menselijke consumptie in de EU; er loopt een goedkeuringsprocedure. Wel toegelaten ' +
      'als diervoeding. Komt deze naam toch op een levensmiddel-etiket voor, controleer ' +
      'dan bij de fabrikant.',
    certainty: 'high',
  },

  // ==========================================================================
  // Insect-derived colorants — already permitted as additive for decades
  // ==========================================================================

  {
    id: 'karmijn-e120',
    type: 'colorant',
    nlName: 'Karmijn',
    latinName: 'Dactylopius coccus',
    regexPatterns: [
      '\\be\\s*120\\b',
      '\\bkarmijn\\b',
      '\\bkarmijnzuur\\b',
      '\\bcarmine\\b',
      '\\bcarminic\\s+acid\\b',
      '\\bcochineal\\b',
      '\\bcochenille\\b',
      '\\bnatural\\s+red\\s+4\\b',
      '\\bci\\s*75470\\b',
      '\\bdactylopius\\s+coccus\\b',
    ],
    decoderText:
      'Karmijn (E120) is een rode kleurstof gewonnen uit gedroogde schildluizen ' +
      '(Dactylopius coccus). Komt voor in roze koeken, rode snoepjes, zuiveldranken ' +
      'met fruitsmaak, sommige worsten en cosmetica. Wordt op het etiket aangeduid als ' +
      'E120, karmijn, carmine, cochineal, of natural red 4.',
    certainty: 'high',
  },

  // ==========================================================================
  // Twijfelgevallen — ambiguous terms that MIGHT be insect-derived
  // ==========================================================================

  {
    id: 'twijfel-natuurlijke-kleurstof',
    type: 'colorant',
    nlName: null,
    latinName: null,
    regexPatterns: [
      '\\bnatuurlijke\\s+kleurstof\\b',
      '\\bnatuurlijke\\s+kleurstoffen\\b',
      '\\bnatural\\s+colou?r\\b',
      '\\bnatural\\s+red\\s+colou?r\\b',
    ],
    decoderText:
      'Het etiket vermeldt "natuurlijke kleurstof". Dit kan plantaardig zijn (bietenrood, ' +
      'paprika-extract), maar ook karmijn (E120) van schildluizen. Kijk of er een E-nummer ' +
      'naast staat, of vraag het bij twijfel aan de fabrikant.',
    certainty: 'twijfel',
  },

  {
    id: 'twijfel-rood-extract',
    type: 'colorant',
    nlName: null,
    latinName: null,
    regexPatterns: [
      '\\brood\\s+kleurstof\\b',
      '\\brode\\s+kleurstof\\b',
    ],
    decoderText:
      'Het etiket vermeldt "rode kleurstof" zonder verdere specificatie. Dit kan ' +
      'plantaardig zijn (bietenrood, paprika-extract) maar ook karmijn (E120) van ' +
      'schildluizen. Controleer het E-nummer of vraag het na bij de fabrikant.',
    certainty: 'twijfel',
  },
];

/**
 * Resolve a `dataQuery.value` from the classifier to a single Pattern.
 *
 * The classifier produces consumer-friendly values ("karmijn", "E120", "huiskrekel"),
 * not necessarily exact internal ids. This resolver implements the lookup-cascade
 * documented in 1AM-239:
 *
 *   1. Exact id match
 *   2. Case-insensitive nlName match
 *   3. Case-insensitive latinName match
 *   4. Regex-pattern match (vangt E-nummers, synoniemen, alle variaties)
 *   5. Normalized substring fallback (laatste redmiddel)
 *
 * @param value - Consumer-facing value from classifier (e.g. "karmijn", "E120")
 * @returns Matching Pattern, or null if no match
 */
export function resolvePattern(value: string): Pattern | null {
  if (!value || typeof value !== 'string') return null;

  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();

  // 1. Exact id match
  const byId = patterns.find((p) => p.id === trimmed);
  if (byId) return byId;

  // 2. Case-insensitive nlName match
  const byNl = patterns.find(
    (p) => p.nlName && p.nlName.toLowerCase() === lower
  );
  if (byNl) return byNl;

  // 3. Case-insensitive latinName match
  const byLatin = patterns.find(
    (p) => p.latinName && p.latinName.toLowerCase() === lower
  );
  if (byLatin) return byLatin;

  // 4. Regex-pattern match (covers E-numbers, synonyms, all label variations)
  for (const p of patterns) {
    for (const rx of p.regexPatterns) {
      try {
        const re = new RegExp(rx, 'i');
        if (re.test(trimmed)) return p;
      } catch {
        // Skip invalid regex (shouldn't happen in production data)
        continue;
      }
    }
  }

  // 5. Normalized substring fallback — last resort
  for (const p of patterns) {
    if (p.nlName && lower.includes(p.nlName.toLowerCase())) return p;
    if (p.latinName && lower.includes(p.latinName.toLowerCase())) return p;
  }

  return null;
}

/**
 * Helper exports — convenience filters on the pattern list.
 */
export const insectPatterns = patterns.filter((p) => p.type === 'insect');
export const colorantPatterns = patterns.filter((p) => p.type === 'colorant');
export const definitivePatterns = patterns.filter((p) => p.certainty === 'high');
export const ambiguousPatterns = patterns.filter((p) => p.certainty === 'twijfel');
