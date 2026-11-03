// Camada de dados: Supabase quando configurado, senão localStorage.
(function () {
  const cfg = window.CONFIG || {};
  const cloud = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase);
  const sb = cloud ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;
  const LS = { docs: "dm.docs", pw: "dm.pw", sess: "dm.sess" };
  const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const sha = async (s) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))]
    .map(b => b.toString(16).padStart(2, "0")).join("");
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));

  let signedIn = false;
  const listeners = [];
  const emit = () => listeners.forEach(f => f(signedIn));

  const Store = {
    cloud,
    onAuth(f) { listeners.push(f); },
    isAuthed: () => signedIn,

    async init() {
      if (cloud) {
        const { data } = await sb.auth.getSession();
        signedIn = !!data.session;
        sb.auth.onAuthStateChange((_e, s) => { signedIn = !!s; emit(); });
      } else {
        signedIn = sessionStorage.getItem(LS.sess) === "1";
      }
      emit();
    },

    async login(email, password) {
      if (cloud) {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw new Error("E-mail ou senha inválidos.");
        return;
      }
      const h = await sha(password);
      const saved = read(LS.pw, null);
      if (!saved) { write(LS.pw, h); }            // primeira vez: define a senha local
      else if (saved !== h) throw new Error("Senha incorreta.");
      sessionStorage.setItem(LS.sess, "1");
      signedIn = true; emit();
    },

    async logout() {
      if (cloud) await sb.auth.signOut();
      sessionStorage.removeItem(LS.sess);
      signedIn = false; emit();
    },

    async list(kind, { drafts = false } = {}) {
      if (cloud) {
        let q = sb.from("posts").select("id,kind,title,published,updated_at").order("updated_at", { ascending: false });
        if (kind) q = q.eq("kind", kind);
        if (!drafts) q = q.eq("published", true);
        const { data, error } = await q;
        if (error) throw error;
        return data;
      }
      return read(LS.docs, [])
        .filter(d => (!kind || d.kind === kind) && (drafts || d.published))
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    },

    async get(id) {
      if (cloud) {
        const { data, error } = await sb.from("posts").select("*").eq("id", id).single();
        if (error) throw error;
        return data;
      }
      return read(LS.docs, []).find(d => d.id === id) || null;
    },

    async save(doc) {
      const row = { ...doc, updated_at: new Date().toISOString() };
      if (cloud) {
        if (!row.id) delete row.id;
        const { data, error } = await sb.from("posts").upsert(row).select().single();
        if (error) throw error;
        return data;
      }
      const all = read(LS.docs, []);
      if (!row.id) { row.id = uid(); row.created_at = row.updated_at; }
      const i = all.findIndex(d => d.id === row.id);
      if (i >= 0) all[i] = { ...all[i], ...row }; else all.push(row);
      write(LS.docs, all);
      return row;
    },

    async remove(id) {
      if (cloud) { const { error } = await sb.from("posts").delete().eq("id", id); if (error) throw error; return; }
      write(LS.docs, read(LS.docs, []).filter(d => d.id !== id));
    }
  };
  window.Store = Store;
})();
