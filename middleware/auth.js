const jwt = require("jsonwebtoken");

function getJwtSecret() { // Função para obter a chave secreta do JWT a partir das variáveis de ambiente
  const secret = process.env.JWT_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error("JWT_SECRET precisa ter pelo menos 32 bytes.");
  }
  return secret;
}

// A assinatura do JWT usa o identificador do usuário para saber quem está autenticado em cada requisição.
function getSubject(identity) {
  return typeof identity === "string" ? identity : identity._id.toString();
}

// O access token expira em 1 hora e carrega o papel do usuário para autorizar ações específicas.
function createAccessToken(identity, role = "customer") {
  return jwt.sign(
    { tokenType: "access", role },
    getJwtSecret(),
    {
      algorithm: "HS256",
      expiresIn: "1h",
      subject: getSubject(identity)
    }
  );
}

function createRefreshToken(identity, role = "customer") {
  return jwt.sign(
    { tokenType: "refresh", role },
    getJwtSecret(),
    {
      algorithm: "HS256",
      expiresIn: "7d",
      subject: getSubject(identity)
    }
  );
}

// O par de tokens separa acesso curto e renovação longa, mantendo o fluxo de autenticação mais seguro.
function createTokenPair(identity, role = "customer") {
  return {
    token: createAccessToken(identity, role),
    refreshToken: createRefreshToken(identity, role)
  };
}

function authenticateToken(req, res, next) {  // Middleware para autenticar o token JWT enviado no cabeçalho da requisição
  // O cabeçalho Authorization deve seguir o padrão Bearer <token> para que a sessão seja validada.
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

  if (
    !payload
    || typeof payload !== "object"
    || typeof payload.sub !== "string"
    || (payload.tokenType !== undefined && payload.tokenType !== "access")
    || (payload.role !== undefined && payload.role !== "customer" && payload.role !== "admin")
  ) {
    return res.status(401).json({ error: "Token de autenticação inválido." });
  }

  req.auth = { id: payload.sub, role: payload.role || "customer" };
  return next();
}

// Regras de autorização por papel deixam claro que o admin tem acesso a operações exclusivas do painel de clientes.
function requireAdmin(req, res, next) {
  if (req.auth.role !== "admin") {
    return res.status(403).json({ error: "Acesso restrito ao administrador." });
  }
  return next();
}

// Clientes autenticados não conseguem agir em endpoints administrativos, preservando a separação de papéis.
function requireCustomer(req, res, next) {
  if (req.auth.role !== "customer") {
    return res.status(403).json({ error: "Acesso restrito a clientes." });
  }
  return next();
}

module.exports = {
  authenticateToken,
  createAccessToken,
  createRefreshToken,
  createTokenPair,
  getJwtSecret,
  requireAdmin,
  requireCustomer
};
