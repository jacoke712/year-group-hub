// Year Group Hub server: class-code gate + document storage on Netlify Blobs.
// Serves /api/* (JSON) and /_blob/* (uploaded pictures). Nothing is readable
// or writable without the class-code cookie.
import { getStore } from "@netlify/blobs";
import seed from "./seed.json";

const COOKIE = "ygc";
const PASS_HOURS = 12;        // a class-code pass lasts at most this long
const MAX_FAILS = 10;               // wrong codes allowed per IP...
const FAIL_WINDOW = 15 * 60 * 1000; // ...in this window
const CHANGE_TTL = 10 * 60 * 1000;
const EVENT_TTL = 2 * 60 * 1000;
const PRESENCE_TTL = 60 * 1000;
const MAX_DOC_BYTES = 256 * 1024;
const MAX_UPLOAD = 4 * 1024 * 1024;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"];
const SEG = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;

type Store = ReturnType<typeof getStore>;
let storeCache: Store | null = null;
function store(): Store {
  const injected = (globalThis as any).__ygStore;
  if (injected) return injected;
  if (!storeCache) storeCache = getStore({ name: "yeargroup", consistency: "strong" });
  return storeCache;
}
function classCode(): string | undefined {
  const n = (globalThis as any).Netlify;
  return (n && n.env && n.env.get("CLASS_CODE")) || process.env.CLASS_CODE || undefined;
}

// ---------- helpers ----------
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });
const fail = (status: number, code: string, error: string) => json({ code, error }, status);
const pad = (n: number) => String(n).padStart(13, "0");
const rand = (n = 10) => { const a = crypto.getRandomValues(new Uint8Array(n)); return Array.from(a, b => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join(""); };
const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, "0")).join("");
async function sha256(s: string) { return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))); }
function safeEqual(a: string, b: string) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
function getCookie(req: Request, name: string) {
  const raw = req.headers.get("cookie") || "";
  for (const part of raw.split(/;\s*/)) { const i = part.indexOf("="); if (i > 0 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1)); }
  return null;
}
// Token = "<issued ms>.<hash of code + issued time>", so passes expire and a changed code cancels them.
async function tokenFor(code: string, issued: number) { return issued + "." + await sha256("yg-class-v2|" + code + "|" + issued); }
async function isAuthed(req: Request) {
  const code = classCode(); if (!code) return false;
  const c = getCookie(req, COOKIE); if (!c) return false;
  const issued = Number(c.split(".")[0]);
  if (!Number.isFinite(issued) || issued > Date.now() + 60000 || Date.now() - issued > PASS_HOURS * 3600 * 1000) return false;
  return safeEqual(c, await tokenFor(code, issued));
}
function segs(path: unknown): string[] | null {
  if (typeof path !== "string" || path.length > 1000) return null;
  const s = path.split("/");
  if (s.length > 16 || s.some(x => !SEG.test(x) || x === "." || x === "..")) return null;
  return s;
}
const isDocPath = (p: unknown) => { const s = segs(p); return !!s && s.length % 2 === 0; };
const isColPath = (p: unknown) => { const s = segs(p); return !!s && s.length % 2 === 1; };
const parentOf = (p: string) => p.slice(0, p.lastIndexOf("/"));
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
function deepMerge(base: Record<string, unknown>, patch: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) out[k] = isObj(v) && isObj(out[k]) ? deepMerge(out[k] as Record<string, unknown>, v) : v;
  return out;
}
function checkBody(data: unknown) {
  if (!isObj(data)) return "Document bodies must be objects.";
  if (JSON.stringify(data).length > MAX_DOC_BYTES) return "That's too big to save.";
  return null;
}
async function inBatches<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>) {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += n) out.push(...await Promise.all(items.slice(i, i + n).map(fn)));
  return out;
}

// ---------- storage ----------
async function readDoc(path: string) {
  const v = await store().get("doc/" + path, { type: "json" }) as { d: unknown } | null;
  return v ? v.d : null;
}
async function recordChange(path: string) { await store().set(`chg/${pad(Date.now())}~${rand()}~${path}`, "1"); }
async function writeDoc(path: string, data: Record<string, unknown>) {
  await store().setJSON("doc/" + path, { d: data, t: Date.now() });
  await recordChange(path);
}
async function removeDoc(path: string) { await store().delete("doc/" + path); await recordChange(path); }
async function listCol(col: string) {
  const { blobs } = await store().list({ prefix: "doc/" + col + "/", directories: true });
  const keys = blobs.map(b => b.key).filter(k => !k.slice(("doc/" + col + "/").length).includes("/"));
  const docs: Record<string, unknown> = {};
  await inBatches(keys, 25, async k => { const v = await store().get(k, { type: "json" }) as { d: unknown } | null; if (v) docs[k.slice(k.lastIndexOf("/") + 1)] = v.d; });
  return docs;
}

