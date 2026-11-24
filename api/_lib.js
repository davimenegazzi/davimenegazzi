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
// acha a conexão do Neon mesmo que a Vercel tenha criado as variáveis com prefixo
// (ex.: STORAGE_DATABASE_URL) ou só com os nomes POSTGRES_*
export function databaseUrl() {
  const env = process.env;
  const isPg = (v) => typeof v === "string" && /^postgres(ql)?:\/\//.test(v);
  for (const k of ["DATABASE_URL", "POSTGRES_URL"]) if (isPg(env[k])) return env[k];
  const names = Object.keys(env).filter((k) => isPg(env[k]));
  const pick = (re) => names.find((k) => re.test(k));
  return env[pick(/(^|_)DATABASE_URL$/) || pick(/(^|_)POSTGRES_URL$/) || names.find((n) => !/UNPOOLED|NON_POOLING/i.test(n)) || names[0]] || null;
}
export const hasDb = () => !!(sqlFn || databaseUrl());

// token do Vercel Blob, com ou sem prefixo no nome da variável
export function blobToken() {
  const env = process.env;
  if (env.BLOB_READ_WRITE_TOKEN) return env.BLOB_READ_WRITE_TOKEN;
  const k = Object.keys(env).find((n) => /BLOB_READ_WRITE_TOKEN$/.test(n) && env[n])
    || Object.keys(env).find((n) => /^vercel_blob_rw_/.test(String(env[n])));
  return k ? env[k] : null;
}

// só nomes, nunca valores: ajuda a descobrir por que o banco não aparece
export function setupHints() {
  return {
    variaveis_de_banco: Object.keys(process.env).filter((k) => /DATABASE|POSTGRES|NEON|(^|_)PG/i.test(k)).sort(),
    admin_password: !!process.env.ADMIN_PASSWORD,
    blob: !!blobToken(),
    ambiente: process.env.VERCEL_ENV || null
  };
}
export function setSql(fn) { sqlFn = fn; ready = null; } // usado nos testes

export function db() {
  if (!sqlFn) {
    const url = databaseUrl();
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
      kind text not null check (kind in ('artigo', 'noticia', 'projeto')),
      title text not null default '',
      html text not null default '',
      published boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`;
    await sql`create index if not exists posts_kind_updated on posts (kind, updated_at desc)`;
    // documento no formato do editor (JSON do Tiptap); o html continua sendo o que o site mostra
    await sql`alter table posts add column if not exists doc jsonb`;
    // momento da primeira publicação; posts publicados antes desta coluna usam a última edição
    await sql`alter table posts add column if not exists published_at timestamptz`;
    await sql`update posts set published_at = updated_at where published and published_at is null`;
    // projetos: mesmos textos, com campos a mais para o badge da página inicial
    await sql`do $$ begin
      if exists (select 1 from pg_constraint where conname = 'posts_kind_check'
                 and pg_get_constraintdef(oid) not like '%projeto%') then
        alter table posts drop constraint if exists posts_kind_check;
      end if;
      if not exists (select 1 from pg_constraint where conname = 'posts_kind_check') then
        begin
          alter table posts add constraint posts_kind_check check (kind in ('artigo', 'noticia', 'projeto'));
        exception when duplicate_object then null; -- outra instância criou ao mesmo tempo
        end;
      end if;
    end $$`;
    await sql`alter table posts add column if not exists pinned boolean not null default false`;
    await sql`alter table posts add column if not exists link text not null default ''`;
    await sql`alter table posts add column if not exists opens text not null default 'pagina'`;
    await sql`alter table posts add column if not exists look text not null default 'badge'`;
    await sql`alter table posts add column if not exists summary text not null default ''`;
    await sql`alter table posts add column if not exists tags text not null default ''`;
    await sql`alter table posts add column if not exists ordem integer not null default 0`;
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
