# Deutschly public AI bridge

This Worker gives the published app a public HTTPS AI endpoint without putting a Gemini key in the browser. It uses the Cloudflare Workers AI binding and keeps the existing frontend routes:

- `POST /api/gemini/check-card`
- `POST /api/gemini/word-batch`
- `GET /api/health`

## Deploy

From the Deutschly project folder:

```powershell
npm exec --yes wrangler -- login
npm exec --yes wrangler -- deploy --config wrangler.jsonc
```

Wrangler prints the Worker URL after deployment. Set that URL as the GitHub repository variable `VITE_AI_BRIDGE_URL`, then run the Pages workflow again. The repository variable is public build configuration, not a secret.

If Wrangler warns that the account needs a `workers.dev` subdomain, open Workers & Pages in the Cloudflare dashboard, select **Your subdomain**, choose an available name, and save it. Deploy again after the subdomain is registered. The public URL then follows the form `https://deutschly-ai.<your-subdomain>.workers.dev`.

```powershell
gh variable set VITE_AI_BRIDGE_URL --repo Soheil-Aghayani/Deutschly --body 'https://deutschly-ai.<your-subdomain>.workers.dev'
gh workflow run 'Deploy to GitHub Pages' --repo Soheil-Aghayani/Deutschly
```

The Worker allowlist is in `wrangler.jsonc`. Add another exact HTTPS origin there if the app gets a new domain, then deploy again. Never put a Gemini or other provider key in this file, the repository, or frontend code.

## Test

```powershell
Invoke-RestMethod 'https://deutschly-ai.<your-subdomain>.workers.dev/api/health'
```

Cloudflare's free Workers plan includes a daily request allowance, and Workers AI has a separate free daily neuron allowance. If the AI allowance is exhausted, the Worker returns a clear temporary-quota error and the checked local word bank remains usable.
