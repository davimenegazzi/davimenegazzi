(function () {
  const C = window.CONTENT, view = document.getElementById("view");
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmt = (iso) => iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
    .replace(/\./g, "").replace(/ de /g, " ") : "";
  const pad = (n) => String(n).padStart(2, "0");
  const HR = "─".repeat(240);
  document.querySelectorAll(".hr").forEach(e => { e.textContent = HR; });

  $("year").textContent = new Date().getFullYear();
  // links externos abrem em nova aba
  const ext = (href) => /^https?:/.test(href) ? ' target="_blank" rel="noopener"' : "";
  $("foot-links").innerHTML = C.links.map(l => `<a href="${esc(l.href)}"${ext(l.href)}>${esc(l.label.toLowerCase())}</a>`).join(" · ");
  const links = () => C.links.map(l => `<a class="brk" href="${esc(l.href)}"${ext(l.href)}>${esc(l.label.toLowerCase())}</a>`).join("");

  // peças de texto
  const title = (t) => `<h1 class="ttl">${esc(t)}</h1><div class="ul" aria-hidden="true">${"=".repeat(Math.min([...String(t)].length, 64))}</div>`;
  const rule = (t, n) => `<h2 class="rule"><span class="pre" aria-hidden="true">──</span><span>${esc(t)}${n != null ? ` <span class="n">(${pad(n)})</span>` : ""}</span><span class="fill" aria-hidden="true">${HR}</span></h2>`;
  const tree = (items, render, empty) => `<ul class="tree">${items.length
    ? items.map((d, i) => `<li><span class="br" aria-hidden="true">${i === items.length - 1 ? "└── " : "├── "}</span><div class="it">${render(d)}</div></li>`).join("")
    : `<li><span class="br" aria-hidden="true">└── </span><div class="it mut">${esc(empty)}</div></li>`}</ul>`;
  const when = (d) => d.published_at || d.updated_at;
  const fmtFull = (iso) => {
    const t = new Date(iso);
    return fmt(iso) + " às " + t.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  };
  const postItem = (d) => `<span class="date">${fmt(when(d))}</span><a href="#/post/${d.id}">${esc(d.title)}</a>`;

  // projetos: o badge leva para a página do projeto ou para um link externo
  const KIND_LABEL = { noticia: "notícia", artigo: "artigo", projeto: "projeto" };
  const safeLink = Store.cleanLink;
  const projHref = (d) => (d.opens === "link" && safeLink(d.link)) || "#/projeto/" + d.id;
  const projA = (d, cls = "") => {
    const href = projHref(d), out = !href.startsWith("#");
    return `<a${cls ? ` class="${cls}"` : ""} href="${esc(href)}"${ext(href)}>${esc(d.title)}${out ? ' <span class="out" aria-label="(link externo)">↗</span>' : ""}</a>`;
  };
  const tagsOf = (d) => String(d.tags || "").split(",").map(t => t.trim()).filter(Boolean);
  const byOrder = (a, b) => (b.pinned - a.pinned) || ((a.ordem || 0) - (b.ordem || 0)) || String(when(b)).localeCompare(String(when(a)));
  const projCard = (d) => `${projA(d)}${tagsOf(d).length ? `<span class="mut">${esc(tagsOf(d).join(" · ").toLowerCase())}</span>` : ""}${d.summary ? `<span class="desc">${esc(d.summary)}</span>` : ""}`;
  const projBadges = (items) => items.length ? `<div class="badges">${items.map(d => projA(d, "badge")).join("")}</div>` : "";

  const pages = {
    async home() {
      const [news, arts, projs] = await Promise.all([Store.list("noticia"), Store.list("artigo"), Store.list("projeto")]);
      const pinned = projs.filter(d => d.pinned).sort(byOrder);
      const cards = pinned.filter(d => d.look === "cartao");
      return `
      <h1 class="name">${esc(C.name)}</h1>
      <p class="who">${esc(C.title)}</p>
      ${C.photo ? `<p><img class="photo" src="${esc(C.photo)}" alt="${esc(C.name)}"></p>` : ""}
      ${C.bio.map(p => `<p>${esc(p)}</p>`).join("")}
      <div class="links">${links()}</div>
      ${projs.length ? `${rule("projetos", projs.length)}
        ${projBadges(pinned.filter(d => d.look !== "cartao"))}
        ${cards.length ? tree(cards, projCard, "") : ""}
        ${pinned.length ? "" : `<p class="mut">nenhum projeto fixado</p>`}
        ${projs.length > pinned.length ? `<a class="more" href="#/projetos">-> ver todos</a>` : ""}` : ""}
      ${rule("notícias", news.length)}
      ${tree(news.slice(0, 5), postItem, "nenhuma notícia publicada ainda")}
      ${news.length > 5 ? `<a class="more" href="#/noticias">-> ver todas</a>` : ""}
      ${rule("artigos", arts.length)}
      ${tree(arts.slice(0, 5), postItem, "nenhum artigo publicado ainda")}
      ${arts.length > 5 ? `<a class="more" href="#/artigos">-> ver todos</a>` : ""}`;
    },
    async sobre() {
      return `${title("sobre mim")}${C.about.map(p => `<p>${esc(p)}</p>`).join("")}<div class="links">${links()}</div>`;
    },
    async projetos() {
      const docs = (await Store.list("projeto")).sort(byOrder);
      return `${title("projetos")}${tree(docs, projCard, "nenhum projeto publicado ainda")}`;
    },
    async projeto(id) { return pages.post(id); },
    async noticias() { return listPage("noticia", "notícias", "nenhuma notícia publicada ainda"); },
    async artigos() { return listPage("artigo", "artigos", "nenhum artigo publicado ainda"); },
    async curriculo() {
      const job = (x) => `<span class="date">${esc(x.when)}</span><span><b>${esc(x.role)}</b> @ ${esc(x.org)}${x.place ? ", " + esc(x.place) : ""}</span>${x.desc ? `<span class="desc">${esc(x.desc)}</span>` : ""}`;
      return `${title("currículo")}
        ${C.cv.linkedin || C.cv.pdf ? `<div class="links">${C.cv.linkedin ? `<a class="brk" href="${esc(C.cv.linkedin)}" target="_blank" rel="noopener">ver no linkedin</a>` : ""}${C.cv.pdf ? `<a class="brk" href="${esc(C.cv.pdf)}" target="_blank" rel="noopener">baixar pdf</a>` : ""}</div>` : ""}
        ${rule("experiência")}${tree(C.cv.experience, job, "")}
        ${rule("formação")}${tree(C.cv.education, job, "")}
        ${rule("habilidades")}<div class="tags">${C.cv.skills.map(s => `<span class="tag">${esc(s.toLowerCase())}</span>`).join("")}</div>`;
    },
    async post(id) {
      const d = await Store.get(id);
      if (!d || (!d.published && !Store.isAuthed())) return `${title("404")}<p class="mut">post não encontrado.</p><p><a href="#/">-> voltar ao início</a></p>`;
      return `<article class="post">${title(d.title)}
        <div class="meta">
          <span class="tag">${KIND_LABEL[d.kind] || "artigo"}</span>
          por <span class="author">${esc(C.name)}</span> ·
          ${d.published_at
            ? `publicado em <time datetime="${esc(d.published_at)}">${fmtFull(d.published_at)}</time>`
            : `rascunho, editado em <time datetime="${esc(d.updated_at)}">${fmtFull(d.updated_at)}</time>`}
          ${d.published_at && new Date(d.updated_at) - new Date(d.published_at) > 3600e3
            ? ` · <span class="edited">editado em <time datetime="${esc(d.updated_at)}">${fmtFull(d.updated_at)}</time></span>` : ""}
        </div>
        ${d.kind === "projeto" && (d.summary || tagsOf(d).length || safeLink(d.link)) ? `<div class="proj">
          ${d.summary ? `<p>${esc(d.summary)}</p>` : ""}
          ${tagsOf(d).length ? `<div class="tags">${tagsOf(d).map(t => `<span class="tag">${esc(t.toLowerCase())}</span>`).join("")}</div>` : ""}
          ${safeLink(d.link) ? `<div class="links"><a class="brk" href="${esc(safeLink(d.link))}"${ext(safeLink(d.link))}>abrir projeto ↗</a></div>` : ""}
        </div>` : ""}
        <div class="body">${DOMPurify.sanitize(d.html)}</div>
        ${Store.isAuthed() ? `<p style="margin-top:2em"><a href="/editor/?id=${d.id}">-> editar</a></p>` : ""}</article>`;
    },
    async login() {
      if (Store.isAuthed()) { location.href = "/editor/"; return ""; }
      return `<form id="lf"><fieldset class="box"><legend>entrar</legend>
        ${Store.cloud ? "" : `<p class="mut" style="font-size:12px">modo local: na primeira vez, a senha digitada vira a sua senha neste navegador.</p>`}
        <label for="lf-pw">senha:</label><input id="lf-pw" type="password" name="pw" required autocomplete="current-password">
        <p class="err" id="le"></p><button class="primary">entrar</button></fieldset></form>`;
    },
    async editor() {
      // o editor agora é uma página própria
      location.href = "/editor/"; return "";
    }
  };

  async function listPage(kind, label, empty) {
    const docs = await Store.list(kind);
    return `${title(label)}${tree(docs, postItem, empty)}`;
  }

  async function route() {
    // aceita "#/login" e também "#login" (o link da prévia só repassa a segunda forma)
    const [name = "", arg] = location.hash.replace(/^#\/?/, "").split("/");
    const key = pages[name] ? name : "home";
    const navKey = key === "projeto" ? "projetos" : key;
    document.querySelectorAll("#nav a").forEach(a => a.classList.toggle("active", a.getAttribute("href") === (navKey === "home" ? "#/" : "#/" + navKey)));
    try {
      view.innerHTML = await pages[key](arg);
    } catch (e) { view.innerHTML = `${title("erro")}<p class="err">${esc(e.message || e)}</p>`; }
    const lf = $("lf");
    if (lf) lf.onsubmit = async (ev) => {
      ev.preventDefault();
      const f = new FormData(lf);
      try { await Store.login(f.get("pw")); location.href = "/editor/"; }
      catch (e) { $("le").textContent = e.message; }
    };
    scrollTo(0, 0);
  }

  function authUI(on) {
    $("nav-editor").hidden = !on; $("nav-logout").hidden = !on;
  }
  $("nav-logout").onclick = async (e) => { e.preventDefault(); await Store.logout(); location.hash = "#/"; };
  Store.onAuth(authUI);
  window.addEventListener("hashchange", route);
  Store.init().then(route);
})();
