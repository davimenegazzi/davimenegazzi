// Testa a autorização de envio de imagens (o envio em si vai direto do navegador para o Vercel Blob).
import { test } from "node:test";
import assert from "node:assert/strict";
import auth from "../api/auth.js";
import upload from "../api/upload.js";

process.env.ADMIN_PASSWORD = "senha-de-teste";

async function call(handler, { method = "POST", url = "/", cookie = "", body } = {}) {
  const headers = { cookie, host: "localhost" };
  if (body !== undefined) headers["content-type"] = "application/json";
  const req = { method, url, headers, body };
  const res = { statusCode: 200, headers: {}, text: "", setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(t) { this.text = t; } };
  await handler(req, res);
  return { status: res.statusCode, json: JSON.parse(res.text) };
}
const tokenRequest = (pathname) => ({ type: "blob.generate-client-token", payload: { pathname, clientPayload: null, multipart: false } });

test("token com prefixo no nome também vale", async () => {
  const { blobToken } = await import("../api/_lib.js");
  delete process.env.BLOB_READ_WRITE_TOKEN;
  process.env.STORAGE_BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_abc_def";
  assert.equal(blobToken(), "vercel_blob_rw_abc_def");
  delete process.env.STORAGE_BLOB_READ_WRITE_TOKEN;
});

test("sem Blob conectado, avisa", async () => {
  delete process.env.BLOB_READ_WRITE_TOKEN;
  const r = await call(upload, { body: tokenRequest("posts/foto.jpg") });
  assert.equal(r.status, 500);
  assert.match(r.json.error, /Vercel Blob/);
});

test("com Blob conectado", async (t) => {
  process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_teste123_segredo456";
  const login = await new Promise((resolve) => {
    const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end() { resolve(this); } };
    auth({ method: "POST", url: "/", headers: { "content-type": "application/json" }, body: { password: "senha-de-teste" } }, res);
  });
  const cookie = login.headers["set-cookie"].split(";")[0];

  await t.test("visitante não recebe autorização", async () => {
    const r = await call(upload, { body: tokenRequest("posts/foto.jpg") });
    assert.equal(r.status, 401);
  });
  await t.test("com sessão recebe autorização", async () => {
    const r = await call(upload, { cookie, body: tokenRequest("posts/foto.jpg") });
    assert.equal(r.status, 200);
    assert.match(r.json.clientToken, /^vercel_blob_client_/);
  });
  await t.test("caminho fora de posts/ é recusado", async () => {
    const r = await call(upload, { cookie, body: tokenRequest("../outro/arquivo.html") });
    assert.equal(r.status, 400);
  });
  await t.test("GET não é aceito", async () => {
    const r = await call(upload, { method: "GET", cookie });
    assert.equal(r.status, 405);
  });
});
