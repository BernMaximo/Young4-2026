const assert = require("node:assert/strict");
const { test } = require("node:test");
const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const Transacao = require("../models/transacao");
const transacaoRoutes = require("../routes/transacaoRoutes");

test("transaction routes validate input, protect access and isolate each user's data", async () => {
  const secretOriginal = process.env.JWT_SECRET;
  const secret = "transaction-api-test-secret-at-least-32-bytes";
  const userId = "64a000000000000000000001";
  const otherUserId = "64a000000000000000000002";
  const transactionId = "64b000000000000000000001";
  const originalMethods = {
    create: Transacao.create,
    find: Transacao.find,
    aggregate: Transacao.aggregate,
    findOne: Transacao.findOne,
    findOneAndUpdate: Transacao.findOneAndUpdate,
    findOneAndDelete: Transacao.findOneAndDelete
  };
  const calls = {};
  const record = {
    _id: new mongoose.Types.ObjectId(transactionId),
    cliente: new mongoose.Types.ObjectId(userId),
    tipo: "Receita",
    valor: 120.5,
    data: new Date("2026-09-29T00:00:00.000Z")
  };

  process.env.JWT_SECRET = secret;
  Transacao.create = async (data) => {
    calls.create = data;
    return { ...data, _id: new mongoose.Types.ObjectId(transactionId) };
  };
  Transacao.find = (query) => ({
    sort: async (sort) => {
      calls.find = { query, sort };
      return [record];
    }
  });
  Transacao.aggregate = async (pipeline) => {
    calls.aggregate = pipeline;
    return [{ receitas: 120.5, despesas: 30.25 }];
  };
  Transacao.findOne = async (query) => {
    calls.findOne = query;
    return String(query.cliente) === userId ? record : null;
  };
  Transacao.findOneAndUpdate = async (query, updates, options) => {
    calls.update = { query, updates, options };
    return String(query.cliente) === userId ? { ...record, ...updates } : null;
  };
  Transacao.findOneAndDelete = async (query) => {
    calls.delete = query;
    return String(query.cliente) === userId ? record : null;
  };

  const app = express();
  app.use(express.json());
  app.use("/api/transacoes", transacaoRoutes);
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/transacoes`;
  const tokenFor = (subject) => jwt.sign({}, secret, { subject, expiresIn: "1h" });
  const request = (path, { method = "GET", token, body } = {}) => fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });

  try {
    const unauthorized = await request("/");
    assert.equal(unauthorized.status, 401);

    const adminToken = jwt.sign(
      { tokenType: "access", role: "admin" },
      secret,
      { subject: "admin", expiresIn: "1h" }
    );
    assert.equal((await request("/", { token: adminToken })).status, 403);

    const userToken = tokenFor(userId);
    const invalidBody = await request("/", {
      method: "POST",
      token: userToken,
      body: { tipo: "Receita", valor: -10, data: "2026-09-29" }
    });
    assert.equal(invalidBody.status, 400);
    const forgedOwner = await request("/", {
      method: "POST",
      token: userToken,
      body: {
        tipo: "Receita",
        valor: 10,
        data: "2026-09-29",
        cliente: otherUserId
      }
    });
    assert.equal(forgedOwner.status, 400);
    const invalidDate = await request("/", {
      method: "POST",
      token: userToken,
      body: { tipo: "Receita", valor: 10, data: "2026-02-30" }
    });
    assert.equal(invalidDate.status, 400);

    const created = await request("/", {
      method: "POST",
      token: userToken,
      body: { tipo: "Receita", valor: 120.5, data: "2026-09-29", descricao: "Salário" }
    });
    assert.equal(created.status, 201);
    assert.equal(String(calls.create.cliente), userId);
    assert.equal(calls.create.valor, 120.5);

    const listing = await request("/?tipo=Despesa&desde=2026-09-01&ate=2026-09-30", {
      token: userToken
    });
    assert.equal(listing.status, 200);
    assert.equal(String(calls.find.query.cliente), userId);
    assert.equal(calls.find.query.tipo, "Despesa");
    assert.equal(calls.find.query.data.$gte.toISOString(), "2026-09-01T00:00:00.000Z");
    assert.equal(calls.find.query.data.$lt.toISOString(), "2026-10-01T00:00:00.000Z");

    const summary = await request("/resumo-mensal?mes=9&ano=2026", { token: userToken });
    assert.equal(summary.status, 200);
    assert.deepEqual(await summary.json(), {
      mes: 9,
      ano: 2026,
      receitas: 120.5,
      despesas: 30.25,
      saldo: 90.25
    });
    const match = calls.aggregate[0].$match;
    assert.equal(String(match.cliente), userId);
    assert.equal(match.data.$gte.toISOString(), "2026-09-01T00:00:00.000Z");
    assert.equal(match.data.$lt.toISOString(), "2026-10-01T00:00:00.000Z");
    assert.equal((await request("/resumo-mensal?mes=13&ano=2026", { token: userToken })).status, 400);

    assert.equal((await request(`/${transactionId}`, { token: userToken })).status, 200);
    assert.equal(String(calls.findOne.cliente), userId);
    const otherUserToken = tokenFor(otherUserId);
    assert.equal((await request(`/${transactionId}`, { token: otherUserToken })).status, 404);
    assert.equal(String(calls.findOne.cliente), otherUserId);

    const update = await request(`/${transactionId}`, {
      method: "PATCH",
      token: userToken,
      body: { valor: 150 }
    });
    assert.equal(update.status, 200);
    assert.equal(String(calls.update.query.cliente), userId);
    assert.equal(calls.update.updates.valor, 150);
    assert.equal(calls.update.options.runValidators, true);
    assert.equal((await request(`/${transactionId}`, {
      method: "PATCH",
      token: otherUserToken,
      body: { valor: 150 }
    })).status, 404);
    assert.equal(String(calls.update.query.cliente), otherUserId);

    assert.equal((await request(`/${transactionId}`, {
      method: "DELETE",
      token: userToken
    })).status, 200);
    assert.equal(String(calls.delete.cliente), userId);
    assert.equal((await request(`/${transactionId}`, {
      method: "DELETE",
      token: otherUserToken
    })).status, 404);
    assert.equal(String(calls.delete.cliente), otherUserId);

    const earlyYearSummary = await request("/resumo-mensal?mes=2&ano=0001", {
      token: userToken
    });
    assert.equal(earlyYearSummary.status, 200);
    assert.equal(calls.aggregate[0].$match.data.$gte.toISOString(), "0001-02-01T00:00:00.000Z");
  } finally {
    await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
    for (const [method, original] of Object.entries(originalMethods)) {
      Transacao[method] = original;
    }
    if (secretOriginal === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = secretOriginal;
    }
  }
});

test("transaction model requires an owner and rejects non-positive amounts", async () => {
  const missingOwner = new Transacao({
    tipo: "Receita",
    valor: 12.5,
    data: new Date("2026-09-29T00:00:00.000Z")
  });
  const missingOwnerError = await missingOwner.validate().then(() => null, (err) => err);
  assert.ok(missingOwnerError.errors.cliente);

  const invalidAmount = new Transacao({
    cliente: new mongoose.Types.ObjectId(),
    tipo: "Despesa",
    valor: 0,
    data: new Date("2026-09-29T00:00:00.000Z")
  });
  const invalidAmountError = await invalidAmount.validate().then(() => null, (err) => err);
  assert.ok(invalidAmountError.errors.valor);
});
