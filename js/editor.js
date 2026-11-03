// Editor de texto em blocos (estilo Docs): barra de ferramentas, menu "/" e salvamento automático.
(function () {
  const BLOCKS = [
    { label: "Texto", run: () => fmtBlock("P") },
    { label: "Título 1", run: () => fmtBlock("H1") },
    { label: "Título 2", run: () => fmtBlock("H2") },
    { label: "Título 3", run: () => fmtBlock("H3") },
    { label: "Lista com marcadores", run: () => document.execCommand("insertUnorderedList") },
    { label: "Lista numerada", run: () => document.execCommand("insertOrderedList") },
    { label: "Citação", run: () => fmtBlock("BLOCKQUOTE") },
    { label: "Código", run: () => fmtBlock("PRE") },
    { label: "Divisor", run: () => document.execCommand("insertHorizontalRule") },
    { label: "Imagem (URL)", run: () => { const u = prompt("URL da imagem:"); if (u) document.execCommand("insertImage", false, u); } }
  ];
  const fmtBlock = (tag) => document.execCommand("formatBlock", false, tag);
  const clean = (html) => DOMPurify.sanitize(html, { ADD_ATTR: ["target"] });
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  window.Editor = {
    async mount(root, startId) {
      let cur = { id: null, kind: "artigo", title: "", html: "", published: false };
      let dirty = false, timer = null, slash = null;

      root.innerHTML = `
      <div class="ed-shell">
        <aside class="ed-side"><button class="primary" id="ed-new" style="width:100%;margin-bottom:8px">+ Novo documento</button><div id="ed-list"></div></aside>
        <section class="ed-main">
          <div class="ed-bar" id="ed-bar">
            <button data-c="bold"><b>B</b></button><button data-c="italic"><i>I</i></button>
            <button data-c="underline"><u>U</u></button><button data-c="strikeThrough"><s>S</s></button>
            <button data-b="H1">H1</button><button data-b="H2">H2</button><button data-b="H3">H3</button>
            <button data-c="insertUnorderedList">• Lista</button><button data-c="insertOrderedList">1. Lista</button>
            <button data-b="BLOCKQUOTE">❝</button><button data-b="PRE">&lt;/&gt;</button>
            <button data-a="link">Link</button><button data-c="removeFormat">Limpar</button>
            <button data-c="undo">↶</button><button data-c="redo">↷</button>
          </div>
          <div class="ed-meta">
            <select id="ed-kind"><option value="artigo">Artigo</option><option value="noticia">Notícia</option></select>
            <label><input type="checkbox" id="ed-pub"> Publicado</label>
            <button class="primary" id="ed-save">Salvar</button>
            <button id="ed-del">Excluir</button>
            <span class="status" id="ed-status"></span>
          </div>
          <input class="ed-title" id="ed-title" placeholder="Título sem nome">
          <div class="ed-body" id="ed-body" contenteditable="true" spellcheck="true"></div>
        </section>
      </div>`;

      const $ = (id) => root.querySelector("#" + id);
      const body = $("ed-body"), title = $("ed-title"), status = $("ed-status");
      const setStatus = (t) => { status.textContent = t; };

      async function refreshList() {
        const docs = await Store.list(null, { drafts: true });
        $("ed-list").innerHTML = docs.map(d =>
          `<button class="doc ${d.id === cur.id ? "on" : ""}" data-id="${d.id}">${esc(d.title || "Sem título")}<br><span class="mut">${d.kind === "noticia" ? "Notícia" : "Artigo"}${d.published ? "" : " · rascunho"}</span></button>`
        ).join("") || '<p class="mut">Nenhum documento ainda.</p>';
      }
      function load(d) {
        cur = d;
        title.value = d.title || ""; body.innerHTML = clean(d.html || "");
        $("ed-kind").value = d.kind; $("ed-pub").checked = !!d.published;
        dirty = false; setStatus(d.id ? "Salvo" : "Novo");
        refreshList();
      }
      async function save() {
        clearTimeout(timer);
        cur = await Store.save({
          id: cur.id || undefined, kind: $("ed-kind").value, title: title.value.trim() || "Sem título",
          html: clean(body.innerHTML), published: $("ed-pub").checked
        });
        dirty = false; setStatus("Salvo às " + new Date().toLocaleTimeString());
        refreshList();
      }
      const touch = () => { dirty = true; setStatus("Alterações não salvas…"); clearTimeout(timer); timer = setTimeout(() => save().catch(e => setStatus("Erro: " + e.message)), 1500); };

      // barra de ferramentas
      $("ed-bar").addEventListener("mousedown", e => e.preventDefault());
      $("ed-bar").addEventListener("click", e => {
        const b = e.target.closest("button"); if (!b) return;
        body.focus();
        if (b.dataset.c) document.execCommand(b.dataset.c);
        else if (b.dataset.b) fmtBlock(b.dataset.b);
        else if (b.dataset.a === "link") { const u = prompt("URL do link:"); if (u) document.execCommand("createLink", false, u); }
        touch();
      });
      [title, body, $("ed-kind"), $("ed-pub")].forEach(el => el.addEventListener("input", touch));
      $("ed-pub").addEventListener("change", touch);

      // menu "/"
      function closeSlash() { if (slash) { slash.remove(); slash = null; } }
      body.addEventListener("keyup", e => {
        if (e.key === "Escape") return closeSlash();
        const sel = getSelection(); if (!sel.rangeCount) return;
        const n = sel.anchorNode, t = n && n.nodeType === 3 ? n.textContent.slice(0, sel.anchorOffset) : "";
        const m = /(^|\s)\/(\w*)$/.exec(t);
        if (!m) return closeSlash();
        const q = m[2].toLowerCase();
        const items = BLOCKS.filter(b => b.label.toLowerCase().includes(q));
        if (!items.length) return closeSlash();
        closeSlash();
        slash = document.createElement("div"); slash.className = "slash";
        const r = sel.getRangeAt(0).getBoundingClientRect();
        slash.style.left = r.left + scrollX + "px"; slash.style.top = r.bottom + scrollY + 6 + "px";
        slash.innerHTML = items.map((b, i) => `<button data-i="${BLOCKS.indexOf(b)}">${b.label}</button>`).join("");
        slash.addEventListener("mousedown", ev => {
          ev.preventDefault();
          const btn = ev.target.closest("button"); if (!btn) return;
          // remove o "/consulta"
          const s = getSelection(), node = s.anchorNode;
          if (node.nodeType === 3) {
            const off = s.anchorOffset, start = node.textContent.slice(0, off).lastIndexOf("/");
            node.textContent = node.textContent.slice(0, start) + node.textContent.slice(off);
            const rg = document.createRange(); rg.setStart(node, start); rg.collapse(true); s.removeAllRanges(); s.addRange(rg);
          }
          BLOCKS[+btn.dataset.i].run(); closeSlash(); touch();
        });
        document.body.appendChild(slash);
      });
      body.addEventListener("blur", () => setTimeout(closeSlash, 150));

      $("ed-save").onclick = () => save().catch(e => setStatus("Erro: " + e.message));
      $("ed-new").onclick = () => load({ id: null, kind: "artigo", title: "", html: "", published: false });
      $("ed-del").onclick = async () => {
        if (!cur.id) return;
        if (!confirm("Excluir este documento? Isso não pode ser desfeito.")) return;
        await Store.remove(cur.id); load({ id: null, kind: "artigo", title: "", html: "", published: false });
      };
      $("ed-list").onclick = async (e) => {
        const b = e.target.closest(".doc"); if (!b) return;
        if (dirty) await save();
        load(await Store.get(b.dataset.id));
      };
      window.onbeforeunload = () => (dirty ? "Há alterações não salvas." : undefined);
      root.addEventListener("editor:unmount", () => { clearTimeout(timer); closeSlash(); window.onbeforeunload = null; }, { once: true });

      await refreshList();
      load(startId ? await Store.get(startId) : cur);
    }
  };
})();
