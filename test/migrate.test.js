// A tabela criada pelas versões anteriores aceitava só artigo e noticia.
// ensureSchema precisa trocar a restrição e criar as colunas novas sem perder nada.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { setSql, ensureSchema } from "../api/_lib.js";

test("migra a tabela antiga para aceitar projetos", async () => {
  const pg = new PGlite();
  await pg.exec(`create table posts (
    id uuid primary key default gen_random_uuid(),
    kind text not null check (kind in ('artigo', 'noticia')),
    title text not null default '', html text not null default '',
    published boolean not null default false,
    created_at timestamptz not null default now(), updated_at timestamptz not null default now())`);
  await pg.exec(`insert into posts (kind, title, published) values ('artigo', 'antigo', true)`);
  setSql(async (strings, ...values) => (await pg.query(strings.reduce((a, s, i) => a + "$" + i + s), values)).rows);

  await ensureSchema();
  await ensureSchema(); // segunda vez não muda nada nem dá erro

  const [old] = (await pg.query(`select * from posts`)).rows;
  assert.equal(old.title, "antigo");
  assert.equal(old.pinned, false);
  assert.equal(old.opens, "pagina");
  assert.ok(old.published_at);

  await pg.exec(`insert into posts (kind, title) values ('projeto', 'novo')`);
  await assert.rejects(pg.exec(`insert into posts (kind, title) values ('outro', 'x')`));
});
