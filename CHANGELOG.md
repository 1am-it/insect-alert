# Changelog

All notable changes to InsectAlert are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

---

## [0.3.0] — 2026-05-12

### Added

- Custom domain `insect-alert.com` (apex) live in production via Cloudflare Registrar + Cloudflare DNS. A-record to `185.158.133.1` (DNS only, no proxy — Lovable handles SSL). TXT record `_lovable` for domain verification (1AM-176)
- `/api/signup` endpoint for email capture, backed by Supabase Postgres (Central EU) `email_signups` table. CORS open, validated server-side, idempotent on duplicate addresses (1AM-176)
- Lovable-built frontend live on Cloudflare Workers, replacing the vanilla JS frontend. TanStack Start (React) stack, hosted via Lovable Publish. Repo: `1am-it/insect-checkr-5deff83f`, auto-synced Lovable ↔ GitHub (1AM-176)

### Changed

- Frontend hosting moved from same-repo `public/` (Vercel static) to separate repo on Lovable/Cloudflare Workers. Backend repo (`1am-it/insect-alert`) now contains API endpoints only — no frontend assets (1AM-176)
- Backend remains on Vercel as serverless functions at `https://insect-alert.vercel.app/api/*`. Frontend calls backend via absolute URL (`API_BASE` constant in `src/lib/insectalert-api.ts`) — cross-origin by design, CORS open on all endpoints (1AM-176)
- Mobile camera capture now works on Android Chrome and iOS Safari — Lovable's TanStack frontend uses `capture="environment"` attribute on the photo input. Resolves the gallery-only fallback documented in 0.2.0 known issues (1AM-132)
- `package.json` version bumped to `0.3.0`

### Removed

- Vanilla JS frontend assets in backend repo (`public/`, `src/`) no longer used in production. Backend repo scope narrowed to `/api/*` only

### Notes

- 1AM-130 (polish — sticker-fun details) effectively resolved: Lovable now renders the mockups exactly, eliminating the ~5% visual drift the ticket tracked. Closed as obsolete in this release
- Architecture decision recorded in 1AM-176: TanStack Start is hard-wired to Cloudflare Workers (wrangler.jsonc, worker-entry-*.js in dist/server/). Splitting frontend/backend across two hosts was the pragmatic path; consolidating to one provider is deferred to v0.4+

### Future (v0.4+)

- Move backend to `api.insect-alert.com` for a cleaner domain (currently `insect-alert.vercel.app`)
- Optional `www.insect-alert.com` → apex redirect via Cloudflare Page Rule
- Favicon and OpenGraph social image (cosmetic, not release-blocking)

---

## [0.2.0] — 2026-05-05

### Added

- Photo upload flow — users can scan a product label image instead of typing the ingredient list. Supported on desktop via file picker; mobile camera flow tracked separately in 1AM-132 (1AM-57)
- Vendor-agnostic scan utility (`api/_lib/scanImage.js`) with adapter pattern — Gemini implemented now, architecture ready for Anthropic and OpenAI adapters in the future. Lift-ready for extraction to a standalone npm package when a second project needs it (1AM-57, 1AM-131)
- Two-stage detection architecture: Gemini Flash 2.5 extracts raw ingredient text from the photo, then the existing local detector (1AM-56) performs deterministic pattern matching. Same source of truth for paste-flow and photo-flow (1AM-57)
- Client-side image compression to max 1024px width via `browser-image-compression` library — keeps API costs low and respects mobile data (1AM-57)
- Loading state with animated spinner during photo analysis (~2-4s typical, 7s cold-start) (1AM-57)

### Changed

- Footer privacy disclosure updated to reflect Gemini usage: "Foto's worden niet door ons opgeslagen. Voor de analyse gebruiken we Google Gemini." (1AM-57)
- `package.json` adds `@google/genai` and `browser-image-compression` as dependencies (1AM-57)

### Known issues

- Mobile camera flow not yet working on Android Chrome — workaround: use "Bestand kiezen" to upload from gallery, or paste-flow. Tracked in 1AM-132 (1AM-57)

---

## [0.1.0] — 2026-05-04

### Added

- Pattern database with 5 EU-approved insect species (huiskrekel, gele meelworm, kleine meelworm, treksprinkhaan, bandkrekel) plus zwarte soldatenvlieg as pending entry, E120/karmijn family with 10 synonyms, and 2 twijfel patterns for ambiguous terms (1AM-54)
- Sticker-fun layout with all 9 UI states: hero (paste + photo), three result cards (gevonden / niet-gevonden / twijfel), error state, email signup invoer + success (1AM-55)
- Working paste-flow: pasting an ingredient list and clicking "Controleer ingrediënten" runs detection against the pattern database and renders the appropriate result card with state-specific styling (1AM-56)
- Pure detector module that scores matches by certainty (high vs twijfel) and extracts ~60 char snippet context per match (1AM-56)
- Tab toggle between paste and photo input modes — paste fully wired, photo deferred to 1AM-57 (1AM-56)
- "Nieuwe controle" reset flow with smooth scroll back to input view (1AM-56)
- Initial project skeleton: README, MIT license, .gitignore, CHANGELOG, vercel.json, placeholder index.html, empty `api/`, `public/`, `src/` directories (1AM-53)

### Changed

- Switched from "Other" framework preset to Vite to resolve Vercel deploy routing on Hobby + private repo combination (1AM-53)

---

[Unreleased]: https://github.com/1am-it/insect-alert/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/1am-it/insect-alert/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/1am-it/insect-alert/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/1am-it/insect-alert/releases/tag/v0.1.0
