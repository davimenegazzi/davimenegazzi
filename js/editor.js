// Editor de texto em blocos: barra de ferramentas, menu "/" e salvamento automático.
// Não usa prompt()/confirm(): link, imagem e exclusão são pedidos dentro da própria página.
(function () {
  const fmtBlock = (tag) => document.execCommand("formatBlock", false, tag);
  const clean = (html) => DOMPurify.sanitize(html, { ADD_ATTR: ["target"] });
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const EMPTY = () => ({ id: null, kind: "artigo", title: "", html: "", published: false });

  window.Editor = {
    async mount(root, startId) {
      let cur = EMPTY();
      let dirty = false, timer = null, slash = null, askCb = null, savedRange = null, delArmed = null;

      root.innerHTML = `
      <div class="ed-shell">
        <aside class="ed-side">
          <button class="primary ed-new" id="ed-new">+ novo documento</button>
          <div id="ed-list"></div>
        </aside>
        <section class="ed-main">
          <div class="ed-bar" id="ed-bar">
            <button class="t" data-c="bold" title="Negrito">b</button><button class="t" data-c="italic" title="Itálico">i</button>
            <button class="t" data-c="underline" title="Sublinhado">u</button><button class="t" data-c="strikeThrough" title="Riscado">s</button>
            <button class="t" data-b="H1">h1</button><button class="t" data-b="H2">h2</button><button class="t" data-b="H3">h3</button>
            <button class="t" data-c="insertUnorderedList">- lista</button><button class="t" data-c="insertOrderedList">1. lista</button>
            <button class="t" data-b="BLOCKQUOTE">citação</button><button class="t" data-b="PRE">código</button>
            <button class="t" data-a="link">link</button><button class="t" data-a="img">imagem</button>
            <button class="t" data-c="removeFormat">limpar</button>
            <button class="t" data-c="undo">desfazer</button><button class="t" data-c="redo">refazer</button>
          </div>
          <form class="ed-ask" id="ed-ask" hidden>
            <label for="ed-ask-i" id="ed-ask-l">url:</label>
            <input id="ed-ask-i" type="url" placeholder="https://">
            <button class="primary">ok</button><button type="button" id="ed-ask-x">cancelar</button>
          </form>
          <div class="ed-meta">
            <select id="ed-kind" aria-label="Tipo"><option value="artigo">artigo</option><option value="noticia">notícia</option></select>
            <button class="plain" id="ed-pub" type="button" aria-pressed="false"></button>
            <button class="primary" id="ed-save">salvar</button>
            <button id="ed-del">excluir</button>
            <span class="status" id="ed-status"></span>
          </div>
          <input class="ed-title" id="ed-title" placeholder="título" aria-label="Título">
          <div class="ed-body" id="ed-body" contenteditable="true" spellcheck="true"></div>
        </section>
      </div>`;

      const $ = (id) => root.querySelector("#" + id);
      const body = $("ed-body"), title = $("ed-title"), status = $("ed-status"), pub = $("ed-pub"), del = $("ed-del");
      const setStatus = (t) => { status.textContent = t; };
      const setPubText = (on) => { pub.setAttribute("aria-pressed", on ? "true" : "false"); pub.textContent = (on ? "[x]" : "[ ]") + " publicado"; };
      const isPub = () => pub.getAttribute("aria-pressed") === "true";

      // pedido inline de URL (link e imagem)
      function ask(label, cb) {
        const s = getSelection();
        savedRange = s.rangeCount && body.contains(s.anchorNode) ? s.getRangeAt(0).cloneRange() : null;
        $("ed-ask-l").textContent = label; $("ed-ask-i").value = "";
        $("ed-ask").hidden = false; $("ed-ask-i").focus(); askCb = cb;
      }
      function askDone(ok) {
        const v = $("ed-ask-i").value.trim();
        $("ed-ask").hidden = true; body.focus();
        if (savedRange) { const s = getSelection(); s.removeAllRanges(); s.addRange(savedRange); }
        if (ok && v && askCb) { askCb(v); touch(); }
        askCb = null; savedRange = null;
      }
      $("ed-ask").onsubmit = (e) => { e.preventDefault(); askDone(true); };
      $("ed-ask-x").onclick = () => askDone(false);
      $("ed-ask-i").addEventListener("keydown", e => { if (e.key === "Escape") askDone(false); });
      const askLink = () => ask("link:", u => document.execCommand("createLink", false, u));
      const askImg = () => ask("imagem:", u => document.execCommand("insertImage", false, u));

      const BLOCKS = [
        { label: "texto", run: () => fmtBlock("P") },
        { label: "título 1", run: () => fmtBlock("H1") },
        { label: "título 2", run: () => fmtBlock("H2") },
        { label: "título 3", run: () => fmtBlock("H3") },
        { label: "lista com marcadores", run: () => document.execCommand("insertUnorderedList") },
        { label: "lista numerada", run: () => document.execCommand("insertOrderedList") },
        { label: "citação", run: () => fmtBlock("BLOCKQUOTE") },
        { label: "código", run: () => fmtBlock("PRE") },
        { label: "divisor", run: () => document.execCommand("insertHorizontalRule") },
        { label: "imagem (url)", run: askImg }
      ];

      async function refreshList() {
        const docs = await Store.list(null, { drafts: true });
        $("ed-list").innerHTML = docs.map((d, i) =>
          `<button class="doc ${d.id === cur.id ? "on" : ""}" data-id="${d.id}"><span class="br">${i === docs.length - 1 ? "└── " : "├── "}</span><span>${esc(d.title || "sem título")}<br><span class="mut">${d.kind === "noticia" ? "notícia" : "artigo"}${d.published ? "" : " · rascunho"}</span></span></button>`
        ).join("") || '<p class="mut" style="font-size:13px">nenhum documento ainda.</p>';
      }
      function disarmDel() { clearTimeout(delArmed); delArmed = null; del.textContent = "excluir"; }
      function load(d) {
        cur = d;
        title.value = d.title || ""; body.innerHTML = clean(d.html || "");
        $("ed-kind").value = d.kind; setPubText(!!d.published);
        dirty = false; setStatus(d.id ? "salvo" : "novo");
        disarmDel(); refreshList();
      }
      async function save() {
        clearTimeout(timer);
        cur = await Store.save({
          id: cur.id || undefined, kind: $("ed-kind").value, title: title.value.trim() || "sem título",
          html: clean(body.innerHTML), published: isPub()
        });
        dirty = false; setStatus("salvo às " + new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
        refreshList();
      }
      const touch = () => { dirty = true; setStatus("alterações não salvas"); clearTimeout(timer); timer = setTimeout(() => save().catch(e => setStatus("erro: " + e.message)), 1500); };

      // barra de ferramentas
      $("ed-bar").addEventListener("mousedown", e => e.preventDefault());
      $("ed-bar").addEventListener("click", e => {
        const b = e.target.closest("button"); if (!b) return;
        body.focus();
        if (b.dataset.c) document.execCommand(b.dataset.c);
        else if (b.dataset.b) fmtBlock(b.dataset.b);
        else if (b.dataset.a === "link") return askLink();
        else if (b.dataset.a === "img") return askImg();
        touch();
      });
      [title, body].forEach(el => el.addEventListener("input", touch));
      $("ed-kind").addEventListener("change", touch);
      pub.onclick = () => { setPubText(!isPub()); touch(); };

      // menu "/"
      function closeSlash() { if (slash) { slash.remove(); slash = null; } }
      body.addEventListener("keyup", e => {
        if (e.key === "Escape") return closeSlash();
        const sel = getSelection(); if (!sel.rangeCount) return;
        const n = sel.anchorNode, t = n && n.nodeType === 3 ? n.textContent.slice(0, sel.anchorOffset) : "";
        const m = /(^|\s)\/([\wà-ú]*)$/i.exec(t);
        if (!m) return closeSlash();
        const q = m[2].toLowerCase();
        const items = BLOCKS.filter(b => b.label.includes(q));
        if (!items.length) return closeSlash();
        closeSlash();
        slash = document.createElement("div"); slash.className = "slash";
        const r = sel.getRangeAt(0).getBoundingClientRect();
        slash.style.left = Math.min(r.left + scrollX, scrollX + innerWidth - 240) + "px"; slash.style.top = r.bottom + scrollY + 6 + "px";
        slash.innerHTML = items.map(b => `<button class="plain" data-i="${BLOCKS.indexOf(b)}">${b.label}</button>`).join("");
        slash.addEventListener("mousedown", ev => {
          ev.preventDefault();
          const btn = ev.target.closest("button"); if (!btn) return;
          // remove o "/consulta"
          const s = getSelection(), node = s.anchorNode;
          if (node && node.nodeType === 3) {
            const off = s.anchorOffset, start = node.textContent.slice(0, off).lastIndexOf("/");
            node.textContent = node.textContent.slice(0, start) + node.textContent.slice(off);
            const rg = document.createRange(); rg.setStart(node, start); rg.collapse(true); s.removeAllRanges(); s.addRange(rg);
          }
          BLOCKS[+btn.dataset.i].run(); closeSlash(); touch();
        });
        document.body.appendChild(slash);
      });
      body.addEventListener("blur", () => setTimeout(closeSlash, 150));

      $("ed-save").onclick = () => save().catch(e => setStatus("erro: " + e.message));
      $("ed-new").onclick = () => load(EMPTY());
      del.onclick = async () => {
        if (!cur.id) return;
        if (!delArmed) { del.textContent = "confirmar exclusão"; delArmed = setTimeout(disarmDel, 4000); return; }
        disarmDel();
        await Store.remove(cur.id); load(EMPTY());
      };
      $("ed-list").onclick = async (e) => {
        const b = e.target.closest(".doc"); if (!b) return;
        if (dirty) await save();
        load(await Store.get(b.dataset.id));
      };
      window.onbeforeunload = () => (dirty ? "Há alterações não salvas." : undefined);
      root.addEventListener("editor:unmount", () => { clearTimeout(timer); disarmDel(); closeSlash(); window.onbeforeunload = null; }, { once: true });

      await refreshList();
      load(startId ? (await Store.get(startId)) || EMPTY() : cur);
    }
  };
})();
