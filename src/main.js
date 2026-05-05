/**
 * InsectAlert main.js — UI integration
 *
 * Wires user interactions to:
 * - The local detector (paste-flow, 1AM-56) — pure pattern matching
 * - The /api/scan-photo endpoint (photo-flow, 1AM-57) — vision-LLM extraction
 *   followed by the same local detector for consistency
 *
 * Architecture:
 * - All result cards live in the DOM, hidden by default
 * - On submit (paste): run detect() locally, populate card, show it
 * - On submit (photo): compress image → POST → use server's detection result
 * - "Nieuwe controle" buttons reset the page to the input view
 *
 * No framework. No state-library. Plain DOM manipulation.
 *
 * Last reviewed: 2026-05-04 (1AM-57)
 */

import { detect } from './detector.js';
import imageCompression from 'browser-image-compression';

// Photo upload constraints — keep the API cheap and responsive
const MAX_IMAGE_WIDTH = 1024;
const MAX_IMAGE_SIZE_MB = 1;
const ACCEPTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

// Wait for DOM to be ready before wiring up listeners
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

function init() {
  setupTabToggle();
  setupSubmit();
  setupPhotoUpload();
  setupResetButtons();
  hideAllResultCards();
  hideLoadingState();
}

// ============================================================================
// Tab toggle: paste vs photo
// ============================================================================
function setupTabToggle() {
  const tabPaste = document.getElementById('tab-paste');
  const tabPhoto = document.getElementById('tab-photo');
  const panelPaste = document.getElementById('panel-paste');
  const panelPhoto = document.getElementById('panel-photo');
  const ctaPaste = document.querySelector('.btn-cta');

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

    // Show the paste-tab CTA
    if (ctaPaste) ctaPaste.removeAttribute('hidden');
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

    // Hide the paste-tab CTA — photo flow uses its own buttons
    if (ctaPaste) ctaPaste.setAttribute('hidden', '');
  });
}

// ============================================================================
// Paste submit: read textarea, run detect(), show appropriate result
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

  // Ctrl+Enter shortcut for power users
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      submitButton.click();
    }
  });
}

// ============================================================================
// Photo upload: file input → compress → POST to /api/scan-photo → render
// ============================================================================
function setupPhotoUpload() {
  // Three file inputs across the photo panel:
  // - #photo-input — the dropzone label (large tap target)
  // - #photo-input-camera — "Open camera" button (capture=environment for rear camera)
  // - #photo-input-file — "Bestand kiezen" button (file browser)
  // All three share the same change handler.
  const inputs = [
    document.getElementById('photo-input'),
    document.getElementById('photo-input-camera'),
    document.getElementById('photo-input-file'),
  ].filter(Boolean);

  inputs.forEach((input) => {
    input.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const isImage =
        ACCEPTED_MIME_TYPES.includes(file.type) || file.type.startsWith('image/');
      if (!isImage) {
        showError('Dat lijkt geen afbeelding. Probeer een foto te maken of selecteer een ander bestand.');
        e.target.value = '';
        return;
      }

      await processPhoto(file);
      e.target.value = ''; // reset so the same file can be re-selected for retry
    });
  });
}