let seeded = false;
async function ensureSeed() {
  if (seeded) return;
  const s = store();
  if (await s.get("meta/seeded")) { seeded = true; return; }
  const data = seed as { docs: Record<string, Record<string, unknown>>; assets: Record<string, { type: string; b64: string }> };
  await inBatches(Object.entries(data.docs), 10, ([p, d]) => s.setJSON("doc/" + p, { d, t: Date.now() }));
  await inBatches(Object.entries(data.assets), 10, ([id, a]) => s.set("asset/" + id, Uint8Array.from(Buffer.from(a.b64, "base64")).buffer, { metadata: { type: a.type } }));
  await s.set("meta/seeded", String(Date.now()));
  seeded = true;
}

async function prune(now: number) {
  const s = store();
  const drop = async (prefix: string, ttl: number, timeOf: (rest: string) => number) => {
    const { blobs } = await s.list({ prefix });
    const old = blobs.filter(b => now - timeOf(b.key.slice(prefix.length)) > ttl);
    await inBatches(old, 25, b => s.delete(b.key));
  };
  await drop("chg/", CHANGE_TTL, r => Number(r.slice(0, 13)));
  await drop("evt/", EVENT_TTL, r => Number(r.slice(0, 13)));
  await drop("pres/", PRESENCE_TTL * 2, r => Number(r.split("~")[1]));
}

// ---------- class code login ----------
async function login(req: Request, ip: string) {
  const code = classCode();
  if (!code) return fail(503, "unavailable", "This site hasn't been given a class code yet.");
  const body = await req.json().catch(() => ({})) as { code?: unknown };
  const key = "fail/" + (ip || "unknown").replace(/[^A-Za-z0-9.:_-]/g, "_");
  const now = Date.now();
  const rec = (await store().get(key, { type: "json" }) as { n: number; first: number } | null);
  const active = rec && now - rec.first < FAIL_WINDOW ? rec : null;
  if (active && active.n >= MAX_FAILS) {
    const mins = Math.ceil((FAIL_WINDOW - (now - active.first)) / 60000);
    return fail(429, "resource_exhausted", `Too many wrong codes. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`);
  }
  const given = typeof body.code === "string" ? body.code.trim() : "";
  if (!given || !safeEqual(await sha256(given), await sha256(code))) {
    await store().setJSON(key, active ? { n: active.n + 1, first: active.first } : { n: 1, first: now });
    return fail(401, "wrong_code", "That code isn't right.");
  }
  if (rec) await store().delete(key);
  // No Max-Age: the browser drops it when it closes, and the server stops accepting it after PASS_HOURS.
  const cookie = `${COOKIE}=${await tokenFor(code, Date.now())}; Path=/; HttpOnly; Secure; SameSite=Lax`;
  return json({ ok: true }, 200, { "set-cookie": cookie });
}

