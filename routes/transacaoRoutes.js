const express = require("express");
const mongoose = require("mongoose");
const Transacao = require("../models/transacao");
const { authenticateToken, requireCustomer } = require("../middleware/auth");

const router = express.Router();
const allowedFields = new Set(["tipo", "valor", "data", "descricao", "tag", "detalhes"]);

function isObjectBody(body) { // Função para verificar se o corpo da requisição é um objeto válido
  return body !== null && typeof body === "object" && !Array.isArray(body);
}

function parseDate(value) { // Função para analisar uma string de data no formato YYYY-MM-DD e retornar um objeto Date válido
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value
    ? null
    : date;
}

function parseMoney(value) {  // Função para analisar um valor monetário, garantindo que seja um número positivo com no máximo duas casas decimais
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  const rounded = Math.round(value * 100) / 100;
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-8 ? rounded : null;
}

function validateFields(body, { partial = false } = {}) { // Função para validar os campos do corpo da requisição, garantindo que sejam válidos e retornando um objeto com os valores validados
  if (!isObjectBody(body)) {
    return { error: "O corpo da requisição deve ser um objeto JSON." };
  }

  const fields = Object.keys(body);
  if (fields.some((field) => !allowedFields.has(field))) {
    return { error: "A requisição contém campos não permitidos." };
  }
  if (fields.length === 0) {
    return { error: "Informe os campos do lançamento." };
  }

  const result = {};
  for (const field of fields) {
    const value = body[field];
    if (field === "tipo") {   // Validação do campo "tipo", que deve ser "Receita" ou "Despesa"
      if (value !== "Receita" && value !== "Despesa") {
        return { error: "O tipo deve ser 'Receita' ou 'Despesa'." };
      }
      result.tipo = value;
    } else if (field === "valor") { // Validação do campo "valor", que deve ser um número positivo com no máximo duas casas decimais
      const valor = parseMoney(value);
      if (valor === null) {
        return { error: "O valor deve ser um número positivo com no máximo duas casas decimais." };
      }
      result.valor = valor;
    } else if (field === "data") { // Validação do campo "data", que deve estar no formato YYYY-MM-DD e ser uma data válida
      const data = parseDate(value);
      if (!data) {
        return { error: "A data deve estar no formato YYYY-MM-DD e ser válida." };
      }
      result.data = data;
    } else if (typeof value !== "string") {   // Validação dos campos "descricao", "tag" e "detalhes", que devem ser strings
      return { error: `O campo '${field}' deve ser texto.` };
    } else {
      result[field] = value.trim();
    }
  }

  if (!partial && (!fields.includes("tipo") || !fields.includes("valor") || !fields.includes("data"))) {
    return { error: "Informe tipo, valor e data do lançamento." };
  }

  return { value: result };
}

function getOwnedQuery(id, clienteId) { // Função para criar uma query que verifica se o lançamento pertence ao cliente autenticado
  return { _id: id, cliente: new mongoose.Types.ObjectId(clienteId) };
}

function parseOptionalDate(query, name) { // Função para analisar uma data opcional nos parâmetros da query, garantindo que seja uma data válida no formato YYYY-MM-DD
  if (query[name] === undefined) {
    return { value: undefined };
  }

  const date = parseDate(query[name]);
  return date ? { value: date } : { error: `O filtro '${name}' deve ser uma data válida no formato YYYY-MM-DD.` };
}

router.use(authenticateToken, requireCustomer);

router.post("/", async (req, res) => {
  try {
    const validated = validateFields(req.body);
    if (validated.error) {
      return res.status(400).json({ error: validated.error });
    }

    const transacao = await Transacao.create({
      ...validated.value,
      cliente: new mongoose.Types.ObjectId(req.auth.id)
    });
    return res.status(201).json(transacao);
  } catch (err) {
    console.error("Erro ao criar lançamento:", err);
    return res.status(500).json({ error: "Erro ao criar lançamento." });
  }
});

