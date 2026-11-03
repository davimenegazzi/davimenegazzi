# Davi Menegazzi — portfólio

Site estático (HTML/CSS/JS, sem build) com Sobre mim, Notícias, Artigos, Currículo, login e um editor de texto em blocos.

## Rodar local
```bash
npx serve .
```

## Editar conteúdo
- Textos, links e currículo: `js/content.js`
- Notícias e artigos: faça login e use **Editor** (`#/editor`).

## Login e nuvem (Supabase)
1. Crie um projeto no Supabase e rode `supabase/schema.sql`.
2. Desative novos cadastros e crie seu usuário em Authentication > Users.
3. Preencha `SUPABASE_URL` e `SUPABASE_ANON_KEY` em `js/config.js`.

Sem configuração, o site usa **modo local**: documentos e senha ficam só no navegador (bom para testar, não para produção).

## Publicar
GitHub Pages: Settings > Pages > branch `main`, pasta `/`.
