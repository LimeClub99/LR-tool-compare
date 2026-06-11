# AI Editing Compare

A free, browser-based tool that measures how closely AI photo-editing services
reproduce a photographer's own Lightroom edits.

A growing number of services — Aftershoot, Filterpixel, FotoLab, Imagen AI,
Neurapix and others — promise to learn your editing style and apply it to new
photos for you. This tool puts that promise to the test. It prepares a set of
*your* photos for each service to edit, then — once you've run them through —
measures how closely each result matches the way you edited them yourself, and
ranks the services against each other.

Everything runs locally in your browser. No photos, catalogs or results are
uploaded anywhere.

## How it works

The benchmark runs in three steps, two of them inside this tool and one inside
each AI service:

1. **Prepare your photos.** Point the tool at your Lightroom catalog. It splits
   your edited photos into a batch *to learn from* (your style) and a separate
   batch *to edit* (reset to their unedited state), then saves a ready-to-use
   package for each service you want to test.

2. **Run each service.** Take each package to its service — a free trial or your
   own account — and use it as you normally would: let it learn from your edits,
   then have it edit the second batch and export the result. This happens
   entirely in the service's own app.

3. **Score the match.** Load the edited photos back into the tool. It compares
   each service's edit of a photo to *your* edit of the same photo, parameter by
   parameter, and ranks how closely each service reproduced your look.

## Testing how services improve with more data

A service should match your style more closely the more of your photos it has
learned from. The tool lets you test this directly: run each service several
times at increasing training sizes — say 2,000 photos, then 5,000, then 10,000 —
with every service editing the same photos at each step.

This reproduces real-world usage, where images are added to a service
continually in the hope it becomes more accurate. The results show whether a
service is genuinely learning from more data, or failing to improve as the
training set grows.

## Output

- **Dashboard** — interactive charts and tables comparing services overall, per
  edit parameter, and across training sizes.
- **Print-ready PDF report** — a formatted write-up of the results, suitable for
  publishing or sharing.

Results can be anonymised before sharing.

## What it measures

The comparison works on the editing parameters stored in the Lightroom catalog
(exposure, contrast, tone curve, color adjustments, and so on) rather than on
rendered pixels. For each parameter it reports how far a service's value sits
from your own, then aggregates these into per-service and per-parameter scores.
The metric definitions and their real-world interpretation are documented in the
tool itself.

## Running it locally

The tool is a static React application. You need [Node.js](https://nodejs.org).

```bash
npm install
npm run dev      # start the local dev server
npm run build    # produce a static build in dist/
npm run preview  # serve the production build locally
```

Open the URL printed by `npm run dev` in your browser.

## Built with

React, TypeScript and Vite, with [sql.js](https://sql.js.org) to read Lightroom
catalogs (SQLite) directly in the browser. No server or backend is involved.

## License

Released under the GNU Affero General Public License v3.0. See `LICENSE`.
