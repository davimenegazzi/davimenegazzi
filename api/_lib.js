// Utilidades compartilhadas pelas funções da Vercel.
// Arquivos que começam com "_" dentro de /api não viram rotas.
import { neon } from "@neondatabase/serverless";
import crypto from "node:crypto";

// ---------- respostas ----------
export function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

export function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

export function wrap(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (e) {
      if (!e.status) console.error(e);
      send(res, e.status || 500, { error: e.status ? e.message : "Erro interno." });
    }
  };
}

export async function readJson(req) {
  if (!String(req.headers["content-type"] || "").includes("application/json")) {
    throw httpError(415, "Envie os dados como JSON.");
  }
  try {
    if (req.body !== undefined) return typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    let raw = "";
    for await (const chunk of req) raw += chunk;
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw httpError(400, "JSON inválido.");
  }
}

export function query(req) {
  return req.query || Object.fromEntries(new URL(req.url, "http://localhost").searchParams);
}

// ---------- banco ----------
let sqlFn = null;
export const hasDb = () => !!(sqlFn || process.env.DATABASE_URL || process.env.POSTGRES_URL);
export function setSql(fn) { sqlFn = fn; ready = null; } // usado nos testes

export function db() {
  if (!sqlFn) {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!url) throw httpError(500, "DATABASE_URL não está configurada na Vercel.");
    sqlFn = neon(url);
  }
  return sqlFn;
}

let ready = null;
export function ensureSchema() {
  ready ??= (async () => {
    const sql = db();
    await sql`create table if not exists posts (
      id uuid primary key default gen_random_uuid(),
      kind text not null check (kind in ('artigo', 'noticia')),
      title text not null default '',
      html text not null default '',
      published boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`;
    await sql`create index if not exists posts_kind_updated on posts (kind, updated_at desc)`;
    // documento no formato do editor (JSON do Tiptap); o html continua sendo o que o site mostra
    await sql`alter table posts add column if not exists doc jsonb`;
  })().catch((e) => { ready = null; throw e; });
  return ready;
}

// ---------- sessão ----------
// A senha fica em ADMIN_PASSWORD. O cookie guarda a validade e uma assinatura HMAC;
// trocar a senha invalida todas as sessões abertas.
const COOKIE = "dm_sess";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 dias

function adminPassword() {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) throw httpError(500, "ADMIN_PASSWORD não está configurada na Vercel.");
  return pw;
}

function sign(exp) {
  const key = crypto.createHash("sha256").update("dm-session\0" + adminPassword()).digest();
  return crypto.createHmac("sha256", key).update(String(exp)).digest("base64url");
}

const sha = (s) => crypto.createHash("sha256").update(String(s)).digest();

export function checkPassword(pw) {
  const expected = adminPassword();
  return typeof pw === "string" && crypto.timingSafeEqual(sha(pw), sha(expected));
}

export function sessionCookie() {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  return `${COOKIE}=${exp}.${sign(exp)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${MAX_AGE}`;
}

export function clearedCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export function isAuthed(req) {
  try {
    const m = String(req.headers.cookie || "").match(/(?:^|;\s*)dm_sess=(\d+)\.([\w-]+)/);
    if (!m || Number(m[1]) < Date.now() / 1000) return false;
    const a = Buffer.from(sign(m[1])), b = Buffer.from(m[2]);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