router.get("/resumo-mensal", async (req, res) => {
  try {
    const mes = Number(req.query.mes);
    const ano = Number(req.query.ano);
    if (
      !/^\d{1,2}$/.test(String(req.query.mes ?? "")) ||
      !/^\d{4}$/.test(String(req.query.ano ?? "")) ||
      !Number.isInteger(mes) || mes < 1 || mes > 12 ||
      !Number.isInteger(ano) || ano < 1 || ano > 9999
    ) {
      return res.status(400).json({ error: "Informe mes (1-12) e ano (4 dígitos) válidos." });
    }

    const inicio = new Date(0);
    inicio.setUTCFullYear(ano, mes - 1, 1);
    inicio.setUTCHours(0, 0, 0, 0);
    const fim = new Date(inicio);
    fim.setUTCMonth(fim.getUTCMonth() + 1);
    const [resumo = {}] = await Transacao.aggregate([
      {
        $match: {
          cliente: new mongoose.Types.ObjectId(req.auth.id),
          data: { $gte: inicio, $lt: fim }
        }
      },
      {
        $group: {
          _id: null,
          receitas: {
            $sum: { $cond: [{ $eq: ["$tipo", "Receita"] }, "$valor", 0] }
          },
          despesas: {
            $sum: { $cond: [{ $eq: ["$tipo", "Despesa"] }, "$valor", 0] }
          }
        }
      }
    ]);
    const receitas = Math.round((resumo.receitas || 0) * 100) / 100;
    const despesas = Math.round((resumo.despesas || 0) * 100) / 100;

    return res.json({
      mes,
      ano,
      receitas,
      despesas,
      saldo: Math.round((receitas - despesas) * 100) / 100
    });
  } catch (err) {
    console.error("Erro ao gerar resumo mensal:", err);
    return res.status(500).json({ error: "Erro ao gerar resumo mensal." });
  }
});

router.get("/", async (req, res) => {
  try {
    const filtro = { cliente: new mongoose.Types.ObjectId(req.auth.id) };
    if (req.query.tipo !== undefined) {
      if (req.query.tipo !== "Receita" && req.query.tipo !== "Despesa") {
        return res.status(400).json({ error: "O filtro tipo deve ser 'Receita' ou 'Despesa'." });
      }
      filtro.tipo = req.query.tipo;
    }

    const desde = parseOptionalDate(req.query, "desde");
    const ate = parseOptionalDate(req.query, "ate");
    if (desde.error || ate.error) {
      return res.status(400).json({ error: desde.error || ate.error });
    }
    if (desde.value && ate.value && desde.value > ate.value) {
      return res.status(400).json({ error: "O filtro desde não pode ser posterior a ate." });
    }
    if (desde.value || ate.value) {
      filtro.data = {};
      if (desde.value) {
        filtro.data.$gte = desde.value;
      }
      if (ate.value) {
        filtro.data.$lt = new Date(ate.value.getTime() + 24 * 60 * 60 * 1000);
      }
    }

    const lancamentos = await Transacao.find(filtro).sort({ data: -1, _id: -1 });
    return res.json(lancamentos);
  } catch (err) {
    console.error("Erro ao listar lançamentos:", err);
    return res.status(500).json({ error: "Erro ao listar lançamentos." });
  }
});

router.get("/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "ID de lançamento inválido." });
    }
    const transacao = await Transacao.findOne(getOwnedQuery(req.params.id, req.auth.id));
    if (!transacao) {
      return res.status(404).json({ error: "Lançamento não encontrado." });
    }
    return res.json(transacao);
  } catch (err) {
    console.error("Erro ao buscar lançamento:", err);
    return res.status(500).json({ error: "Erro ao buscar lançamento." });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "ID de lançamento inválido." });
    }
    const validated = validateFields(req.body, { partial: true });
    if (validated.error) {
      return res.status(400).json({ error: validated.error });
    }

    const transacao = await Transacao.findOneAndUpdate(
      getOwnedQuery(req.params.id, req.auth.id),
      validated.value,
      { new: true, runValidators: true }
    );
    if (!transacao) {
      return res.status(404).json({ error: "Lançamento não encontrado." });
    }
    return res.json(transacao);
  } catch (err) {
    console.error("Erro ao atualizar lançamento:", err);
    return res.status(500).json({ error: "Erro ao atualizar lançamento." });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "ID de lançamento inválido." });
    }
    const transacao = await Transacao.findOneAndDelete(
      getOwnedQuery(req.params.id, req.auth.id)
    );
    if (!transacao) {
      return res.status(404).json({ error: "Lançamento não encontrado." });
    }
    return res.json({ message: "Lançamento excluído com sucesso." });
  } catch (err) {
    console.error("Erro ao excluir lançamento:", err);
    return res.status(500).json({ error: "Erro ao excluir lançamento." });
  }
});

module.exports = router;
