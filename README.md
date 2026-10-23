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
