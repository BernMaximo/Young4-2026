const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const router = express.Router();
const Cliente = require("../models/cliente");
const {
  authenticateToken,
  createTokenPair,
  getJwtSecret,
  requireAdmin
} = require("../middleware/auth");

function normalizeCPF(cpf) {  // Função para normalizar o CPF, removendo caracteres não numéricos
  return typeof cpf === "string" || typeof cpf === "number"
    ? String(cpf).replace(/\D/g, "")
    : "";
}

function isValidCPFFormat(cpf) {  // Função para validar o formato do CPF (deve ter exatamente 11 dígitos)
  return /^\d{11}$/.test(cpf);
}

function getRequestBody(req) {  // Função para obter o corpo da requisição, garantindo que seja um objeto
  return req.body && typeof req.body === "object" && !Array.isArray(req.body)
    ? req.body
    : {};
}

router.post("/clientes", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const body = getRequestBody(req);
    const { nome, sobrenome, genre, senha } = body;
    const cpf = normalizeCPF(body.cpf);

    if (!isValidCPFFormat(cpf) || typeof senha !== "string" || !senha) {
      return res.status(400).json({ error: "Informe um CPF com 11 dígitos e uma senha." });
    }

    const newCliente = new Cliente({
      nome,
      sobrenome,
      cpf,
      genre,
      senha: await bcrypt.hash(senha, 10)
    });
    await newCliente.save();
    return res.status(201).json(newCliente);
  } catch (err) {
    console.error("Erro ao criar cliente:", err);
    return res.status(500).json({ error: "Erro ao criar cliente." });
  }
});

router.post("/login", async (req, res) => {
  try {
    const body = getRequestBody(req);
    const cpf = normalizeCPF(body.cpf);
    const { senha } = body;

    if (!isValidCPFFormat(cpf) || typeof senha !== "string" || !senha) {
      return res.status(400).json({ error: "Informe um CPF com 11 dígitos e uma senha." });
    }

    let cliente = await Cliente.findOne({ cpf }).select("+senha");
    if (!cliente) {
      const legacyCliente = await Cliente.collection.findOne({ cpf: Number(cpf) });
      if (legacyCliente) {
        cliente = Cliente.hydrate(legacyCliente);
      }
    }

    if (!cliente || typeof cliente.senha !== "string") {
      return res.status(401).json({ error: "CPF ou senha inválidos." });
    }

    const senhaHasheada = /^\$2[aby]\$\d{2}\$/.test(cliente.senha);
    const senhaValida = senhaHasheada
      ? await bcrypt.compare(senha, cliente.senha)
      : senha === cliente.senha;

    if (!senhaValida) {
      return res.status(401).json({ error: "CPF ou senha inválidos." });
    }

    if (!senhaHasheada || String(cliente.cpf) !== cpf) {
      cliente.cpf = cpf;
      if (!senhaHasheada) {
        cliente.senha = await bcrypt.hash(senha, 10);
      }
      await cliente.save();
    }

    return res.json({
      ...createTokenPair(cliente),
      cliente: {
        id: cliente._id,
        nome: cliente.nome,
        sobrenome: cliente.sobrenome,
        cpf: cliente.cpf
      }
    });
  } catch (err) {
    console.error("Erro ao realizar login:", err);
    return res.status(500).json({ error: "Erro ao realizar login." });
  }
});

router.post("/admin/login", (req, res) => {
  const body = getRequestBody(req);
  const cpf = normalizeCPF(body.cpf);
  const { senha } = body;
  const adminCpf = normalizeCPF(process.env.ADMIN_CPF);
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!isValidCPFFormat(adminCpf) || typeof adminPassword !== "string" || !adminPassword) {
    console.error("Configuração de credenciais do administrador inválida.");
    return res.status(500).json({ error: "Autenticação administrativa não configurada no servidor." });
  }

  if (!isValidCPFFormat(cpf) || typeof senha !== "string" || !senha) {
    return res.status(400).json({ error: "Informe um CPF com 11 dígitos e uma senha." });
  }

  if (cpf !== adminCpf || senha !== adminPassword) {
    return res.status(401).json({ error: "CPF ou senha inválidos." });
  }

  try {
    return res.json({
      ...createTokenPair("admin", "admin"),
      admin: { cpf: adminCpf }
    });
  } catch (err) {
    console.error("Erro ao realizar login administrativo:", err);
    return res.status(500).json({ error: "Erro ao realizar login administrativo." });
  }
});

