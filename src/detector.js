/**
 * InsectAlert detector
 *
 * Pure function that takes input text and returns a structured result describing
 * which patterns matched and what state to display in the UI.
 *
 * Architecture:
 * - No DOM access — this module is pure and unit-testable
 * - Imports patterns from src/data/patterns.js (single source of truth, see 1AM-54)
 * - Returns one of three states: "gevonden", "niet-gevonden", "twijfel"
 *
 * Priority logic for multi-match scenarios:
 * - When a high-certainty pattern matches alongside a twijfel pattern,
 *   the high-certainty match wins. Twijfel patterns are only relevant when
 *   no definitive match is present.
 *
 * Last reviewed: 2026-05-04 (1AM-56)
 */

import { patterns } from './data/patterns.js';

/**
 * Run detection against input text.
 *
 * @param {string} text - Raw ingredient list pasted by the user.
 * @returns {{
 *   state: 'gevonden' | 'niet-gevonden' | 'twijfel',
 *   matches: Array<{
 *     id: string,
 *     type: 'insect' | 'colorant',
 *     nlName: string | null,
 *     latinName: string | null,
 *     decoderText: string,
 *     certainty: 'high' | 'twijfel',
 *     snippet: string,
 *     pending?: boolean
 *   }>
 * }}
 */
export function detect(text) {
  // Defensive: handle null/undefined/empty
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return { state: 'niet-gevonden', matches: [] };
  }

  const allMatches = [];

  for (const pattern of patterns) {
    for (const regexStr of pattern.regexPatterns) {
      const regex = new RegExp(regexStr, 'i');
      const match = regex.exec(text);
      if (match) {
        allMatches.push({
          id: pattern.id,
          type: pattern.type,
          nlName: pattern.nlName,
          latinName: pattern.latinName,
          decoderText: pattern.decoderText,
          certainty: pattern.certainty,
          snippet: extractSnippet(text, match),
          pending: pattern.pending || false,
        });
        break; // one regex hit per pattern is enough — move to next pattern
      }
    }
  }

  // Determine state with priority: high-certainty trumps twijfel
  const highMatches = allMatches.filter((m) => m.certainty === 'high');
  const twijfelMatches = allMatches.filter((m) => m.certainty === 'twijfel');

  if (highMatches.length > 0) {
    return { state: 'gevonden', matches: highMatches };
  }

  if (twijfelMatches.length > 0) {
    return { state: 'twijfel', matches: twijfelMatches };
  }

  return { state: 'niet-gevonden', matches: [] };
}

/**
 * Extract a short snippet of context around the matched ingredient text.
 * Aims for ~60 chars total (the matched phrase plus some surrounding text)
 * so the user can see the matched ingredient in context.
 *
 * @param {string} text - Full input text
 * @param {RegExpExecArray} match - Match result from regex.exec()
 * @returns {string} Cleaned snippet
 */
function extractSnippet(text, match) {
  const matchStart = match.index;
  const matchEnd = match.index + match[0].length;
  const contextChars = 30;

  const start = Math.max(0, matchStart - contextChars);
  const end = Math.min(text.length, matchEnd + contextChars);

  let snippet = text.substring(start, end).trim();

  // Add ellipsis if we cut from the middle of the source
  if (start > 0) snippet = '…' + snippet;
  if (end < text.length) snippet = snippet + '…';

  // Collapse internal whitespace and newlines
  snippet = snippet.replace(/\s+/g, ' ');

  return snippet;
}
