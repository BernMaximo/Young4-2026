const jwt = require("jsonwebtoken");

function getJwtSecret() { // Função para obter a chave secreta do JWT a partir das variáveis de ambiente
  const secret = process.env.JWT_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error("JWT_SECRET precisa ter pelo menos 32 bytes.");
  }
  return secret;
}

function createAccessToken(cliente) { // Função para criar um token de acesso JWT para o cliente
  return jwt.sign(
    {},
    getJwtSecret(),
    {
      algorithm: "HS256",
      expiresIn: "1h",
      subject: cliente._id.toString()
    }
  );
}

function authenticateToken(req, res, next) {  // Middleware para autenticar o token JWT enviado no cabeçalho da requisição
  const authorization = req.get("authorization");
  const match = authorization && /^Bearer\s+(\S+)$/i.exec(authorization);

  if (!match) {
    return res.status(401).json({ error: "Token de autenticação não informado." });
  }
  const token = match[1];

  let secret;
  try {
    secret = getJwtSecret();
  } catch (err) {
    console.error("Configuração JWT inválida:", err);
    return res.status(500).json({ error: "Autenticação não configurada no servidor." });
  }

  let payload;
  try {
    payload = jwt.verify(token, secret, { algorithms: ["HS256"] });
  } catch (_err) {
    return res.status(401).json({ error: "Token inválido ou expirado." });
  }

  if (typeof payload === "string" || typeof payload.sub !== "string") {
    return res.status(401).json({ error: "Token de autenticação inválido." });
  }

  req.auth = { id: payload.sub };
  return next();
}

module.exports = { authenticateToken, createAccessToken };
