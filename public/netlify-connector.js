/* Year Group Hub on Netlify: stands in for Claude's page storage.
   Provides window.claude.use("db" | "user" | "room" | "assets") backed by /api,
   and shows the class-code screen until the server accepts the code. */
(function () {
  "use strict";
  var readyResolve, ready = new Promise(function (r) { readyResolve = r; });
  var gateShown = false;

  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function rid(n) { var s = "", a = "abcdefghijklmnopqrstuvwxyz0123456789"; var b = new Uint8Array(n || 20); crypto.getRandomValues(b); for (var i = 0; i < b.length; i++) s += a[b[i] % 36]; return s; }
  function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
  function isObj(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
  function deepMerge(base, patch) { var out = Object.assign({}, base); Object.keys(patch).forEach(function (k) { out[k] = isObj(patch[k]) && isObj(out[k]) ? deepMerge(out[k], patch[k]) : patch[k]; }); return out; }
  function err(code, message) { var e = new Error(message); e.code = code; return e; }

  async function call(url, opts) {
    var r;
    try { r = await fetch(url, Object.assign({ credentials: "same-origin" }, opts)); }
    catch (e) { throw err("unavailable", "Can't reach the site. Check your internet connection."); }
    var j = await r.json().catch(function () { return {}; });
    if (r.status === 401 && url.indexOf("/api/login") < 0) { tabOk(false); showGate(); throw err("unavailable", "Enter the class code first."); }
    if (!r.ok) throw err(j.code || (r.status === 413 ? "invalid_argument" : "unavailable"), j.error || "Something went wrong.");
    return j;
  }
  function rpc(op, body) { return call("/api/rpc", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.assign({ op: op }, body || {})) }); }

  /* ---------------- class code gate ---------------- */
  var GATE_CSS = "#ygGate{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:16px;background:var(--bg,#f3f5f9);color:var(--ink,#111a2e);font-family:var(--font-body,system-ui,sans-serif)}" +
    "#ygGate .box{width:min(400px,100%);background:var(--surface,#fff);border:1px solid var(--line,#dde3ee);border-radius:16px;padding:28px 24px;display:flex;flex-direction:column;gap:14px;box-shadow:0 20px 60px rgba(0,0,0,.12)}" +
    "#ygGate .crest{width:48px;height:52px;display:grid;place-items:center;background:var(--gold,#e2a93b);color:var(--gold-ink,#1b1606);font:700 1rem var(--font-display,system-ui);clip-path:polygon(0 0,100% 0,100% 70%,50% 100%,0 70%);padding-bottom:8px}" +
    "#ygGate h1{margin:0;font:700 1.5rem var(--font-display,system-ui);letter-spacing:-.01em}" +
    "#ygGate p{margin:0;color:var(--muted,#5b6680)}" +
    "#ygGate input{font:600 1.4rem var(--font-mono,ui-monospace,monospace);letter-spacing:.35em;text-align:center;border:1.5px solid var(--line,#dde3ee);border-radius:10px;padding:12px;background:var(--surface-2,#f7f9fc);color:var(--ink,#111a2e);width:100%}" +
    "#ygGate button{border:0;border-radius:10px;padding:12px 16px;font:800 1rem var(--font-body,system-ui);background:var(--primary,#16264a);color:var(--primary-ink,#fff);cursor:pointer}" +
    "#ygGate button:disabled{opacity:.6;cursor:default}" +
    "#ygGate .err{color:var(--bad,#c23b3b);font-weight:700;min-height:1.4em}";
  function showGate() {
    if (gateShown) return; gateShown = true;
    var mount = function () {
      if (!document.getElementById("ygGateCss")) { var st = document.createElement("style"); st.id = "ygGateCss"; st.textContent = GATE_CSS; document.head.appendChild(st); }
      var g = document.createElement("div"); g.id = "ygGate"; g.setAttribute("role", "dialog"); g.setAttribute("aria-modal", "true"); g.setAttribute("aria-labelledby", "ygGateTitle");
      g.innerHTML = '<form class="box" novalidate><span class="crest" aria-hidden="true">YG</span><h1 id="ygGateTitle">Enter the class code</h1>' +
        '<p>This site is just for our year group. Ask a classmate or your teacher for the code.</p>' +
        '<input id="ygCode" type="password" inputmode="numeric" autocomplete="off" maxlength="20" aria-label="Class code" placeholder="••••">' +
        '<p class="err" id="ygErr" role="alert"></p><button type="submit" id="ygGo">Go in</button></form>';
      document.body.appendChild(g);
      var input = g.querySelector("#ygCode"), errEl = g.querySelector("#ygErr"), go = g.querySelector("#ygGo");
      setTimeout(function () { input.focus(); }, 50);
      g.querySelector("form").addEventListener("submit", async function (e) {
        e.preventDefault(); errEl.textContent = "";
        var code = input.value.trim(); if (!code) { errEl.textContent = "Type the class code."; return; }
        go.disabled = true; go.textContent = "Checking…";
        try {
          await call("/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: code }) });
          tabOk(true); g.remove(); gateShown = false; readyResolve(); kick();
        } catch (ex) { errEl.textContent = ex.message; input.value = ""; input.focus(); }
        go.disabled = false; go.textContent = "Go in";
      });
    };
    if (document.body) mount(); else document.addEventListener("DOMContentLoaded", mount);
  }
  // Ask for the code every time the site is opened in a new tab or window.
  // Refreshing a tab that already has the code doesn't ask again.
  function tabOk(v) { try { if (v === undefined) return sessionStorage.getItem("yg-tab-ok") === "1"; if (v) sessionStorage.setItem("yg-tab-ok", "1"); else sessionStorage.removeItem("yg-tab-ok"); } catch (e) { return false; } }
  if (!tabOk()) showGate();
  else fetch("/api/me", { credentials: "same-origin" }).then(function (r) { return r.json(); }).then(function (j) {
    if (j.ok) readyResolve(); else { tabOk(false); showGate(); }
  }).catch(function () { showGate(); });

  /* ---------------- document store ---------------- */
  var cols = {};      // colPath -> {docs:{}, loaded, loading, qListeners:Set}
  var docLs = {};     // docPath -> Set(fn)
  var lastNow = 0;
  var parentOf = function (p) { return p.slice(0, p.lastIndexOf("/")); };
  var idOf = function (p) { return p.slice(p.lastIndexOf("/") + 1); };
  var SEG = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;
  function checkPath(p, even) {
    var s = String(p).split("/");
    if (s.length > 16 || s.some(function (x) { return !SEG.test(x) || x === "." || x === ".."; }) || (s.length % 2 === 0) !== even)
      throw new TypeError("Bad " + (even ? "document" : "collection") + " path: " + p + " (" + s.length + " segments)");
  }
  function col(path) { return cols[path] || (cols[path] = { docs: {}, loaded: false, loading: null, q: new Set() }); }
  function ensure(path) {
    var c = col(path);
    if (c.loaded) return Promise.resolve(c);
    if (!c.loading) c.loading = ready.then(function () { return rpc("load", { col: path }); }).then(function (r) {
      c.docs = r.docs || {}; c.loaded = true; c.loading = null; if (!lastNow) lastNow = r.now; notify(path); return c;
    }, function (e) { c.loading = null; throw e; });
    return c.loading;
  }
  function docSnap(path) {
    var c = cols[parentOf(path)], v = c && c.docs[idOf(path)];
    return { id: idOf(path), exists: v !== undefined, data: function () { return clone(v); }, metadata: { fromCache: false, hasPendingWrites: false } };
  }
  function runQuery(path, q) {
    var c = col(path), docs = Object.keys(c.docs).map(function (id) { return { id: id, v: c.docs[id] }; });
    (q.where || []).forEach(function (w) {
      docs = docs.filter(function (d) {
        var x = d.v[w[0]], y = w[2];
        switch (w[1]) { case "==": return x === y; case "!=": return x !== y; case "<": return x < y; case "<=": return x <= y; case ">": return x > y; case ">=": return x >= y;
          case "in": return Array.isArray(y) && y.indexOf(x) >= 0; case "not-in": return Array.isArray(y) && y.indexOf(x) < 0; case "array-contains": return Array.isArray(x) && x.indexOf(y) >= 0; default: return true; }
      });
    });
    if (q.order) { var f = q.order[0], dir = q.order[1] === "desc" ? -1 : 1;
      docs.sort(function (a, b) { var x = a.v[f], y = b.v[f]; if (x === undefined && y === undefined) return 0; if (x === undefined) return 1; if (y === undefined) return -1; return x < y ? -dir : x > y ? dir : 0; });
    } else docs.sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
    if (q.limit) docs = docs.slice(0, q.limit);
    var snaps = docs.map(function (d) { var v = d.v; return { id: d.id, exists: true, data: function () { return clone(v); }, metadata: { fromCache: false, hasPendingWrites: false } }; });
    return { docs: snaps, size: snaps.length, empty: !snaps.length, docChanges: function () { return []; }, metadata: { fromCache: false, hasPendingWrites: false } };
  }
  function notify(path) {
    var c = cols[path]; if (!c || !c.loaded) return;
    c.q.forEach(function (l) { try { l.next(runQuery(path, l.q)); } catch (e) { console.error(e); } });
    Object.keys(docLs).forEach(function (dp) { if (parentOf(dp) === path) docLs[dp].forEach(function (fn) { try { fn(docSnap(dp)); } catch (e) { console.error(e); } }); });
  }
  function localSet(path, data) { var c = cols[parentOf(path)]; if (c && c.loaded) { if (data === null) delete c.docs[idOf(path)]; else c.docs[idOf(path)] = clone(data); notify(parentOf(path)); } }
  function reload(path) { var c = cols[path]; if (c) { c.loaded = false; ensure(path).catch(function () {}); } }

  function docRef(path) {
    checkPath(path, true);
    return {
      id: idOf(path), path: path,
      get: async function () { await ensure(parentOf(path)); return docSnap(path); },
      set: async function (data) {
        if (!isObj(data)) throw err("invalid_argument", "Documents must be objects.");
        localSet(path, data);
        try { await rpc("set", { path: path, data: data }); } catch (e) { reload(parentOf(path)); throw e; }
      },
      update: async function (data) {
        var c = cols[parentOf(path)], cur = c && c.loaded ? c.docs[idOf(path)] : undefined;
        if (cur !== undefined) localSet(path, deepMerge(cur, data));
        try { var r = await rpc("update", { path: path, data: data }); if (r.data) localSet(path, r.data); } catch (e) { reload(parentOf(path)); throw e; }
      },
      delete: async function () { localSet(path, null); try { await rpc("delete", { path: path }); } catch (e) { reload(parentOf(path)); throw e; } },
      acquire: async function () { return { acquired: true }; },
      onSnapshot: function (next, onErr) {
        var set = docLs[path] || (docLs[path] = new Set()), fn = function (s) { next(s); };
        set.add(fn); track(parentOf(path));
        ensure(parentOf(path)).then(function () { fn(docSnap(path)); }, function (e) { if (onErr) onErr(e); });
        return function () { set.delete(fn); };
      },
      collection: function (sub) { return colRef(path + "/" + sub); }
    };
  }
  function colRef(path, q) {
    checkPath(path, false); q = q || {};
    var self = {
      path: path,
      doc: function (id) { return docRef(path + "/" + (id || rid(20))); },
      add: async function (data) { var r = self.doc(); await r.set(data); return r; },
      where: function (f, op, v) { return colRef(path, Object.assign({}, q, { where: (q.where || []).concat([[f, op, v]]) })); },
      orderBy: function (f, d) { return colRef(path, Object.assign({}, q, { order: [f, d || "asc"] })); },
      limit: function (n) { return colRef(path, Object.assign({}, q, { limit: n })); },
      get: async function () { await ensure(path); return runQuery(path, q); },
      onSnapshot: function (next, onErr) {
        var l = { q: q, next: next }, c = col(path);
        c.q.add(l); track(path);
        ensure(path).then(function () { next(runQuery(path, q)); }, function (e) { if (onErr) onErr(e); });
        return function () { c.q.delete(l); };
      }
    };
    return self;
  }
  var tracked = new Set();
  function track(path) { tracked.add(path); }
  var db = { doc: docRef, collection: function (p) { return colRef(p); } };

  /* ---------------- live updates (polling) ---------------- */
  var peerId = rid(12), myUid = null, peerList = [], peerLs = new Set(), evLs = {}, seenEv = new Set(), timer = null, inFlight = false, leaving = false;
  async function sync() {
    if (inFlight) return; inFlight = true;
    try {
      await ready;
      var loaded = Array.from(tracked).filter(function (p) { return cols[p] && cols[p].loaded; });
      var r = await rpc("sync", { since: Math.max(0, lastNow - 8000), cols: loaded, peer: peerId, uid: myUid || "-" });
      lastNow = r.now;
      var touched = new Set();
      (r.changes || []).forEach(function (ch) { var c = cols[parentOf(ch.path)]; if (!c || !c.loaded) return;
        if (ch.data === null || ch.data === undefined) delete c.docs[idOf(ch.path)]; else c.docs[idOf(ch.path)] = ch.data; touched.add(parentOf(ch.path)); });
      touched.forEach(notify);
      var before = peerList; peerList = (r.peers || []).map(function (p) { return { peer: p.peer, by: null, isMe: p.peer === peerId, sameTab: p.peer === peerId, kind: "viewer", guest: false, presence: { uid: p.uid }, updatedAt: p.t }; });
      var ids = function (l) { return l.map(function (p) { return p.peer + "|" + p.presence.uid; }).sort().join(","); };
      if (ids(before) !== ids(peerList)) {
        var had = new Set(before.map(function (p) { return p.peer; })), has = new Set(peerList.map(function (p) { return p.peer; }));
        var change = { peers: peerList, joined: peerList.filter(function (p) { return !had.has(p.peer); }), left: before.filter(function (p) { return !has.has(p.peer); }), updated: [] };
        peerLs.forEach(function (fn) { try { fn(change); } catch (e) { console.error(e); } });
      }
      (r.events || []).forEach(function (ev) {
        if (seenEv.has(ev.key)) return; seenEv.add(ev.key);
        var msg = { topic: ev.topic, data: ev.data, peer: ev.peer, by: null, isMe: ev.peer === peerId, sameTab: ev.peer === peerId, kind: "viewer", guest: false };
        (evLs[ev.topic] || new Set()).forEach(function (fn) { try { fn(msg); } catch (e) { console.error(e); } });
      });
    } catch (e) { /* try again next tick */ }
    finally { inFlight = false; }
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(function () { sync().then(schedule); }, document.hidden ? 30000 : 4000); }
  function kick() { clearTimeout(timer); sync().then(schedule); }
  ready.then(kick);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) kick(); });
  window.addEventListener("pagehide", function () { if (leaving) return; leaving = true;
    try { navigator.sendBeacon && navigator.sendBeacon("/api/rpc", new Blob([JSON.stringify({ op: "sync", since: Date.now(), cols: [], peer: peerId, leave: true })], { type: "application/json" })); } catch (e) {} });

  var room = {
    emit: async function (topic, data) { await rpc("emit", { peer: peerId, topic: topic, data: data }); },
    on: function (topic, fn) { var s = evLs[topic] || (evLs[topic] = new Set()); s.add(fn); return function () { s.delete(fn); }; },
    presence: async function (patch) { var u = patch && patch.uid; myUid = typeof u === "string" ? u : null; kick(); },
    peers: function () { return peerList; },
    onPeers: function (fn) { peerLs.add(fn); return function () { peerLs.delete(fn); }; },
    connected: function () { return true; },
    onConnection: function (fn) { fn(true); return function () {}; },
    join: async function () { return room; },
    leave: async function () {}
  };

  /* ---------------- device "user" and pictures ---------------- */
  var deviceId = ls("yg-device") || (function () { var v = "d_" + rid(20); ls("yg-device", v); return v; })();
  var user = {
    id: async function () { return deviceId; },
    isOwner: async function () { return false; },
    canEdit: async function () { return false; },
    can: async function (name) { return name === "data.write" ? true : false; },
    me: async function () { return { id: deviceId, name: "", avatarUrl: "", color: "#8893a8", email: null, isOwner: false, canEdit: false }; },
    profiles: async function (ids) { var o = {}; [].concat(ids).forEach(function (i) { o[i] = { id: i, name: "", avatarUrl: "", color: "#8893a8", email: null, isMe: i === deviceId, guest: false }; }); return o; },
    name: async function () { return ""; }, avatarUrl: async function () { return null; }, email: async function () { return null; }, search: async function () { return []; }
  };
  var assets = {
    upload: async function (blob) {
      return call("/api/upload", { method: "POST", headers: { "content-type": blob.type || "application/octet-stream" }, body: blob });
    },
    delete: async function (id) { await rpc("deleteAsset", { id: String(id).replace(/^.*\//, "") }); },
    list: async function () { return { assets: [], usage: {} }; }
  };

  var caps = { db: db, user: user, room: room, assets: assets };
  window.claude = { use: async function (name) { await ready; return caps[name] || null; } };
})();
