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
  let apiNoDb = false; // o site tem a API, mas o banco não está conectado
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

  // mesma regra de api/posts.js: devolve o link pronto ou "" se não for http(s)/mailto
  const cleanLink = (v) => {
    let u = String(v ?? "").trim();
    if (!u || u.length > 2000) return "";
    if (!/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(u)) u = "https://" + u.replace(/^\/+/, "");
    return /^(https?:\/\/[^\s/]+|mailto:\S+@)/i.test(u) && !/\s/.test(u) ? u : "";
  };
  const clampInt = (v) => { const n = Math.trunc(Number(v)); return Number.isFinite(n) ? Math.max(-1e6, Math.min(1e6, n)) : 0; };

  const Store = {
    cleanLink,
    get cloud() { return mode === "api"; },
    get apiWithoutDb() { return apiNoDb; },

    // textos guardados neste navegador (modo local)
    localDocs() { return read(LS.docs, []); },
    // depois de enviados ao banco, saem da lista local e ficam numa cópia de segurança
    archiveLocal(ids) {
      const all = read(LS.docs, []);
      write(LS.docs + ".enviados", [...read(LS.docs + ".enviados", []), ...all.filter(d => ids.includes(d.id))]);
      write(LS.docs, all.filter(d => !ids.includes(d.id)));
    },
    onAuth(f) { listeners.push(f); },
    isAuthed: () => signedIn,

    async init() {
      try {
        const r = await fetch("/api/auth", { credentials: "same-origin" });
        if (r.ok && (r.headers.get("content-type") || "").includes("application/json")) {
          const d = await r.json();
          if (d.db) { mode = "api"; signedIn = !!d.authed; }   // sem banco configurado, segue no modo local
          else apiNoDb = true;
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
        .sort((a, b) => (b.published_at || b.updated_at).localeCompare(a.published_at || a.updated_at));
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
          id: doc.id || null, kind: doc.kind, title: doc.title, html: doc.html, doc: doc.doc ?? null, published: !!doc.published,
          ...(doc.kind === "projeto" ? {
            // link incompleto ou inválido vai vazio: o resto do texto continua sendo salvo
            pinned: !!doc.pinned, link: cleanLink(doc.link),
            opens: doc.opens === "link" ? "link" : "pagina", look: doc.look === "cartao" ? "cartao" : "badge",
            summary: String(doc.summary || "").slice(0, 300), tags: String(doc.tags || "").slice(0, 200), ordem: clampInt(doc.ordem)
          } : {})
        } });
      }
      const row = { ...doc, updated_at: new Date().toISOString() };
      const all = read(LS.docs, []);
      if (!row.id) { row.id = uid(); row.created_at = row.updated_at; }
      const i = all.findIndex(d => d.id === row.id);
      const prev = i >= 0 ? all[i] : {};
      row.published_at = row.published ? (prev.published_at || row.updated_at) : (prev.published_at || null);
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
