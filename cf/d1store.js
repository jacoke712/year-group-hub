// A small key-value store on Cloudflare D1, shaped like the parts of Netlify Blobs the server uses,
// plus many-at-once helpers so one request stays well under D1's per-request query limit.
const HI = "￿";
let made = null;
export function d1Store(db) {
  const ready = () => (made ||= db.prepare("CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v BLOB, meta TEXT)").run().catch(e => { made = null; throw e; }));
  const toBuf = v => (typeof v === "string" ? new TextEncoder().encode(v) : new Uint8Array(v)).buffer;
  const toText = v => (typeof v === "string" ? v : new TextDecoder().decode(new Uint8Array(v)));
  const conv = (v, type) => (type === "json" ? JSON.parse(toText(v)) : type === "arrayBuffer" ? toBuf(v) : toText(v));
  const val = v => (typeof v === "string" ? v : v instanceof ArrayBuffer ? v : new Uint8Array(v.buffer || v).buffer);
  const chunks = (a, n) => { const out = []; for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n)); return out; };
  return {
    async get(k, o = {}) { await ready(); const r = await db.prepare("SELECT v FROM kv WHERE k=?").bind(k).first(); return r ? conv(r.v, o.type) : null; },
    async getWithMetadata(k, o = {}) {
      await ready(); const r = await db.prepare("SELECT v, meta FROM kv WHERE k=?").bind(k).first();
      return r ? { data: conv(r.v, o.type), metadata: r.meta ? JSON.parse(r.meta) : {} } : null;
    },
    async set(k, v, o = {}) { await ready(); await db.prepare("INSERT OR REPLACE INTO kv (k, v, meta) VALUES (?, ?, ?)").bind(k, val(v), o.metadata ? JSON.stringify(o.metadata) : null).run(); },
    async setJSON(k, v) { return this.set(k, JSON.stringify(v)); },
    async delete(k) { await ready(); await db.prepare("DELETE FROM kv WHERE k=?").bind(k).run(); },
    async list({ prefix = "" } = {}) {
      await ready(); const { results } = await db.prepare("SELECT k FROM kv WHERE k >= ? AND k < ? ORDER BY k").bind(prefix, prefix + HI).all();
      return { blobs: results.map(r => ({ key: r.k })) };
    },
    async listValues(prefix) {
      await ready(); const { results } = await db.prepare("SELECT k, v FROM kv WHERE k >= ? AND k < ? ORDER BY k").bind(prefix, prefix + HI).all();
      return results.map(r => ({ key: r.k, value: toText(r.v) }));
    },
    async getMany(keys) {
      const m = new Map(); if (!keys.length) return m; await ready();
      for (const part of chunks([...new Set(keys)], 90)) {
        const { results } = await db.prepare(`SELECT k, v FROM kv WHERE k IN (${part.map(() => "?").join(",")})`).bind(...part).all();
        for (const r of results) m.set(r.k, toText(r.v));
      }
      return m;
    },
    async putMany(rows) {
      await ready();
      for (const part of chunks(rows, 30)) {
        await db.prepare(`INSERT OR REPLACE INTO kv (k, v, meta) VALUES ${part.map(() => "(?, ?, ?)").join(",")}`)
          .bind(...part.flatMap(r => [r.key, val(r.value), r.metadata ? JSON.stringify(r.metadata) : null])).run();
      }
    },
    async deleteBefore(prefix, upto) { await ready(); await db.prepare("DELETE FROM kv WHERE k >= ? AND k < ?").bind(prefix, prefix + upto).run(); },
  };
}
