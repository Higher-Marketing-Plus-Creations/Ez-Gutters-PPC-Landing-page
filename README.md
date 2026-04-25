# Ez-Gutters-PPC-Landing-page

Ez Gutters PPC Landing page.

## Files

- `index.html` — landing page markup
- `styles.css` — landing page styles

## Preview

Open `index.html` in your browser to view the landing page.

## Deployment

This repo is configured to deploy automatically to GitHub Pages whenever changes are pushed to the `main` branch.

Expected live URL:

- `https://highermarketingplus-create.github.io/Ez-Gutters-PPC-Landing-page/`

## Email Configuration

Lead notifications use Resend through the Cloudflare Worker route at `/api/lead`.

```env
RESEND_API_KEY=re_PASTE_YOUR_KEY_HERE
LEAD_EMAIL_TO=leads@highermarketingplus.com,ezgutterzz@gmail.com,jonathan@highermarketingplus.com
LEAD_EMAIL_FROM=HMP Leads <leads@highermarketingplus.com>
```
