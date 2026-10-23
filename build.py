# Builds public/index.html from the Claude version of the site plus the Netlify connector.
src=open('/home/claude/year-group-hub.html').read()
head=('<!doctype html><html lang="en-GB"><head><meta charset="utf-8">'
 '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
 '<meta name="robots" content="noindex,nofollow"><link rel="icon" href="/favicon.svg" type="image/svg+xml">'
 '<style>:root{color-scheme:light;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}'
 'html{scroll-padding-top:env(safe-area-inset-top,0px)}body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#fff;color:#000}'
 'img{max-width:100%}[hidden]:not([hidden=until-found i]){display:none!important}</style>'
 '<script src="/netlify-connector.js"></script></head><body>\n')
open('public/index.html','w').write(head+src+'\n</body></html>\n')
print('built', len(head+src), 'bytes')