router.post("/refresh-token", (req, res) => {
  const body = getRequestBody(req);
  if (typeof body.refreshToken !== "string" || !body.refreshToken) {
    return res.status(400).json({ error: "Informe um refresh token válido." });
  }

  let secret;
  try {
    secret = getJwtSecret();
  } catch (err) {
    console.error("Configuração JWT inválida:", err);
    return res.status(500).json({ error: "Autenticação não configurada no servidor." });
  }

  let payload;
  try {
    payload = jwt.verify(body.refreshToken, secret, { algorithms: ["HS256"] });
  } catch (_err) {
    return res.status(401).json({ error: "Refresh token inválido ou expirado." });
  }

  if (
    !payload
    || typeof payload !== "object"
    || typeof payload.sub !== "string"
    || payload.tokenType !== "refresh"
    || (payload.role !== "customer" && payload.role !== "admin")
    || (payload.role === "admin" && payload.sub !== "admin")
  ) {
    return res.status(401).json({ error: "Refresh token inválido ou expirado." });
  }

  try {
    return res.json(createTokenPair(payload.sub, payload.role));
  } catch (err) {
    console.error("Erro ao renovar tokens:", err);
    return res.status(500).json({ error: "Erro ao renovar tokens." });
  }
});

router.use(authenticateToken, requireAdmin);

router.get("/clientes", async (_req, res) => {
  try {
    const clientes = await Cliente.find();
    return res.json(clientes);
  } catch (err) {
    console.error("Erro ao buscar clientes:", err);
    return res.status(500).json({ error: "Erro ao buscar clientes." });
  }
});

router.get("/clientes/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const cliente = await Cliente.findById(id);

    if (!cliente) {
      return res.status(404).json({ error: "Cliente não encontrado." });
    }

    return res.json(cliente);
  } catch (err) {
    console.error("Erro ao buscar cliente:", err);
    return res.status(500).json({ error: "Erro ao buscar cliente." });
  }
});

router.patch("/clientes/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const body = getRequestBody(req);
    if (!Object.keys(body).length) {
      return res.status(400).json({ error: "Informe os campos que deseja atualizar." });
    }
    const updates = { ...body };

    if (Object.prototype.hasOwnProperty.call(updates, "cpf")) {
      updates.cpf = normalizeCPF(updates.cpf);
      if (!isValidCPFFormat(updates.cpf)) {
        return res.status(400).json({ error: "Informe um CPF com 11 dígitos." });
      }
    }

    if (Object.prototype.hasOwnProperty.call(updates, "senha")) {
      if (typeof updates.senha !== "string" || !updates.senha) {
        return res.status(400).json({ error: "Informe uma senha válida." });
      }
      updates.senha = await bcrypt.hash(updates.senha, 10);
    }

    const options = { new: true, runValidators: true };
    const updatedCliente = await Cliente.findByIdAndUpdate(id, updates, options);
    if (!updatedCliente) {
      return res.status(404).json({ error: "Cliente não encontrado." });
    }

    return res.json(updatedCliente);
  } catch (err) {
    console.error("Erro ao atualizar cliente:", err);
    return res.status(500).json({ error: "Erro ao atualizar cliente." });
  }
});

router.delete("/clientes/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const deletedCliente = await Cliente.findByIdAndDelete(id);
    if (!deletedCliente) {
      return res.status(404).json({ error: "Cliente não encontrado." });
    }
    return res.json({ message: "Cliente excluído com sucesso." });
  } catch (err) {
    console.error("Erro ao excluir cliente:", err);
    return res.status(500).json({ error: "Erro ao excluir cliente." });
  }
});

module.exports = router;