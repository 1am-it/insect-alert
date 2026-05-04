# Insect Alert

A Dutch web tool that detects insect-derived ingredients in food product labels.
Users paste an ingredient list or upload a photo of a label, and the tool decodes
Latin species names (e.g. *Acheta domesticus* → huiskrekel) and E-numbers
(e.g. E120 → karmijn) into plain Dutch.

> **Status:** MVP under construction. Not yet publicly launched.

## Why this exists

Since EU regulations have approved several insect species for food use, manufacturers
are legally required to list Latin species names on product labels. Most consumers
cannot read these names. Existing food-scanner apps treat insects as a sub-feature
of vegan filtering. InsectAlert is built specifically for users who care about
insects in food: vegetarians, vegans, halal consumers, and shellfish-allergic users.

## Tech stack

- Vanilla HTML, CSS, JavaScript (no framework, no build step)
- Hosted on Vercel
- One Vercel Edge Function for vision-API photo scanning (Gemini Flash)
- Supabase for email signup storage (planned)
- Plausible (or Umami) for privacy-friendly analytics (planned)
- Progressive Web App (PWA) — installable on iOS and Android home screens

## Project structure

```
.
├── api/         Vercel Edge Functions (server-side endpoints)
├── public/      Static assets (PWA manifest, icons)
├── src/         Client-side JavaScript modules
├── index.html   Single-page entry point
├── vercel.json  Vercel configuration
├── CHANGELOG.md Version history
└── LICENSE      MIT license
```

## Local development

This project has no build step. To run locally:

```bash
# Clone the repo
git clone https://github.com/1am-it/insect-alert.git
cd insect-alert

# Open index.html directly in a browser, or serve with a simple HTTP server:
python3 -m http.server 8000
# Then visit http://localhost:8000
```

For development of the photo-scan endpoint (requires Vercel CLI):

```bash
npm install -g vercel
vercel dev
```

## Project management

This project is tracked in Linear under the `1am-it` workspace, in the `InsectAlert`
project. Working standards (ticket structure, commit conventions, release flow)
are documented in the Operations team (`OPS-1` through `OPS-17`).

## License

MIT — see [LICENSE](LICENSE) for details.
