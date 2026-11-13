// Cloudflare Pages entry: hands the Netlify-style server a D1 store and the class code, then runs it.
import handler from "../netlify/functions/api.mts";
import { d1Store } from "./d1store.js";
let storeFor = null, cached = null;
export async function onRequest(context) {
  const { request, env } = context;
  if (!env.DB) return new Response(JSON.stringify({ code: "unavailable", error: "This site isn't linked to its database yet." }), { status: 503, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  if (storeFor !== env.DB) { cached = d1Store(env.DB); storeFor = env.DB; }
  globalThis.__ygStore = cached;
  globalThis.Netlify = { env: { get: k => (k === "CLASS_CODE" ? (env.CLASS_CODE || undefined) : undefined) } };
  return handler(request, { ip: request.headers.get("cf-connecting-ip") || "" });
}
