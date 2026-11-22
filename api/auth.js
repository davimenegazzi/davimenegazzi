// GET: diz se há sessão e se o banco está configurado. POST {password}: entra. DELETE: sai.
import { hasDb, wrap, send, httpError, readJson, isAuthed, checkPassword, sessionCookie, clearedCookie } from "./_lib.js";

export default wrap(async (req, res) => {
  if (req.method === "GET") return send(res, 200, { authed: isAuthed(req), db: hasDb() });

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
