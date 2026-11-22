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
  $("foot-links").innerHTML = C.links.map(l => `<a href="${esc(l.href)}">${esc(l.label.toLowerCase())}</a>`).join(" · ");
  const links = () => C.links.map(l => `<a class="brk" href="${esc(l.href)}">${esc(l.label.toLowerCase())}</a>`).join("");

  // arte ASCII: ajusta o tamanho da fonte para a arte caber na largura disponível
  let ratio = 0.6;
  function measure() {
    const s = document.createElement("span");
    s.style.cssText = "position:absolute;visibility:hidden;white-space:pre;font:400 100px var(--mono)";
    s.textContent = "0".repeat(10);
    document.body.appendChild(s);
    ratio = s.getBoundingClientRect().width / 1000 || 0.6;
    s.remove();
  }
  const cols = (t) => Math.max(...t.split("\n").map(l => l.length));
  function fitArt() {
    document.querySelectorAll(".art pre").forEach(pre => {
      if (!pre.offsetParent) return;
      const w = pre.parentElement.clientWidth;
      pre.style.fontSize = Math.min(14, w / (+pre.dataset.cols * ratio) - 0.02) + "px";
    });
  }
  measure();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { measure(); fitArt(); });
  window.addEventListener("resize", fitArt);
  const art = () => {
    const A = window.ART; if (!A) return "";
    return `<figure class="art" aria-label="Arte em ASCII de A criação de Adão, de Michelangelo">
      <pre class="wide" data-cols="${cols(A.wide)}" aria-hidden="true">${esc(A.wide)}</pre>
      <pre class="narrow" data-cols="${cols(A.narrow)}" aria-hidden="true">${esc(A.narrow)}</pre>
      <figcaption>michelangelo, a criação de adão, c. 1512</figcaption></figure>`;
  };

  // peças de texto
  const title = (t) => `<h1 class="ttl">${esc(t)}</h1><div class="ul" aria-hidden="true">${"=".repeat(Math.min([...String(t)].length, 64))}</div>`;
  const rule = (t, n) => `<h2 class="rule"><span class="pre" aria-hidden="true">──</span><span>${esc(t)}${n != null ? ` <span class="n">(${pad(n)})</span>` : ""}</span><span class="fill" aria-hidden="true">${HR}</span></h2>`;
  const tree = (items, render, empty) => `<ul class="tree">${items.length
    ? items.map((d, i) => `<li><span class="br" aria-hidden="true">${i === items.length - 1 ? "└── " : "├── "}</span><div class="it">${render(d)}</div></li>`).join("")
    : `<li><span class="br" aria-hidden="true">└── </span><div class="it mut">${esc(empty)}</div></li>`}</ul>`;
  const postItem = (d) => `<span class="date">${fmt(d.updated_at)}</span><a href="#/post/${d.id}">${esc(d.title)}</a>`;

  const pages = {
    async home() {
      const [news, arts] = await Promise.all([Store.list("noticia"), Store.list("artigo")]);
      return `
      ${art()}
      <h1 class="name">${esc(C.name)}</h1>
      <p class="who">${esc(C.title)}</p>
      ${C.photo ? `<p><img class="photo" src="${esc(C.photo)}" alt="${esc(C.name)}"></p>` : ""}
      ${C.bio.map(p => `<p>${esc(p)}</p>`).join("")}
      <div class="links">${links()}</div>
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
    async noticias() { return listPage("noticia", "notícias", "nenhuma notícia publicada ainda"); },
    async artigos() { return listPage("artigo", "artigos", "nenhum artigo publicado ainda"); },
    async curriculo() {
      const job = (x) => `<span class="date">${esc(x.when)}</span><span><b>${esc(x.role)}</b> @ ${esc(x.org)}${x.place ? ", " + esc(x.place) : ""}</span>${x.desc ? `<span class="desc">${esc(x.desc)}</span>` : ""}`;
      return `${title("currículo")}
        ${C.cv.pdf ? `<p><a class="brk" href="${esc(C.cv.pdf)}" target="_blank" rel="noopener">baixar pdf</a></p>` : ""}
        ${rule("experiência")}${tree(C.cv.experience, job, "")}
        ${rule("formação")}${tree(C.cv.education, job, "")}
        ${rule("habilidades")}<div class="tags">${C.cv.skills.map(s => `<span class="tag">${esc(s.toLowerCase())}</span>`).join("")}</div>`;
    },
    async post(id) {
      const d = await Store.get(id);
      if (!d || (!d.published && !Store.isAuthed())) return `${title("404")}<p class="mut">post não encontrado.</p><p><a href="#/">-> voltar ao início</a></p>`;
      return `<article class="post">${title(d.title)}
        <div class="meta"><span class="tag">${d.kind === "noticia" ? "notícia" : "artigo"}</span> ${fmt(d.updated_at)}${d.published ? "" : " · rascunho"}</div>
        <div class="body">${DOMPurify.sanitize(d.html)}</div>
        ${Store.isAuthed() ? `<p style="margin-top:2em"><a href="#/editor/${d.id}">-> editar</a></p>` : ""}</article>`;
    },
    async login() {
      if (Store.isAuthed()) { location.hash = "#/editor"; return ""; }
      return `<form id="lf"><fieldset class="box"><legend>entrar</legend>
        ${Store.cloud ? `<label for="lf-email">e-mail:</label><input id="lf-email" type="email" name="email" required autocomplete="username">`
          : `<p class="mut" style="font-size:12px">modo local: na primeira vez, a senha digitada vira a sua senha neste navegador.</p>`}
        <label for="lf-pw">senha:</label><input id="lf-pw" type="password" name="pw" required autocomplete="current-password">
        <p class="err" id="le"></p><button class="primary">entrar</button></fieldset></form>`;
    },
    async editor() {
      if (!Store.isAuthed()) { location.hash = "#/login"; return ""; }
      return `<div id="ed-root"></div>`;
    }
  };

  async function listPage(kind, label, empty) {
    const docs = await Store.list(kind);
    return `${title(label)}${tree(docs, postItem, empty)}`;
  }

  async function route() {
    document.getElementById("ed-root")?.dispatchEvent(new Event("editor:unmount"));
    const [, name = "", arg] = location.hash.replace(/^#/, "").split("/");
    const key = pages[name] ? name : "home";
    document.querySelectorAll("#nav a").forEach(a => a.classList.toggle("active", a.getAttribute("href") === (key === "home" ? "#/" : "#/" + key)));
    $("wrap").classList.toggle("wide", key === "editor");
    try {
      view.innerHTML = await pages[key](arg);
    } catch (e) { view.innerHTML = `${title("erro")}<p class="err">${esc(e.message || e)}</p>`; }
    fitArt();
    if (key === "editor" && Store.isAuthed()) Editor.mount($("ed-root"), arg);
    const lf = $("lf");
    if (lf) lf.onsubmit = async (ev) => {
      ev.preventDefault();
      const f = new FormData(lf);
      try { await Store.login(f.get("email"), f.get("pw")); location.hash = "#/editor"; }
      catch (e) { $("le").textContent = e.message; }
    };
    scrollTo(0, 0);
  }

  function authUI(on) {
    $("nav-editor").hidden = !on; $("nav-logout").hidden = !on; $("nav-login").hidden = on;
  }
  $("nav-logout").onclick = async (e) => { e.preventDefault(); await Store.logout(); location.hash = "#/"; };
  Store.onAuth(authUI);
  window.addEventListener("hashchange", route);
  Store.init().then(route);
})();
