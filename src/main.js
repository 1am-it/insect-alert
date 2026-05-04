/**
 * InsectAlert main.js — UI integration for paste-flow
 *
 * Wires user interactions to the detector and toggles the result-card states
 * defined in index.html (1AM-55).
 *
 * Architecture:
 * - All result cards live in the DOM, hidden by default
 * - On submit: run detect(), populate the relevant card, show it, hide others
 * - "Nieuwe controle" buttons reset the page to the input view
 * - Tab toggle switches between paste and photo input panels
 *
 * No framework. No state-library. Plain DOM manipulation.
 *
 * Last reviewed: 2026-05-04 (1AM-56)
 */

import { detect } from './detector.js';

// Wait for DOM to be ready before wiring up listeners
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

function init() {
  setupTabToggle();
  setupSubmit();
  setupResetButtons();
  hideAllResultCards();
}

// ============================================================================
// Tab toggle: paste vs photo
// ============================================================================
function setupTabToggle() {
  const tabPaste = document.getElementById('tab-paste');
  const tabPhoto = document.getElementById('tab-photo');
  const panelPaste = document.getElementById('panel-paste');
  const panelPhoto = document.getElementById('panel-photo');

  if (!tabPaste || !tabPhoto || !panelPaste || !panelPhoto) return;

  tabPaste.addEventListener('click', () => {
    tabPaste.classList.add('tab-active');
    tabPaste.setAttribute('aria-selected', 'true');
    tabPhoto.classList.remove('tab-active');
    tabPhoto.setAttribute('aria-selected', 'false');

    panelPaste.removeAttribute('hidden');
    panelPaste.classList.remove('panel-hidden');
    panelPhoto.setAttribute('hidden', '');
    panelPhoto.classList.add('panel-hidden');
  });

  tabPhoto.addEventListener('click', () => {
    tabPhoto.classList.add('tab-active');
    tabPhoto.setAttribute('aria-selected', 'true');
    tabPaste.classList.remove('tab-active');
    tabPaste.setAttribute('aria-selected', 'false');

    panelPhoto.removeAttribute('hidden');
    panelPhoto.classList.remove('panel-hidden');
    panelPaste.setAttribute('hidden', '');
    panelPaste.classList.add('panel-hidden');
  });
}

// ============================================================================
// Submit: read textarea, run detect(), show appropriate result
// ============================================================================
function setupSubmit() {
  const submitButton = document.querySelector('.btn-cta');
  const textarea = document.getElementById('ingredient-input');

  if (!submitButton || !textarea) return;

  submitButton.addEventListener('click', () => {
    const text = textarea.value;

    // Empty input: subtle hint by focusing the textarea
    if (!text || text.trim().length === 0) {
      textarea.focus();
      return;
    }

    const result = detect(text);
    showResult(result);
  });

  // Enter-to-submit on textarea (Ctrl+Enter for accessibility)
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      submitButton.click();
    }
  });
}

// ============================================================================
// "Nieuwe controle" reset buttons — bring user back to input view
// ============================================================================
function setupResetButtons() {
  // Find every button that says "Nieuwe controle" (across all result cards)
  const allButtons = document.querySelectorAll('.result-card .btn-primary.btn-large');

  allButtons.forEach((btn) => {
    if (btn.textContent.trim().includes('Nieuwe controle')) {
      btn.addEventListener('click', resetToInput);
    }
  });

  // Error-card "Probeer opnieuw" and "Plak tekst in plaats daarvan" — same behavior for now
  const errorCard = document.querySelector('.result-error');
  if (errorCard) {
    errorCard.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', resetToInput);
    });
  }
}

function resetToInput() {
  hideAllResultCards();

  const textarea = document.getElementById('ingredient-input');
  if (textarea) {
    textarea.value = '';
    textarea.focus();
  }

  // Smooth scroll back to top of input card
  const inputCard = document.querySelector('.input-card');
  if (inputCard) {
    inputCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// ============================================================================
// Result rendering — show one card, populate it, scroll to it
// ============================================================================
function hideAllResultCards() {
  document.querySelectorAll('.result-card').forEach((card) => {
    card.setAttribute('hidden', '');
  });
}

function showResult(result) {
  hideAllResultCards();

  let card;
  if (result.state === 'gevonden') {
    card = document.querySelector('.result-gevonden');
    populateGevonden(card, result.matches);
  } else if (result.state === 'twijfel') {
    card = document.querySelector('.result-twijfel');
    populateTwijfel(card, result.matches);
  } else {
    card = document.querySelector('.result-niet-gevonden');
    // Niet-gevonden has no dynamic data — static decoder text suffices
  }

  if (card) {
    card.removeAttribute('hidden');
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/**
 * Populate the "gevonden" card with the first match.
 * If multiple matches exist, we show the first high-certainty insect or colorant.
 * Future enhancement: stack multiple matches in the same card. For MVP we show the
 * primary match — additional matches are still in the result object for analytics.
 */
function populateGevonden(card, matches) {
  if (!card || matches.length === 0) return;

  const primary = matches[0];

  const nlNameEl = card.querySelector('.result-detail-grid .result-detail:nth-child(1) .result-detail-value');
  const latinNameEl = card.querySelector('.result-detail-grid .result-detail:nth-child(3) .result-detail-value');
  const snippetEl = card.querySelector('.result-snippet');
  const decoderEl = card.querySelector('.result-decoder');

  if (nlNameEl) nlNameEl.textContent = primary.nlName || '—';
  if (latinNameEl) latinNameEl.textContent = primary.latinName || '—';

  // Snippet block: keep the quote-icon span, replace the text after it
  if (snippetEl) {
    const quoteSpan = snippetEl.querySelector('.result-snippet-quote');
    snippetEl.textContent = ''; // clear
    if (quoteSpan) snippetEl.appendChild(quoteSpan); // re-attach quote icon
    snippetEl.appendChild(document.createTextNode(' ' + primary.snippet));
  }

  if (decoderEl) decoderEl.textContent = primary.decoderText;

  // Hide detail-grid for colorants (no Latin species name relevant)
  const detailGrid = card.querySelector('.result-detail-grid');
  if (detailGrid) {
    if (primary.type === 'colorant' && !primary.latinName) {
      detailGrid.style.display = 'none';
    } else {
      detailGrid.style.display = '';
    }
  }
}

/**
 * Populate the "twijfel" card with the snippet and decoder text from the match.
 */
function populateTwijfel(card, matches) {
  if (!card || matches.length === 0) return;

  const primary = matches[0];

  const snippetEl = card.querySelector('.result-snippet');
  const decoderEl = card.querySelector('.result-decoder');

  if (snippetEl) {
    const quoteSpan = snippetEl.querySelector('.result-snippet-quote');
    snippetEl.textContent = '';
    if (quoteSpan) snippetEl.appendChild(quoteSpan);
    snippetEl.appendChild(document.createTextNode(' ' + primary.snippet));
  }

  if (decoderEl) decoderEl.textContent = primary.decoderText;
}
