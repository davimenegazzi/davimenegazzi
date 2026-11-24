import { useCallback, useEffect, useRef, useState } from "react";
import {
  EditorRoot, EditorContent, EditorCommand, EditorCommandEmpty, EditorCommandList, EditorCommandItem,
  EditorBubble, EditorBubbleItem, handleCommandNavigation, handleImageDrop, handleImagePaste, ImageResizer, useEditor
} from "novel";
import { extensions, suggestionItems } from "./extensions.js";
import { uploadFn } from "./upload.js";

const Store = window.Store;
const KIND = { artigo: "artigo", noticia: "notícia", projeto: "projeto" };
const FILTERS = [["todos", "todos"], ["artigo", "artigos"], ["noticia", "notícias"], ["projeto", "projetos"]];
const key = () => Math.random().toString(36).slice(2);
// campos usados só pelos projetos (badge na página inicial)
const PROJECT = { pinned: false, link: "", opens: "pagina", look: "badge", summary: "", tags: "", ordem: 0 };
const blank = () => ({ _k: key(), id: null, kind: "artigo", title: "", html: "", doc: null, published: false, ...PROJECT });
const sitePath = (d) => "../#/" + (d.kind === "projeto" ? "projeto/" : "post/") + d.id;
const fmt = (iso) => iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
  .replace(/\./g, "").replace(/ de /g, " ") : "";

