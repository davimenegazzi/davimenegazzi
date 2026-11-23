// Libera o envio de imagens direto do navegador para o Vercel Blob.
// O navegador pede uma autorização aqui (só com sessão) e manda o arquivo para o Blob;
// o arquivo não passa por esta função, então o limite de tamanho do corpo da Vercel não se aplica.
import { handleUpload } from "@vercel/blob/client";
import { wrap, send, httpError, readJson, isAuthed, blobToken } from "./_lib.js";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];
const MAX_BYTES = 15 * 1024 * 1024;

export default wrap(async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    throw httpError(405, "Método não permitido.");
  }
  const token = blobToken();
  if (!token) {
    throw httpError(500, "O armazenamento de imagens (Vercel Blob) não está conectado ao projeto.");
  }
  if (!isAuthed(req)) throw httpError(401, "Entre para enviar imagens.");

  const body = await readJson(req);
  if (body?.type !== "blob.generate-client-token") throw httpError(400, "Pedido inválido.");

  const result = await handleUpload({
    body,
    request: req,
    token,
    onBeforeGenerateToken: async (pathname) => {
      if (!/^posts\/[\w.-]{1,120}$/.test(pathname)) throw httpError(400, "Nome de arquivo inválido.");
      return { allowedContentTypes: IMAGE_TYPES, maximumSizeInBytes: MAX_BYTES, addRandomSuffix: true };
    }
  });
  return send(res, 200, result);
});
