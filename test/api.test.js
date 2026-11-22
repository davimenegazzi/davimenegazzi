// Testa as funções da API contra um Postgres de verdade em memória (PGlite).
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { setSql } from "../api/_lib.js";
import auth from "../api/auth.js";
import posts from "../api/posts.js";

process.env.ADMIN_PASSWORD = "senha-de-teste";

before(async () => {
  const pg = new PGlite();
  // imita o "sql`...`" do driver da Neon
  setSql(async (strings, ...values) => {
    const text = strings.reduce((acc, s, i) => acc + "$" + i + s);
    return (await pg.query(text, values)).rows;
  });
});

async function call(handler, { method = "GET", url = "/", cookie = "", body } = {}) {
  const headers = { cookie };
  if (body !== undefined) headers["content-type"] = "application/json";
  const req = { method, url, headers, body };
  const res = {
    statusCode: 200, headers: {}, text: "",
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    end(t) { this.text = t; }
  };
  await handler(req, res);
  return { status: res.statusCode, headers: res.headers, json: JSON.parse(res.text) };
}

let cookie = "";

test("sessão: sem cookie não está logado", async () => {
  const r = await call(auth);
  assert.equal(r.json.authed, false);
  assert.equal(r.json.db, true);
});

test("login: senha errada é recusada", async () => {
  const r = await call(auth, { method: "POST", body: { password: "errada" } });
  assert.equal(r.status, 401);
  assert.equal(r.headers["set-cookie"], undefined);
});

test("login: senha certa devolve cookie válido", async () => {
  const r = await call(auth, { method: "POST", body: { password: "senha-de-teste" } });
  assert.equal(r.status, 200);
  assert.match(r.headers["set-cookie"], /HttpOnly; Secure; SameSite=Strict/);
  cookie = r.headers["set-cookie"].split(";")[0];
  assert.equal((await call(auth, { cookie })).json.authed, true);
});

test("cookie adulterado não vale", async () => {
  const bad = cookie.replace(/=(\d+)\./, (_, n) => "=" + (Number(n) + 999) + ".");
  assert.equal((await call(auth, { cookie: bad })).json.authed, false);
});

test("visitante não escreve", async () => {
  const r = await call(posts, { method: "POST", body: { kind: "artigo", title: "x", html: "", published: true } });
  assert.equal(r.status, 401);
});

test("cria, lista, edita e apaga posts", async () => {
  const pub = await call(posts, { method: "POST", cookie, body: { kind: "artigo", title: " Publicado ", html: "<p>oi</p>", published: true } });
  assert.equal(pub.status, 201);
  assert.equal(pub.json.title, "Publicado");
  assert.ok(pub.json.published_at, "publicado ganha data de publicação");
  const draft = await call(posts, { method: "POST", cookie, body: { kind: "noticia", title: "Rascunho", html: "", published: false } });

  // visitante vê só o publicado, sem o corpo na lista
  const pubList = await call(posts, { url: "/api/posts?drafts=1" });
  assert.deepEqual(pubList.json.map(p => p.title), ["Publicado"]);
  assert.equal(pubList.json[0].html, undefined);
  assert.equal((await call(posts, { url: "/api/posts?id=" + draft.json.id })).status, 404);

  // com sessão vê rascunhos e filtra por tipo
  const all = await call(posts, { url: "/api/posts?drafts=1", cookie });
  assert.equal(all.json.length, 2);
  const news = await call(posts, { url: "/api/posts?kind=noticia&drafts=1", cookie });
  assert.deepEqual(news.json.map(p => p.title), ["Rascunho"]);

  assert.equal(draft.json.published_at, null, "rascunho não tem data de publicação");

  // edita (publica o rascunho)
  const ed = await call(posts, { method: "POST", cookie, body: { id: draft.json.id, kind: "noticia", title: "Agora publicada", html: "<p>x</p>", published: true } });
  assert.equal(ed.status, 200);
  assert.ok(ed.json.published_at, "ao publicar, ganha data");
  const firstPub = ed.json.published_at;
  const withDoc = await call(posts, { method: "POST", cookie, body: { id: draft.json.id, kind: "noticia", title: "Agora publicada", html: "<p>x</p>", doc: { type: "doc", content: [{ type: "paragraph" }] }, published: true } });
  assert.deepEqual(withDoc.json.doc, { type: "doc", content: [{ type: "paragraph" }] });
  assert.equal(new Date(withDoc.json.published_at).getTime(), new Date(firstPub).getTime(), "editar não muda a data de publicação");
  assert.equal((await call(posts, { url: "/api/posts?kind=noticia" })).json[0].title, "Agora publicada");

  // apaga
  assert.equal((await call(posts, { method: "DELETE", url: "/api/posts?id=" + pub.json.id, cookie })).status, 200);
  assert.equal((await call(posts, { url: "/api/posts?id=" + pub.json.id, cookie })).status, 404);
});

test("validação recusa dados inválidos", async () => {
  const r = await call(posts, { method: "POST", cookie, body: { kind: "outro", title: "x", html: "", published: true } });
  assert.equal(r.status, 400);
  const r2 = await call(posts, { url: "/api/posts?id=nao-e-uuid" });
  assert.equal(r2.status, 404);
});