export default function App() {
  const [phase, setPhase] = useState("loading"); // loading | ready | error
  const [error, setError] = useState("");
  const [docs, setDocs] = useState([]);
  const [cur, setCur] = useState(blank);
  const [edKey, setEdKey] = useState(0);         // remonta o editor ao trocar de texto
  const [status, setStatus] = useState("");
  const [filter, setFilter] = useState("todos");
  const [drawer, setDrawer] = useState(false);   // lista no celular
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem("dm.side") === "0"; } catch { return false; } });
  const toggleSide = useCallback(() => setCollapsed((c) => {
    try { localStorage.setItem("dm.side", c ? "1" : "0"); } catch {}
    return !c;
  }), []);
  const [armed, setArmed] = useState(false);     // confirmação de exclusão
  const [ask, setAsk] = useState(null);          // pedido de link/imagem

  const [localCount, setLocalCount] = useState(0); // textos presos neste navegador
  const [moving, setMoving] = useState(false);
  const curRef = useRef(cur);
  const dirty = useRef(false);
  const timer = useRef(null);
  const chain = useRef(Promise.resolve());
  const editorRef = useRef(null);
  const titleRef = useRef(null);

  const refresh = useCallback(async () => setDocs(await Store.list(null, { drafts: true })), []);

  const setDoc = (d) => { curRef.current = d; setCur(d); };

  // salva o estado atual; as gravações entram numa fila para nunca criar o mesmo texto duas vezes
  const flush = useCallback(() => {
    clearTimeout(timer.current);
    if (!dirty.current) return chain.current;
    dirty.current = false;
    chain.current = chain.current.then(async () => {
      const doc = curRef.current;
      setStatus("salvando…");
      try {
        const row = await Store.save(doc);
        if (curRef.current._k === doc._k && !curRef.current.id) setDoc({ ...curRef.current, id: row.id });
        if (curRef.current._k === doc._k && row.id) history.replaceState(null, "", "?id=" + row.id);
        setStatus(dirty.current ? "editando…" : "salvo");
        await refresh();
      } catch (e) {
        dirty.current = true;
        setStatus("não salvou: " + e.message);
      }
    });
    return chain.current;
  }, [refresh]);

  const change = useCallback((patch) => {
    setDoc({ ...curRef.current, ...patch });
    dirty.current = true;
    setStatus("editando…");
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 1200);
  }, [flush]);

  const open = useCallback(async (id) => {
    await flush();
    const d = await Store.get(id);
    if (!d) { setStatus("esse texto não existe mais"); return; }
    setDoc({ ...PROJECT, ...d, _k: key() });
    setEdKey((k) => k + 1);
    setArmed(false); setAsk(null); setDrawer(false);
    setStatus("salvo");
    history.replaceState(null, "", "?id=" + id);
  }, [flush]);

  const create = useCallback(async () => {
    await flush();
    setDoc(blank());
    setEdKey((k) => k + 1);
    setArmed(false); setAsk(null); setDrawer(false);
    setStatus("");
    history.replaceState(null, "", location.pathname);
    setTimeout(() => titleRef.current?.focus(), 0);
  }, [flush]);

  const remove = async () => {
    if (!armed) { setArmed(true); setTimeout(() => setArmed(false), 4000); return; }
    const id = curRef.current.id;
    dirty.current = false; clearTimeout(timer.current);
    await chain.current;
    if (id) await Store.remove(id);
    await refresh();
    create();
  };

  // envia ao banco os textos escritos antes no modo local deste navegador
  const sendLocal = async () => {
    setMoving(true);
    const done = [];
    try {
      for (const d of Store.localDocs()) {
        await Store.save({
          ...PROJECT, ...d, id: null,
          kind: KIND[d.kind] ? d.kind : "artigo", title: d.title || "", html: d.html || "", doc: d.doc ?? null, published: !!d.published
        });
        done.push(d.id);
      }
      setStatus(done.length + (done.length === 1 ? " texto enviado ao banco" : " textos enviados ao banco"));
    } catch (e) {
      setStatus("parou no meio: " + e.message);
    } finally {
      Store.archiveLocal(done);
      setLocalCount(Store.localDocs().length);
      setMoving(false);
      await refresh();
    }
  };

  const logout = async () => { await flush(); await Store.logout(); location.href = "../"; };

  // carga inicial e proteção da página
  useEffect(() => {
    (async () => {
      await Store.init();
      if (Store.cloud && !Store.isAuthed()) { location.replace("../login/"); return; }
      if (Store.cloud) setLocalCount(Store.localDocs().length);
      const list = await Store.list(null, { drafts: true });
      setDocs(list);
      // abre o texto pedido no link ou o mais recente
      const id = new URLSearchParams(location.search).get("id") || (list[0] && list[0].id);
      if (id) await open(id);
      setPhase("ready");
    })().catch((e) => { setError(e.message); setPhase("error"); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ctrl/cmd+s salva na hora; fechar a aba com algo pendente avisa
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() === "s") { e.preventDefault(); flush(); }
      if (e.key === "\\") { e.preventDefault(); toggleSide(); }
    };
    const onLeave = (e) => { if (dirty.current) { flush(); e.preventDefault(); e.returnValue = ""; } };
    const onAsk = (e) => setAsk({ kind: e.detail.kind, value: e.detail.value || "" });
    const onNotice = (e) => setStatus(e.detail);
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onLeave);
    window.addEventListener("editor:ask", onAsk);
    window.addEventListener("editor:notice", onNotice);
    return () => {
      window.removeEventListener("editor:notice", onNotice);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onLeave);
      window.removeEventListener("editor:ask", onAsk);
    };
  }, [flush, toggleSide]);

  // título cresce com o texto
  useEffect(() => {
    const t = titleRef.current; if (!t) return;
    t.style.height = "auto"; t.style.height = t.scrollHeight + "px";
  }, [cur.title, phase]);

  const submitAsk = (e) => {
    e.preventDefault();
    const ed = editorRef.current, v = ask.value.trim();
    if (ed) {
      if (ask.kind === "link") {
        if (v) ed.chain().focus().extendMarkRange("link").setLink({ href: /^(https?:|mailto:|\/|#)/.test(v) ? v : "https://" + v }).run();
        else ed.chain().focus().extendMarkRange("link").unsetLink().run();
      } else if (v) {
        ed.chain().focus().setImage({ src: v }).run();
      }
    }
    setAsk(null);
  };

  if (phase === "loading") return <div className="boot">carregando…</div>;
  if (phase === "error") return <div className="boot err">não foi possível abrir o editor: {error}</div>;

  const list = docs.filter((d) => filter === "todos" || d.kind === filter);

  return (
    <div className={"app" + (collapsed ? " collapsed" : "")}>
      <div className={"scrim" + (drawer ? " show" : "")} onClick={() => setDrawer(false)} />

      <aside className={"side" + (drawer ? " open" : "")} aria-label="Textos">
        <div className="rail">
          <button className="rail-btn" onClick={toggleSide} title="Mostrar a lista (Ctrl+\)" aria-label="Mostrar a lista de textos">»</button>
          <button className="rail-btn solid" onClick={create} title="Criar novo" aria-label="Criar novo">+</button>
        </div>

        <div className="side-top">
          <button className="new" onClick={create}>+ criar novo</button>
          <button className="fold" onClick={toggleSide} title="Recolher a lista (Ctrl+\)" aria-label="Recolher a lista de textos">«</button>
        </div>

        <div className="filters" role="tablist">
          {FILTERS.map(([v, label]) => (
            <button key={v} role="tab" aria-selected={filter === v} className={filter === v ? "on" : ""} onClick={() => setFilter(v)}>{label}</button>
          ))}
        </div>

        <nav className="docs">
          {!cur.id && (
            <div className="doc on">
              <span className="t">{cur.title.trim() || "sem título"}</span>
              <span className="m">novo · ainda não salvo</span>
            </div>
          )}
          {list.map((d) => {
            const on = d.id === cur.id;
            return (
              <button key={d.id} className={"doc" + (on ? " on" : "")} onClick={() => !on && open(d.id)}>
                <span className="t">{(on ? cur.title : d.title).trim() || "sem título"}</span>
                <span className="m">
                  {KIND[d.kind] || "artigo"} · <span className={d.published ? "pub" : "draft"}>{d.published ? "publicado" : "rascunho"}</span>
                  {(on ? cur.kind : d.kind) === "projeto" && (on ? cur.pinned : d.pinned) ? " · fixado" : ""} · {fmt(d.updated_at)}
                </span>
              </button>
            );
          })}
          {!list.length && cur.id && <p className="empty">nada aqui ainda</p>}
        </nav>

        <div className="side-foot">
          <a href="../">← ver site</a>
          {Store.cloud ? <button className="link" onClick={logout}>sair</button> : <span className="local" title="Sem banco conectado, os textos ficam só neste navegador">modo local</span>}
        </div>
      </aside>

      <main className="main">
        <button className="drawer-btn" onClick={() => setDrawer(true)} aria-label="Abrir lista de textos">≡ textos</button>

        {!Store.cloud && (
          <div className="warn" role="alert">
            {Store.apiWithoutDb
              ? <>o banco não está conectado no site. o que você escrever aqui fica <b>só neste navegador</b> e não aparece em outro computador nem para os visitantes.</>
              : <>modo local: o que você escrever aqui fica <b>só neste navegador</b>.</>}
          </div>
        )}
        {Store.cloud && localCount > 0 && (
          <div className="warn info">
            {localCount === 1 ? "1 texto escrito antes" : localCount + " textos escritos antes"} no modo local ainda estão só neste navegador.
            <button onClick={sendLocal} disabled={moving}>{moving ? "enviando…" : "enviar para o banco"}</button>
          </div>
        )}

        <div className="page">
          <div className="meta">
            <div className="seg" role="group" aria-label="Tipo">
              {Object.entries(KIND).map(([k, label]) => (
                <button key={k} aria-pressed={cur.kind === k} onClick={() => cur.kind !== k && change({ kind: k })}>{label}</button>
              ))}
            </div>
            <button className={"toggle" + (cur.published ? " on" : "")} aria-pressed={cur.published} onClick={() => change({ published: !cur.published })}>
              <span className="box">{cur.published ? "x" : " "}</span> publicado
            </button>
            <span className="status" aria-live="polite">{status}</span>
            <span className="grow" />
            {cur.id && cur.published && <a className="act" href={sitePath(cur)} target="_blank" rel="noopener">ver no site ↗</a>}
            {cur.id && <button className={"act danger" + (armed ? " armed" : "")} onClick={remove}>{armed ? "confirmar exclusão" : "excluir"}</button>}
          </div>

          <textarea
            ref={titleRef}
            className="title"
            rows={1}
            placeholder="Sem título"
            value={cur.title}
            onChange={(e) => change({ title: e.target.value })}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              const ed = editorRef.current; if (!ed) return;
              ed.view.dom.focus();            // foco imediato, para nenhuma tecla cair no título
              ed.commands.focus("start");
            }}
          />

          {cur.kind === "projeto" && <ProjectFields cur={cur} change={change} />}

          {ask && (
            <form className="ask" onSubmit={submitAsk}>
              <label htmlFor="ask-input">{ask.kind === "link" ? "link" : "imagem"}</label>
              <input id="ask-input" autoFocus type="text" inputMode="url" placeholder="https://" value={ask.value}
                onChange={(e) => setAsk({ ...ask, value: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Escape") setAsk(null); }} />
              <button type="submit">ok</button>
              <button type="button" onClick={() => setAsk(null)}>cancelar</button>
            </form>
          )}

          <DocEditor
            key={edKey}
            initial={cur.doc || cur.html || ""}
            onReady={(ed) => { editorRef.current = ed; }}
            onChange={(patch) => change(patch)}
          />
        </div>
      </main>
    </div>
  );
}

// como o projeto aparece no site: fixado, para onde o badge leva, badge ou cartão
function ProjectFields({ cur, change }) {
  const tags = cur.tags.split(",").map((t) => t.trim()).filter(Boolean);
  const link = Store.cleanLink(cur.link);
  const badLink = cur.link.trim() && !link;
  const external = cur.opens === "link" && link;
  // texto do campo ordem: deixa digitar "-" sem voltar para 0
  const [ord, setOrd] = useState(String(cur.ordem));
  useEffect(() => { setOrd(String(cur.ordem)); }, [cur._k]); // eslint-disable-line react-hooks/exhaustive-deps
  const name = cur.title.trim() || "sem título";
  return (
    <section className="proj" aria-label="Projeto">
      <div className="proj-row">
        <span className="lbl">página inicial</span>
        <button className={"toggle" + (cur.pinned ? " on" : "")} aria-pressed={cur.pinned} onClick={() => change({ pinned: !cur.pinned })}>
          <span className="box">{cur.pinned ? "x" : " "}</span> fixado
        </button>
        <div className="seg" role="group" aria-label="Aparência">
          {[["badge", "badge"], ["cartao", "cartão"]].map(([k, label]) => (
            <button key={k} aria-pressed={cur.look === k} onClick={() => cur.look !== k && change({ look: k })}>{label}</button>
          ))}
        </div>
        <label className="ord">ordem
          <input type="number" step="1" min="-1000000" max="1000000" value={ord}
            onChange={(e) => {
              const v = e.target.value; setOrd(v);
              const n = Number(v);
              if (v.trim() !== "" && Number.isInteger(n) && Math.abs(n) <= 1e6) change({ ordem: n });
            }}
            onBlur={() => setOrd(String(cur.ordem))} />
        </label>
      </div>

      <div className="proj-row">
        <span className="lbl">ao clicar, abre</span>
        <div className="seg" role="group" aria-label="Destino do badge">
          {[["pagina", "esta página"], ["link", "o link"]].map(([k, label]) => (
            <button key={k} aria-pressed={cur.opens === k} onClick={() => cur.opens !== k && change({ opens: k })}>{label}</button>
          ))}
        </div>
      </div>

      <label className="fld"><span className="lbl">link</span>
        <input type="text" inputMode="url" placeholder="https://github.com/…" value={cur.link} maxLength={2000}
          onChange={(e) => change({ link: e.target.value })} />
      </label>
      {badLink && <p className="hint bad">link inválido: use https://, http:// ou mailto:. enquanto isso, ele é salvo vazio.</p>}
      {!badLink && cur.opens === "link" && !link && <p className="hint">sem link, o badge abre a página do projeto.</p>}
      {cur.opens === "pagina" && link && <p className="hint">o link aparece como botão dentro da página do projeto.</p>}

      <label className="fld"><span className="lbl">resumo</span>
        <input type="text" placeholder="uma linha sobre o projeto" value={cur.summary} maxLength={300}
          onChange={(e) => change({ summary: e.target.value })} />
      </label>
      <label className="fld"><span className="lbl">etiquetas</span>
        <input type="text" placeholder="react, supabase, meta ads" value={cur.tags} maxLength={200}
          onChange={(e) => change({ tags: e.target.value })} />
      </label>

      <div className="proj-prev" aria-label="Prévia na página inicial">
        <span className="lbl">prévia</span>
        {!cur.published || !cur.pinned
          ? <span className="hint">{!cur.published ? "rascunho: não aparece no site." : "não fixado: aparece só em /projetos."}</span>
          : cur.look === "badge"
            ? <span className="pv-badge">{name}{external ? " ↗" : ""}</span>
            : <span className="pv-card"><span className="pv-t">{name}{external ? " ↗" : ""}</span>
                {tags.length > 0 && <span className="pv-m">{tags.join(" · ").toLowerCase()}</span>}
                {cur.summary.trim() && <span className="pv-d">{cur.summary.trim()}</span>}</span>}
      </div>
    </section>
  );
}

// filtra o menu "/" por trecho do nome ou das palavras-chave, sem acento
const plain = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
function matchCommand(value, search, keywords = []) {
  const q = plain(search.trim());
  if (!q) return 1;
  const name = plain(value);
  if (name.startsWith(q)) return 1;
  return [name, ...keywords.map(plain)].some((w) => w.includes(q)) ? 0.5 : 0;
}

function DocEditor({ initial, onReady, onChange }) {
  return (
    <EditorRoot>
      <EditorContent
        initialContent={initial}
        extensions={extensions}
        className="ed"
        immediatelyRender={false}
        slotAfter={<ImageResizer />}
        editorProps={{
          handleDOMEvents: { keydown: (_view, event) => handleCommandNavigation(event) },
          handlePaste: (view, event) => handleImagePaste(view, event, uploadFn),
          handleDrop: (view, event, _slice, moved) => handleImageDrop(view, event, moved, uploadFn),
          attributes: { class: "prose", spellcheck: "true" }
        }}
        onCreate={({ editor }) => onReady(editor)}
        onUpdate={({ editor }) => onChange({ doc: editor.getJSON(), html: editor.getHTML() })}
      >
        <EditorCommand className="cmd" filter={matchCommand}>
          <EditorCommandEmpty className="cmd-empty">nenhum bloco com esse nome</EditorCommandEmpty>
          <EditorCommandList>
            {suggestionItems.map((item) => (
              <EditorCommandItem key={item.title} value={item.title} keywords={item.searchTerms}
                onCommand={(val) => item.command(val)} className="cmd-item">
                <span className="cmd-icon">{item.icon}</span>
                <span className="cmd-text"><b>{item.title}</b><small>{item.description}</small></span>
              </EditorCommandItem>
            ))}
          </EditorCommandList>
        </EditorCommand>
        <Bubble />
      </EditorContent>
    </EditorRoot>
  );
}

function Bubble() {
  const { editor } = useEditor();
  if (!editor) return null;
  const items = [
    ["B", "Negrito", "bold", (e) => e.chain().focus().toggleBold().run()],
    ["I", "Itálico", "italic", (e) => e.chain().focus().toggleItalic().run()],
    ["U", "Sublinhado", "underline", (e) => e.chain().focus().toggleUnderline().run()],
    ["S", "Riscado", "strike", (e) => e.chain().focus().toggleStrike().run()],
    ["<>", "Código", "code", (e) => e.chain().focus().toggleCode().run()],
    ["H2", "Título", "heading", (e) => e.chain().focus().toggleHeading({ level: 2 }).run()],
    ["“", "Citação", "blockquote", (e) => e.chain().focus().toggleBlockquote().run()],
    ["link", "Link", "link", (e) => window.dispatchEvent(new CustomEvent("editor:ask", { detail: { kind: "link", value: e.getAttributes("link").href || "" } }))]
  ];
  return (
    <EditorBubble tippyOptions={{ placement: "top", maxWidth: "none" }} className="bubble">
      {items.map(([label, title, mark, run]) => (
        <EditorBubbleItem key={title} asChild onSelect={run}>
          <button type="button" title={title} className={editor.isActive(mark) ? "on" : ""}>{label}</button>
        </EditorBubbleItem>
      ))}
    </EditorBubble>
  );
}
