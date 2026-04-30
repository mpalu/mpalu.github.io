# Contact form worker

Cloudflare Worker that accepts JSON submissions from the contact form on `mpalu.io`,
verifies a Cloudflare Turnstile token, and sends the message via Resend.

## Setup

1. Install dependencies:
   ```bash
   cd worker
   npm install
   npx wrangler login
   ```

2. Adjust `wrangler.toml`:
   - `MAIL_FROM` — a verified sender on your Resend-verified domain (e.g. `contact@mpalu.io`).
   - `MAIL_TO` — your iCloud custom-domain address.

3. Set secrets (these never land in git):
   ```bash
   npx wrangler secret put RESEND_API_KEY
   npx wrangler secret put TURNSTILE_SECRET
   ```

4. Create a Turnstile site (dashboard → Turnstile → Add site). Use widget type "Managed".
   Copy the **site key** into `index.html` at `window.SITE_CONFIG.turnstileSiteKey`,
   and the **secret** into the `TURNSTILE_SECRET` worker secret above.

5. Deploy:
   ```bash
   npm run deploy
   ```

6. The worker is published at `https://mpalu-contact.<your-subdomain>.workers.dev`.
   Either use that URL directly in `window.SITE_CONFIG.workerEndpoint`, or bind it to a
   custom subdomain like `https://contact.mpalu.io` via the Workers → Routes panel
   (recommended — keeps CORS simple and avoids ad blockers that target `*.workers.dev`).

## Security notes

- Origin is enforced: only requests from `https://mpalu.io` / `https://www.mpalu.io`
  are accepted. Adjust `ALLOWED_ORIGINS` in `src/worker.js` if the domain changes.
- Body size is capped at 8 KiB.
- Input length limits: 100 / 200 / 2000 chars (name / email / message).
- A honeypot field silently succeeds on bot submissions.
- Turnstile token is verified server-side before sending.
- `Reply-To` is sanitized (control characters stripped) to block header injection.
- No PII is logged; only error messages from Resend are captured via `console.error`.
