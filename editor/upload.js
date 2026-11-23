// Envio de imagens do computador: colar, arrastar ou escolher pelo menu "/".
// Com o banco ligado, a imagem vai para o Vercel Blob e o texto guarda só o link.
// No modo local, ela fica embutida no próprio texto (só neste navegador).
import { createImageUpload } from "novel";

const TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];
const MAX_IN = 25 * 1024 * 1024; // antes de reduzir
const MAX_SIDE = 2000;            // fotos maiores são reduzidas para no máximo 2000px

const notice = (text) => window.dispatchEvent(new CustomEvent("editor:notice", { detail: text }));

// reduz fotos grandes antes do envio; GIF e AVIF vão como estão
async function shrink(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  let bmp;
  try { bmp = await createImageBitmap(file); } catch { return file; }
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  if (scale === 1 && file.size < 1.5 * 1024 * 1024) { bmp.close?.(); return file; }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d").drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close?.();
  const type = file.type === "image/png" ? "image/png" : "image/jpeg";
  const blob = await new Promise((r) => canvas.toBlob(r, type, 0.86));
  if (!blob || blob.size >= file.size) return file;
  const name = file.name.replace(/\.\w+$/, "") + (type === "image/png" ? ".png" : ".jpg");
  return new File([blob], name, { type });
}

const safeName = (name) => {
  const base = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").replace(/^[-.]+|[-.]+$/g, "");
  return (base || "imagem").slice(-80);
};

const asDataUrl = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(r.error);
  r.readAsDataURL(file);
});

export const uploadFn = createImageUpload({
  validateFn: (file) => {
    if (!TYPES.includes(file.type)) { notice("formato não aceito: use JPG, PNG, WebP, GIF ou AVIF"); return false; }
    if (file.size > MAX_IN) { notice("imagem grande demais: o limite é 25 MB"); return false; }
    return true;
  },
  onUpload: async (file) => {
    notice("enviando imagem…");
    try {
      const f = await shrink(file);
      if (!window.Store.cloud) {
        const src = await asDataUrl(f);
        notice("imagem adicionada (modo local: fica só neste navegador)");
        return src;
      }
      const { upload } = await import("@vercel/blob/client"); // carregado só na hora de enviar
      const blob = await upload("posts/" + safeName(f.name), f, {
        access: "public",
        handleUploadUrl: "/api/upload",
        contentType: f.type
      });
      notice("imagem enviada");
      return blob.url;
    } catch (e) {
      notice("não foi possível enviar a imagem: " + (e?.message || e));
      throw e;
    }
  }
});

// abre o seletor de arquivos e insere a imagem onde está o cursor
export function pickImage(editor) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = TYPES.join(",");
  input.onchange = () => {
    const file = input.files?.[0];
    if (file) uploadFn(file, editor.view, editor.view.state.selection.from);
  };
  input.click();
}
