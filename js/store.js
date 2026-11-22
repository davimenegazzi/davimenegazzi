// Camada de dados. No site publicado na Vercel usa a API (/api/*, banco Neon).
// Quando a API não responde (arquivo aberto direto, prévia), usa o localStorage deste navegador.
(function () {
  const LS = { docs: "dm.docs", pw: "dm.pw", sess: "dm.sess" };
  const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const sessGet = () => { try { return sessionStorage.getItem(LS.sess) === "1"; } catch { return false; } };
  const sessSet = (on) => { try { on ? sessionStorage.setItem(LS.sess, "1") : sessionStorage.removeItem(LS.sess); } catch {} };
  const sha = async (s) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))]
    .map(b => b.toString(16).padStart(2, "0")).join("");
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));

  let mode = "local";
  let signedIn = false;
  const listeners = [];
  const emit = () => listeners.forEach(f => f(signedIn));

  async function api(path, opts = {}) {
    const init = { credentials: "same-origin", ...opts };
    if (opts.body !== undefined) { init.body = JSON.stringify(opts.body); init.headers = { "Content-Type": "application/json" }; }
    const r = await fetch(path, init);
    let data = null;
    try { data = await r.json(); } catch {}
    if (!r.ok) { const e = new Error((data && data.error) || "Erro " + r.status); e.status = r.status; throw e; }
    return data;
  }

  const Store = {
    get cloud() { return mode === "api"; },
    onAuth(f) { listeners.push(f); },
    isAuthed: () => signedIn,

    async init() {
      try {
        const r = await fetch("/api/auth", { credentials: "same-origin" });
        if (r.ok && (r.headers.get("content-type") || "").includes("application/json")) {
          const d = await r.json();
          if (d.db) { mode = "api"; signedIn = !!d.authed; }   // sem banco configurado, segue no modo local
        }
      } catch {}
      if (mode === "local") signedIn = sessGet();
      emit();
    },

    async login(password) {
      if (mode === "api") {
        await api("/api/auth", { method: "POST", body: { password } });
      } else {
        const h = await sha(password);
        const saved = read(LS.pw, null);
        if (!saved) write(LS.pw, h);                 // primeira vez: define a senha local
        else if (saved !== h) throw new Error("Senha incorreta.");
        sessSet(true);
      }
      signedIn = true; emit();
    },

    async logout() {
      if (mode === "api") { try { await api("/api/auth", { method: "DELETE" }); } catch {} }
      sessSet(false);
      signedIn = false; emit();
    },

    async list(kind, { drafts = false } = {}) {
      if (mode === "api") {
        const p = new URLSearchParams();
        if (kind) p.set("kind", kind);
        if (drafts) p.set("drafts", "1");
        return api("/api/posts?" + p);
      }
      return read(LS.docs, [])
        .filter(d => (!kind || d.kind === kind) && (drafts || d.published))
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    },

    async get(id) {
      if (mode === "api") {
        try { return await api("/api/posts?id=" + encodeURIComponent(id)); }
        catch (e) { if (e.status === 404) return null; throw e; }
      }
      return read(LS.docs, []).find(d => d.id === id) || null;
    },

    async save(doc) {
      if (mode === "api") {
        return api("/api/posts", { method: "POST", body: {
          id: doc.id || null, kind: doc.kind, title: doc.title, html: doc.html, doc: doc.doc ?? null, published: !!doc.published
        } });
      }
      const row = { ...doc, updated_at: new Date().toISOString() };
      const all = read(LS.docs, []);
      if (!row.id) { row.id = uid(); row.created_at = row.updated_at; }
      const i = all.findIndex(d => d.id === row.id);
      if (i >= 0) all[i] = { ...all[i], ...row }; else all.push(row);
      write(LS.docs, all);
      return row;
    },

    async remove(id) {
      if (mode === "api") { await api("/api/posts?id=" + encodeURIComponent(id), { method: "DELETE" }); return; }
      write(LS.docs, read(LS.docs, []).filter(d => d.id !== id));
    }
  };
  window.Store = Store;
})();
