# EDI Validator for CBP — CATAIR Compliance Chrome Extension

## Architecture

```
edi-validator-extension/
├── manifest.json          # Chrome MV3 manifest
├── popup.html             # Extension UI (780px wide, dark industrial theme)
├── popup.js               # UI controller, Stripe, Claude API calls
├── src/
│   └── catair-rules.js    # Deterministic CATAIR rule engine (no AI)
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

## CATAIR Determinism Model

The validation engine is a **pure rule function** — same input always produces same output.

- EDI parsing: regex + delimiter detection (no inference)
- Segment validation: static schema maps from CATAIR spec
- Error codes: static lookup table (E001–E016, W001–W004)
- CBP qualifier codes: hardcoded valid value lists

**Claude API is used only for the "explain" layer (Professional/Enterprise)**:
- It interprets *already-detected* errors in plain English
- It never makes pass/fail determinations
- If Claude is unavailable, core validation still works 100%

This means your product is auditable, defensible, and fully functional offline.

## Setup

### 1. Icons

Generate PNG icons (16x16, 48x48, 128x128) and place in `/icons/`.
Use a simple customs/EDI-themed icon. Tools: Figma, Canva, or AI image gen.

### 2. Stripe Configuration

1. Log into your Stripe dashboard
2. Create Products:
   - Starter — $29/month (recurring)
   - Professional — $79/month (recurring)
   - Enterprise — $299/month (recurring)
   - Credits 10-pack — $4.99 (one-time)
   - Credits 50-pack — $18.99 (one-time)
3. Copy the Payment Link URLs for each
4. Replace in `popup.js`:
   ```js
   STRIPE_LINKS: {
     starter:      'https://buy.stripe.com/REAL_STARTER_LINK',
     professional: 'https://buy.stripe.com/REAL_PRO_LINK',
     enterprise:   'https://buy.stripe.com/REAL_ENT_LINK',
     credits:      'https://buy.stripe.com/REAL_CREDITS_LINK',
   }
   ```

### 3. License Validation (Optional — Recommended for v1.1)

To verify paid tiers server-side, set up a lightweight endpoint:

```
POST /api/verify-license
Body: { licenseKey: "stripe_customer_id_or_token" }
Response: { tier: "professional", valid: true }
```

Host on your existing Vercel/EC2 backend. Update `CONFIG.API_BASE` in popup.js.

### 4. Load in Chrome (Development)

1. Open Chrome → `chrome://extensions/`
2. Enable "Developer Mode" (top right)
3. Click "Load unpacked"
4. Select this folder

### 5. Chrome Web Store Publishing

1. Zip the entire extension folder
2. Go to https://chrome.google.com/webstore/devconsole
3. Upload zip, fill in listing details
4. Category: "Productivity" or "Developer Tools"
5. Screenshots: show the validation table and pricing

## Pricing Economics

| Tier | Price | Claude API Cost | Gross Margin |
|------|-------|----------------|--------------|
| Free | $0 | $0 | — |
| Starter | $29/mo | $0 | ~$27 |
| Professional | $79/mo | ~$2–4/mo | ~$73 |
| Enterprise | $299/mo | ~$15–25/mo | ~$278 |

Typical EDI file: 20–200 segments, ~3–8KB of text.
Claude API cost per file analysis: ~$0.003–0.01 (well under $0.02).

## CATAIR Rules Coverage (v1.0)

- [x] ISA/IEA envelope validation (E001–E004, E010, E016)
- [x] GS/GE functional group validation (E009)
- [x] ST/SE transaction set validation (E006–E008)
- [x] Transaction set ID recognition (E005) — TX 309, 315, 322, 350, 352–356, 998
- [x] B3A entry type code validation (E015) — all 22 CBP entry types
- [x] M10 SCAC + manifest type validation (E011, E013)
- [x] Usage indicator test-mode warning (W004)
- [x] Duplicate ISA control number detection (E016)

## Roadmap

- v1.1: License key validation, CSV/Excel export
- v1.2: TX 322 (Container Release), TX 352 (CBP Info) full rule coverage
- v1.3: ACE readiness scoring, HTS cross-reference
- v2.0: Batch file processing, API endpoint for enterprise

## Tech Notes

- No external dependencies — pure vanilla JS
- Claude API called directly from extension (api.anthropic.com is allowlisted in manifest)
- Tier stored in chrome.storage.local (reset on uninstall)
- For production: tie tier to Stripe customer via backend license check
