// GET ?id=        um post (rascunho só com sessão)
// GET ?kind=&drafts=1   lista sem o corpo (rascunhos só com sessão)
// POST {id?, kind, title, html, doc?, published, ...campos de projeto}   cria ou atualiza (com sessão)
//   projeto: pinned, link, opens ("pagina" | "link"), look ("badge" | "cartao"), summary, tags, ordem
// DELETE ?id=     apaga (com sessão)
import { wrap, send, httpError, readJson, query, db, ensureSchema, isAuthed } from "./_lib.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS = ["artigo", "noticia", "projeto"];
const OPENS = ["pagina", "link"];
const LOOKS = ["badge", "cartao"];

// aceita "github.com/x" (vira https://) e recusa esquemas como javascript:
export function cleanLink(v) {
  if (v == null) return "";
  if (typeof v !== "string" || v.length > 2000) throw httpError(400, "Link inválido.");
  let u = v.trim();
  if (!u) return "";
  // "meusite.com:8080" é host com porta, não esquema
  if (!/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(u)) u = "https://" + u.replace(/^\/+/, "");
  if (!/^(https?:\/\/[^\s/]+|mailto:\S+@)/i.test(u) || /\s/.test(u)) throw httpError(400, "O link deve começar com https://, http:// ou mailto:.");
  return u;
}

function str(v, max, label) {
  if (v == null) return "";
  if (typeof v !== "string" || v.length > max) throw httpError(400, `${label} deve ter até ${max} caracteres.`);
  return v.trim();
}

function projectFields(b) {
  if (b.pinned != null && typeof b.pinned !== "boolean") throw httpError(400, "pinned deve ser verdadeiro ou falso.");
  const opens = b.opens == null ? "pagina" : b.opens;
  if (!OPENS.includes(opens)) throw httpError(400, "opens deve ser pagina ou link.");
  const look = b.look == null ? "badge" : b.look;
  if (!LOOKS.includes(look)) throw httpError(400, "look deve ser badge ou cartao.");
  const ordem = b.ordem == null || b.ordem === "" ? 0 : Number(b.ordem);
  if (!Number.isInteger(ordem) || Math.abs(ordem) > 1_000_000) throw httpError(400, "ordem deve ser um número inteiro.");
  const link = cleanLink(b.link);
  // opens = "link" sem link é aceito: o site cai na página do projeto até o link ser preenchido
  return {
    pinned: !!b.pinned, link, opens, look, ordem,
    summary: str(b.summary, 300, "Resumo"),
    tags: str(b.tags, 200, "Etiquetas")
  };
}
const NO_PROJECT = { pinned: false, link: "", opens: "pagina", look: "badge", summary: "", tags: "", ordem: 0 };

function validate(b) {
  if (!b || typeof b !== "object" || Array.isArray(b)) throw httpError(400, "Pedido inválido.");
  if (b.id != null && !UUID.test(String(b.id))) throw httpError(400, "id inválido.");
  if (!KINDS.includes(b.kind)) throw httpError(400, "Tipo deve ser artigo, noticia ou projeto.");
  if (typeof b.title !== "string" || b.title.length > 300) throw httpError(400, "Título deve ter até 300 caracteres.");
  if (typeof b.html !== "string" || b.html.length > 500_000) throw httpError(400, "Texto grande demais.");
  if (typeof b.published !== "boolean") throw httpError(400, "published deve ser verdadeiro ou falso.");
  if (b.doc != null && (typeof b.doc !== "object" || Array.isArray(b.doc))) throw httpError(400, "doc inválido.");
  const doc = b.doc == null ? null : JSON.stringify(b.doc);
  if (doc && doc.length > 1_000_000) throw httpError(400, "Texto grande demais.");
  const extra = b.kind === "projeto" ? projectFields(b) : NO_PROJECT;
  return { id: b.id || null, kind: b.kind, title: b.title.trim() || "sem título", html: b.html, doc, published: b.published, ...extra };
}

export default wrap(async (req, res) => {
  await ensureSchema();
  const sql = db();
  const authed = isAuthed(req);
  const q = query(req);

  if (req.method === "GET") {
    if (q.id) {
      if (!UUID.test(q.id)) throw httpError(404, "Post não encontrado.");
      const [row] = await sql`select * from posts where id = ${q.id}`;
      if (!row || (!row.published && !authed)) throw httpError(404, "Post não encontrado.");
      return send(res, 200, row);
    }
    const kind = KINDS.includes(q.kind) ? q.kind : null;
    const drafts = q.drafts === "1" && authed;
    const rows = await sql`
      select id, kind, title, published, published_at, created_at, updated_at,
        pinned, link, opens, look, summary, tags, ordem from posts
      where (${kind}::text is null or kind = ${kind}::text) and (${drafts}::boolean or published)
      order by coalesce(published_at, updated_at) desc`;
    return send(res, 200, rows);
  }

  if (req.method !== "POST" && req.method !== "DELETE") {
    res.setHeader("Allow", "GET, POST, DELETE");
    throw httpError(405, "Método não permitido.");
  }
  if (!authed) throw httpError(401, "Entre para editar.");

  if (req.method === "POST") {
    const p = validate(await readJson(req));
    if (p.id) {
      const [row] = await sql`
        update posts set kind = ${p.kind}, title = ${p.title}, html = ${p.html},
          doc = ${p.doc}::jsonb, published = ${p.published}, updated_at = now(),
          pinned = ${p.pinned}, link = ${p.link}, opens = ${p.opens}, look = ${p.look},
          summary = ${p.summary}, tags = ${p.tags}, ordem = ${p.ordem},
          published_at = case when ${p.published}::boolean then coalesce(published_at, now()) else published_at end
        where id = ${p.id} returning *`;
      if (!row) throw httpError(404, "Post não encontrado.");
      return send(res, 200, row);
    }
    const [row] = await sql`
      insert into posts (kind, title, html, doc, published, published_at, pinned, link, opens, look, summary, tags, ordem)
      values (${p.kind}, ${p.title}, ${p.html}, ${p.doc}::jsonb, ${p.published},
        case when ${p.published}::boolean then now() end,
        ${p.pinned}, ${p.link}, ${p.opens}, ${p.look}, ${p.summary}, ${p.tags}, ${p.ordem}) returning *`;
    return send(res, 201, row);
  }

  if (!q.id || !UUID.test(q.id)) throw httpError(400, "id inválido.");
  const rows = await sql`delete from posts where id = ${q.id} returning id`;
  if (!rows.length) throw httpError(404, "Post não encontrado.");
  return send(res, 200, { deleted: q.id });
});
