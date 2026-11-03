(function () {
  const C = window.CONTENT, view = document.getElementById("view");
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmt = (iso) => iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }) : "";
  const $ = (id) => document.getElementById(id);

  // tema
  const root = document.documentElement;
  const THEMES = [["white", "BRANCO"], ["black", "PRETO"], ["paper", "BEGE"]];
  const setTheme = (t) => {
    if (!THEMES.some(x => x[0] === t)) t = "white";
    root.dataset.theme = t;
    $("theme").textContent = "TEMA: " + THEMES.find(x => x[0] === t)[1];
    try { localStorage.setItem("dm.theme", t); } catch {}
  };
  let saved = "white";
  try { saved = localStorage.getItem("dm.theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "black" : "white"); } catch {}
  setTheme(saved);
  $("theme").onclick = () => {
    const i = THEMES.findIndex(x => x[0] === root.dataset.theme);
    setTheme(THEMES[(i + 1) % THEMES.length][0]);
  };

  // barra lateral (visão geral)
  $("side-body").innerHTML = `<h4>Visão<br>geral</h4>
    <span class="lbl">Alvo</span><p>${esc(C.bio[0] || "")}</p>
    <span class="lbl">Perfil</span>
    <div class="row"><b>BR</b><div>${esc(C.name)}<br><span>${esc(C.title)}</span></div></div>
    <span class="lbl">Contato</span>
    ${C.links.map(l => `<div class="row"><b>→</b><a href="${esc(l.href)}">${esc(l.label)}</a></div>`).join("")}`;
  $("year").textContent = new Date().getFullYear();
  $("foot-links").innerHTML = C.links.map(l => `<a href="${esc(l.href)}">${esc(l.label)}</a>`).join("");

  const links = () => C.links.map(l => `<a href="${esc(l.href)}">${esc(l.label)}</a>`).join("");
  const initials = C.name.split(" ").map(w => w[0]).slice(0, 2).join("");

  const pages = {
    async home() {
      const [news, arts] = await Promise.all([Store.list("noticia"), Store.list("artigo")]);
      const item = (d) => `<li><span class="date">${fmt(d.updated_at)}</span><a href="#/post/${d.id}">${esc(d.title)}</a></li>`;
      return `
      <section class="hero">
        <div class="txt"><span class="kicker">Tópico</span><h1>${esc(C.name)}</h1><div class="mut">${esc(C.title)}</div>
        ${C.bio.map(p => `<p class="mut" style="max-width:560px">${esc(p)}</p>`).join("")}<div class="links">${links()}</div></div>
        ${C.photo ? `<img class="photo" src="${esc(C.photo)}" alt="${esc(C.name)}">` : `<div class="avatar">${esc(initials)}</div>`}
      </section>
      <div class="stats">
        <div class="stat"><span class="lbl">Artigos</span><div class="num">${String(arts.length).padStart(2, "0")}</div></div>
        <div class="stat"><span class="lbl">Notícias</span><div class="num">${String(news.length).padStart(2, "0")}</div></div>
        <div class="stat"><span class="lbl">Desde</span><div class="num">${new Date().getFullYear()}</div></div>
      </div>
      <h2 id="noticias">Notícias</h2>
      <ul class="list">${news.slice(0, 5).map(item).join("") || '<li class="mut">Sem notícias ainda.</li>'}</ul>
      <p><a href="#/noticias">Ver todas →</a></p>
      <h2>Artigos recentes</h2>
      <ul class="list">${arts.slice(0, 5).map(item).join("") || '<li class="mut">Sem artigos ainda.</li>'}</ul>
      <p><a href="#/artigos">Ver todos →</a></p>`;
    },
    async sobre() {
      return `<span class="kicker">Perfil</span><h1>Sobre mim</h1>${C.about.map(p => `<p class="lead">${esc(p)}</p>`).join("")}<div class="links">${links()}</div>`;
    },
    async noticias() { return listPage("noticia", "Notícias"); },
    async artigos() { return listPage("artigo", "Artigos"); },
    async curriculo() {
      const sec = (t, arr) => `<h2>${t}</h2>` + arr.map(x => `<div class="tl-item"><span class="mut">${esc(x.when)}</span><br>
        <b>${esc(x.role)}</b> — ${esc(x.org)}${x.place ? ", " + esc(x.place) : ""}${x.desc ? `<br>${esc(x.desc)}` : ""}</div>`).join("");
      return `<span class="kicker">Registro</span><h1>Currículo</h1>
        ${C.cv.pdf ? `<p><a class="btn" href="${esc(C.cv.pdf)}" target="_blank" rel="noopener">Baixar PDF</a></p>` : ""}
        ${sec("Experiência", C.cv.experience)}${sec("Formação", C.cv.education)}
        <h2>Habilidades</h2><p>${C.cv.skills.map(s => `<span class="tag">${esc(s)}</span>`).join(" ")}</p>`;
    },
    async post(id) {
      const d = await Store.get(id);
      if (!d || (!d.published && !Store.isAuthed())) return "<h1>Não encontrado</h1>";
      return `<article class="post"><span class="tag">${d.kind === "noticia" ? "Notícia" : "Artigo"}</span>
        <h1>${esc(d.title)}</h1><div class="mut">${fmt(d.updated_at)}${d.published ? "" : " · rascunho"}</div>
        <div class="body">${DOMPurify.sanitize(d.html)}</div>
        ${Store.isAuthed() ? `<p><a href="#/editor/${d.id}">Editar</a></p>` : ""}</article>`;
    },
    async login() {
      if (Store.isAuthed()) { location.hash = "#/editor"; return ""; }
      return `<form class="card" id="lf"><h2 style="margin-top:0;border:0">Entrar</h2>
        ${Store.cloud ? `<label>E-mail</label><input type="email" name="email" required autocomplete="username">`
          : `<p class="mut">Modo local (sem Supabase configurado): na primeira vez, a senha digitada vira sua senha neste navegador.</p>`}
        <label>Senha</label><input type="password" name="pw" required autocomplete="current-password">
        <p class="err" id="le"></p><button class="primary" style="width:100%">Entrar</button></form>`;
    },
    async editor(id) {
      if (!Store.isAuthed()) { location.hash = "#/login"; return ""; }
      return `<div id="ed-root"></div>`;
    }
  };

  async function listPage(kind, label) {
    const docs = await Store.list(kind);
    return `<span class="kicker">Seção</span><h1>${label}</h1><ul class="list">${docs.map(d =>
      `<li><span class="date">${fmt(d.updated_at)}</span><h3><a href="#/post/${d.id}">${esc(d.title)}</a></h3></li>`).join("")
      || `<li class="mut">Nada publicado ainda.</li>`}</ul>`;
  }

  async function route() {
    document.getElementById("ed-root")?.dispatchEvent(new Event("editor:unmount"));
    const [, name = "home", arg] = location.hash.replace(/^#/, "").split("/");
    const key = pages[name] ? name : "home";
    document.querySelectorAll("#nav a").forEach(a => a.classList.toggle("active", a.getAttribute("href") === "#/" + key));
    view.className = key === "editor" ? "page ed" : "page";
    document.getElementById("side").hidden = key === "editor";
    document.querySelector(".shell").style.gridTemplateColumns = key === "editor" ? "1fr" : "";
    try {
      view.innerHTML = await pages[key](arg);
    } catch (e) { view.innerHTML = `<h1>Erro</h1><p class="err">${esc(e.message || e)}</p>`; }
    if (key === "editor" && Store.isAuthed()) Editor.mount($("ed-root"), arg);
    const lf = $("lf");
    if (lf) lf.onsubmit = async (ev) => {
      ev.preventDefault();
      const f = new FormData(lf);
      try { await Store.login(f.get("email"), f.get("pw")); location.hash = "#/editor"; }
      catch (e) { $("le").textContent = e.message; }
    };
    if (!location.hash.includes("#/post")) scrollTo(0, 0);
  }

  function authUI(on) {
    $("nav-editor").hidden = !on; $("nav-logout").hidden = !on; $("nav-login").hidden = on;
  }
  $("nav-logout").onclick = async (e) => { e.preventDefault(); await Store.logout(); location.hash = "#/"; };
  Store.onAuth(authUI);
  window.addEventListener("hashchange", route);
  Store.init().then(route);
})();