// ---------- rpc ----------
async function rpc(req: Request) {
  const b = await req.json().catch(() => null) as Record<string, any> | null;
  if (!b || typeof b.op !== "string") return fail(400, "invalid_argument", "Bad request.");
  const s = store();
  switch (b.op) {
    case "load": {
      if (!isColPath(b.col)) return fail(400, "invalid_argument", "Bad collection path.");
      return json({ now: Date.now(), docs: await listCol(b.col) });
    }
    case "get": {
      if (!isDocPath(b.path)) return fail(400, "invalid_argument", "Bad document path.");
      const d = await readDoc(b.path);
      return json({ exists: d !== null, data: d });
    }
    case "set": {
      if (!isDocPath(b.path)) return fail(400, "invalid_argument", "Bad document path.");
      const bad = checkBody(b.data); if (bad) return fail(400, "invalid_argument", bad);
      await writeDoc(b.path, b.data);
      return json({ ok: true });
    }
    case "update": {
      if (!isDocPath(b.path)) return fail(400, "invalid_argument", "Bad document path.");
      if (!isObj(b.data)) return fail(400, "invalid_argument", "Updates must be objects.");
      const cur = await readDoc(b.path);
      if (!isObj(cur)) return fail(400, "invalid_argument", "That document doesn't exist.");
      const next = deepMerge(cur, b.data);
      const bad = checkBody(next); if (bad) return fail(400, "invalid_argument", bad);
      await writeDoc(b.path, next);
      return json({ ok: true, data: next });
    }
    case "delete": {
      if (!isDocPath(b.path)) return fail(400, "invalid_argument", "Bad document path.");
      await removeDoc(b.path);
      return json({ ok: true });
    }
    case "sync": {
      const now = Date.now();
      const since = Number(b.since) || 0;
      const cols = new Set<string>(Array.isArray(b.cols) ? b.cols.filter(isColPath) : []);
      const peer = typeof b.peer === "string" && SEG.test(b.peer) ? b.peer : null;
      const uid = typeof b.uid === "string" && SEG.test(b.uid) ? b.uid : "-";
      const [chg, pres, evt] = await Promise.all([s.list({ prefix: "chg/" }), s.list({ prefix: "pres/" }), s.list({ prefix: "evt/" })]);
      // changed documents
      const latest = new Map<string, number>();
      for (const { key } of chg.blobs) {
        const r = key.slice(4), t = Number(r.slice(0, 13)), i = r.indexOf("~", 14), path = r.slice(i + 1);
        if (t >= since && i > 0 && cols.has(parentOf(path))) latest.set(path, Math.max(t, latest.get(path) || 0));
      }
      const changes = await inBatches([...latest.keys()], 25, async path => ({ path, data: await readDoc(path) }));
      // presence: keys pres/<peer>~<t>~<uid>
      const byPeer = new Map<string, { peer: string; t: number; uid: string; key: string }>();
      for (const { key } of pres.blobs) {
        const [p, t, u] = key.slice(5).split("~");
        const prev = byPeer.get(p);
        if (!prev || Number(t) > prev.t) byPeer.set(p, { peer: p, t: Number(t), uid: u, key });
      }
      if (peer) {
        const mine = byPeer.get(peer);
        if (b.leave) { for (const { key } of pres.blobs) if (key.startsWith("pres/" + peer + "~")) await s.delete(key); byPeer.delete(peer); }
        else if (!mine || mine.uid !== uid || now - mine.t > 20000) {
          const key = `pres/${peer}~${pad(now)}~${uid}`;
          await s.set(key, "1");
          for (const { key: k } of pres.blobs) if (k.startsWith("pres/" + peer + "~")) await s.delete(k);
          byPeer.set(peer, { peer, t: now, uid, key });
        }
      }
      const peers = [...byPeer.values()].filter(p => now - p.t < PRESENCE_TTL).map(p => ({ peer: p.peer, uid: p.uid === "-" ? null : p.uid, t: p.t }));
      // events
      const evKeys = evt.blobs.map(x => x.key).filter(k => Number(k.slice(4, 17)) >= since);
      const events = (await inBatches(evKeys, 25, async k => ({ key: k, ...(await s.get(k, { type: "json" }) as object || {}) })));
      if (Math.random() < 0.05) await prune(now);
      return json({ now, changes, peers, events });
    }
    case "emit": {
      const peer = typeof b.peer === "string" && SEG.test(b.peer) ? b.peer : null;
      if (!peer || b.topic !== "wave") return fail(400, "invalid_argument", "Bad event.");
      const data = JSON.stringify(b.data ?? null); if (data.length > 2000) return fail(400, "invalid_argument", "Event too big.");
      await s.setJSON(`evt/${pad(Date.now())}~${rand()}`, { topic: b.topic, data: b.data ?? null, peer, t: Date.now() });
      return json({ ok: true });
    }
    case "deleteAsset": {
      if (typeof b.id !== "string" || !/^[0-9a-f]{32}$/.test(b.id)) return fail(400, "invalid_argument", "Bad picture id.");
      await s.delete("asset/" + b.id);
      return json({ ok: true });
    }
    default: return fail(400, "invalid_argument", "Unknown request.");
  }
}

async function upload(req: Request) {
  const type = (req.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!IMAGE_TYPES.includes(type)) return fail(415, "unsupported_type", "Only pictures (JPG, PNG, GIF, WebP, SVG) can be uploaded.");
  const buf = await req.arrayBuffer();
  if (!buf.byteLength) return fail(400, "invalid_argument", "That file is empty.");
  if (buf.byteLength > MAX_UPLOAD) return fail(413, "invalid_argument", "That picture is too big (4 MB max).");
  const id = hex(crypto.getRandomValues(new Uint8Array(16)).buffer);
  await store().set("asset/" + id, buf, { metadata: { type } });
  return json({ id, url: "/_blob/" + id, sizeBytes: buf.byteLength, contentType: type });
}

async function serveAsset(id: string) {
  if (!/^[0-9a-f]{32}$/.test(id)) return new Response("Not found", { status: 404 });
  const r = await store().getWithMetadata("asset/" + id, { type: "arrayBuffer" }) as { data: ArrayBuffer; metadata: Record<string, unknown> } | null;
  if (!r) return new Response("Not found", { status: 404 });
  const type = IMAGE_TYPES.includes(String(r.metadata.type)) ? String(r.metadata.type) : "application/octet-stream";
  return new Response(r.data, { headers: {
    "content-type": type, "cache-control": "private, max-age=86400", "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  } });
}

export default async (req: Request, context: { ip?: string }) => {
  const url = new URL(req.url);
  const path = url.pathname;
  try {
    if (path === "/api/login" && req.method === "POST") return await login(req, context?.ip || "");
    if (path === "/api/logout" && req.method === "POST") return json({ ok: true }, 200, { "set-cookie": `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0` });
    const authed = await isAuthed(req);
    if (path === "/api/me") return json({ ok: authed, configured: !!classCode() });
    if (!authed) return path.startsWith("/_blob/") ? new Response("Enter the class code first", { status: 401 }) : fail(401, "code_required", "Enter the class code first.");
    await ensureSeed();
    if (path.startsWith("/_blob/") && req.method === "GET") return await serveAsset(path.slice(7));
    if (path === "/api/rpc" && req.method === "POST") return await rpc(req);
    if (path === "/api/upload" && req.method === "POST") return await upload(req);
    return fail(404, "invalid_argument", "Not found.");
  } catch (e) {
    console.error("api error", e);
    return fail(503, "unavailable", "Something went wrong on the server. Try again.");
  }
};

export const config = { path: ["/api/*", "/_blob/*"] };
