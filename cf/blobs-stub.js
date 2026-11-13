// The Cloudflare build never uses Netlify Blobs: the D1 store is handed in instead.
export function getStore() { throw new Error("Netlify Blobs isn't available on Cloudflare."); }
