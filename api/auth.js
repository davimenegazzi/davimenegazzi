// GET: diz se há sessão e se o banco está configurado. POST {password}: entra. DELETE: sai.
import { hasDb, setupHints, wrap, send, httpError, readJson, isAuthed, checkPassword, sessionCookie, clearedCookie } from "./_lib.js";

export default wrap(async (req, res) => {
  if (req.method === "GET") {
    const db = hasDb();
    const h = setupHints();
    // só sim/não: diz se a senha e as imagens estão configuradas, sem expor nada
    const config = { senha: h.admin_password, imagens: h.blob };
    return send(res, 200, db ? { authed: isAuthed(req), db, config } : { authed: false, db, config, diagnostico: h });
  }

  if (req.method === "POST") {
    const { password } = await readJson(req);
    if (!checkPassword(password)) {
      await new Promise((r) => setTimeout(r, 600)); // atrasa tentativas seguidas
      throw httpError(401, "Senha incorreta.");
    }
    res.setHeader("Set-Cookie", sessionCookie());
    return send(res, 200, { authed: true });
  }

  if (req.method === "DELETE") {
    res.setHeader("Set-Cookie", clearedCookie());
    return send(res, 200, { authed: false });
  }

  res.setHeader("Allow", "GET, POST, DELETE");
  throw httpError(405, "Método não permitido.");
});
