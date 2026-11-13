# Year Group Hub (Netlify version)

The year group site, set up to run on Netlify.

- `public/` is the website. `index.html` is built from the Claude version by `build.py`.
- `public/netlify-connector.js` lets the page save to this site's own storage instead of Claude's.
- `netlify/functions/api.mts` is the server. It checks the class code (the `CLASS_CODE`
  environment variable in Netlify, never stored in this repo) and stores everything in Netlify Blobs.
- `netlify/functions/seed.json` holds the accounts, quizzes and pictures copied from the Claude
  version. It is only used the very first time the site starts.

To change the class code: Netlify > this project > Project configuration > Environment variables >
`CLASS_CODE`, then redeploy. Everyone will need to type the new code.

## Hosting on Cloudflare Pages (free)

The same site also runs on Cloudflare Pages, with its data in a Cloudflare D1 database.

- `functions/[[path]].js` and `cf/server.bundle.js` are the server (built by `./build-cf.sh` from `netlify/functions/api.mts`).
- `public/_routes.json` makes only `/api/*` and `/_blob/*` run the server, so pages and pictures don't use up the free request allowance.
- Cloudflare settings: no build command, output folder `public`, a D1 database bound as `DB`, and a variable `CLASS_CODE`.
