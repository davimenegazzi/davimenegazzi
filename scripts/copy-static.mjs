// Copia as páginas estáticas do site para dist/, ao lado do editor gerado pelo Vite.
import { cpSync, mkdirSync } from "node:fs";

mkdirSync("dist", { recursive: true });
for (const p of ["index.html", "css", "js", "login"]) cpSync(p, "dist/" + p, { recursive: true });
console.log("site estático copiado para dist/");