async function processPhoto(file) {
  showLoadingState();

  let compressedBlob;
  try {
    compressedBlob = await imageCompression(file, {
      maxSizeMB: MAX_IMAGE_SIZE_MB,
      maxWidthOrHeight: MAX_IMAGE_WIDTH,
      useWebWorker: true,
      // Preserve EXIF orientation — iOS sideways photos auto-rotate correctly
      preserveExif: false,
    });
  } catch (error) {
    console.error('[photo] compression failed:', error);
    hideLoadingState();
    showError('We konden de foto niet verwerken. Probeer een andere foto.');
    return;
  }

  // Send the compressed image to our endpoint as raw body — keeps the
  // backend simple (no multipart parsing needed, just read the request body)
  let response;
  try {
    response = await fetch('/api/scan-photo', {
      method: 'POST',
      headers: {
        'Content-Type': compressedBlob.type || 'image/jpeg',
      },
      body: compressedBlob,
    });
  } catch (error) {
    console.error('[photo] network error:', error);
    hideLoadingState();
    showError('Geen verbinding met de scanner. Controleer je internet en probeer opnieuw.');
    return;
  }

  hideLoadingState();

  if (!response.ok) {
    let message = 'Er ging iets mis bij het analyseren van de foto.';
    try {
      const errorBody = await response.json();
      if (errorBody.message) message = errorBody.message;
    } catch (_) {
      // No JSON body — use generic message
    }
    showError(message);
    return;
  }

  let data;
  try {
    data = await response.json();
  } catch (error) {
    showError('De server gaf een onverwacht antwoord. Probeer opnieuw.');
    return;
  }

  // Server returns the same shape as our local detector + an extractedText field
  if (data.state === 'error') {
    showError(data.message || 'Geen ingrediëntenlijst herkend in de foto.');
    return;
  }

  showResult({
    state: data.state,
    matches: data.matches || [],
  });
}

// ============================================================================
// Loading state — simple inline spinner overlay
// ============================================================================
function showLoadingState() {
  const loading = document.querySelector('.loading-state');
  if (loading) {
    loading.removeAttribute('hidden');
    loading.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function hideLoadingState() {
  const loading = document.querySelector('.loading-state');
  if (loading) {
    loading.setAttribute('hidden', '');
  }
}

// ============================================================================
// "Nieuwe controle" reset buttons — bring user back to input view
// ============================================================================
function setupResetButtons() {
  const allButtons = document.querySelectorAll('.result-card .btn-primary.btn-large');

  allButtons.forEach((btn) => {
    if (btn.textContent.trim().includes('Nieuwe controle')) {
      btn.addEventListener('click', resetToInput);
    }
  });

  // Error-card "Probeer opnieuw" and "Plak tekst in plaats daarvan"
  const errorCard = document.querySelector('.result-error');
  if (errorCard) {
    errorCard.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        const text = btn.textContent.trim();
        if (text.includes('Plak tekst')) {
          // Switch to paste tab as well as resetting
          resetToInput();
          document.getElementById('tab-paste')?.click();
        } else {
          resetToInput();
        }
      });
    });
  }
}

function resetToInput() {
  hideAllResultCards();
  hideLoadingState();

  const textarea = document.getElementById('ingredient-input');
  if (textarea) {
    textarea.value = '';
  }

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
  }

  if (card) {
    card.removeAttribute('hidden');
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function showError(message) {
  hideAllResultCards();
  hideLoadingState();

  const errorCard = document.querySelector('.result-error');
  if (!errorCard) return;

  // Inject the message into the error card's body text
  const decoder = errorCard.querySelector('.result-decoder');
  if (decoder && message) {
    decoder.textContent = message;
  }

  errorCard.removeAttribute('hidden');
  errorCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function populateGevonden(card, matches) {
  if (!card || matches.length === 0) return;

  const primary = matches[0];

  const nlNameEl = card.querySelector('.result-detail-grid .result-detail:nth-child(1) .result-detail-value');
  const latinNameEl = card.querySelector('.result-detail-grid .result-detail:nth-child(3) .result-detail-value');
  const snippetEl = card.querySelector('.result-snippet');
  const decoderEl = card.querySelector('.result-decoder');

  if (nlNameEl) nlNameEl.textContent = primary.nlName || '—';
  if (latinNameEl) latinNameEl.textContent = primary.latinName || '—';

  if (snippetEl) {
    const quoteSpan = snippetEl.querySelector('.result-snippet-quote');
    snippetEl.textContent = '';
    if (quoteSpan) snippetEl.appendChild(quoteSpan);
    snippetEl.appendChild(document.createTextNode(' ' + primary.snippet));
  }

  if (decoderEl) decoderEl.textContent = primary.decoderText;

  const detailGrid = card.querySelector('.result-detail-grid');
  if (detailGrid) {
    if (primary.type === 'colorant' && !primary.latinName) {
      detailGrid.style.display = 'none';
    } else {
      detailGrid.style.display = '';
    }
  }
}

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
