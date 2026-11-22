// GET ?id=        um post (rascunho só com sessão)
// GET ?kind=&drafts=1   lista sem o corpo (rascunhos só com sessão)
// POST {id?, kind, title, html, doc?, published}   cria ou atualiza (com sessão)
// DELETE ?id=     apaga (com sessão)
import { wrap, send, httpError, readJson, query, db, ensureSchema, isAuthed } from "./_lib.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS = ["artigo", "noticia"];

function validate(b) {
  if (b.id != null && !UUID.test(String(b.id))) throw httpError(400, "id inválido.");
  if (!KINDS.includes(b.kind)) throw httpError(400, "Tipo deve ser artigo ou noticia.");
  if (typeof b.title !== "string" || b.title.length > 300) throw httpError(400, "Título deve ter até 300 caracteres.");
  if (typeof b.html !== "string" || b.html.length > 500_000) throw httpError(400, "Texto grande demais.");
  if (typeof b.published !== "boolean") throw httpError(400, "published deve ser verdadeiro ou falso.");
  if (b.doc != null && (typeof b.doc !== "object" || Array.isArray(b.doc))) throw httpError(400, "doc inválido.");
  const doc = b.doc == null ? null : JSON.stringify(b.doc);
  if (doc && doc.length > 1_000_000) throw httpError(400, "Texto grande demais.");
  return { id: b.id || null, kind: b.kind, title: b.title.trim() || "sem título", html: b.html, doc, published: b.published };
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
      select id, kind, title, published, published_at, created_at, updated_at from posts
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
          published_at = case when ${p.published}::boolean then coalesce(published_at, now()) else published_at end
        where id = ${p.id} returning *`;
      if (!row) throw httpError(404, "Post não encontrado.");
      return send(res, 200, row);
    }
    const [row] = await sql`
      insert into posts (kind, title, html, doc, published, published_at)
      values (${p.kind}, ${p.title}, ${p.html}, ${p.doc}::jsonb, ${p.published},
        case when ${p.published}::boolean then now() end) returning *`;
    return send(res, 201, row);
  }

  if (!q.id || !UUID.test(q.id)) throw httpError(400, "id inválido.");
  const rows = await sql`delete from posts where id = ${q.id} returning id`;
  if (!rows.length) throw httpError(404, "Post não encontrado.");
  return send(res, 200, { deleted: q.id });
});
