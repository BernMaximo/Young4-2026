const assert = require("node:assert/strict");
const { test } = require("node:test");
const express = require("express");
const jwt = require("jsonwebtoken");
const Cliente = require("../models/cliente");
const clienteRoutes = require("../routes/clienteRoutes");

test("admin login, refresh and client management enforce roles", async () => {
  const originalEnv = {
    JWT_SECRET: process.env.JWT_SECRET,
    ADMIN_CPF: process.env.ADMIN_CPF,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD
  };
  const secret = "client-admin-test-secret-at-least-32-bytes";
  const adminPassword = "auth-route-test-password";
  const clientId = "64a000000000000000000001";
  const originalMethods = {
    find: Cliente.find,
    findById: Cliente.findById,
    findByIdAndUpdate: Cliente.findByIdAndUpdate,
    findByIdAndDelete: Cliente.findByIdAndDelete,
    save: Cliente.prototype.save
  };
  const calls = {};
  const client = { _id: clientId, nome: "Cliente", cpf: "12345678901" };

  process.env.JWT_SECRET = secret;
  process.env.ADMIN_CPF = "11122233344";
  process.env.ADMIN_PASSWORD = adminPassword;
  Cliente.find = async () => {
    calls.find = true;
    return [client];
  };
  Cliente.findById = async (id) => {
    calls.findById = id;
    return client;
  };
  Cliente.findByIdAndUpdate = async (id, updates, options) => {
    calls.update = { id, updates, options };
    return { ...client, ...updates };
  };
  Cliente.findByIdAndDelete = async (id) => {
    calls.delete = id;
    return client;
  };
  Cliente.prototype.save = async function save() {
    calls.create = this.toJSON();
    return this;
  };

  const app = express();
  app.use(express.json());
  app.use("/api", clienteRoutes);
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  const request = (path, { method = "GET", token, body } = {}) => fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const customerToken = jwt.sign(
    { tokenType: "access", role: "customer" },
    secret,
    { subject: clientId, expiresIn: "1h" }
  );
  const clientManagementRequests = [
    ["/clientes", { method: "POST", body: { cpf: "12345678901", senha: "senha" } }],
    ["/clientes"],
    [`/clientes/${clientId}`],
    [`/clientes/${clientId}`, { method: "PATCH", body: { nome: "Novo nome" } }],
    [`/clientes/${clientId}`, { method: "DELETE" }]
  ];

  try {
    assert.equal((await request("/admin/login", {
      method: "POST",
      body: { cpf: "11122233344", senha: "incorreta" }
    })).status, 401);

    const loginResponse = await request("/admin/login", {
      method: "POST",
      body: { cpf: "11122233344", senha: adminPassword }
    });
    assert.equal(loginResponse.status, 200);
    const login = await loginResponse.json();
    assert.ok(login.token);
    assert.ok(login.refreshToken);
    assert.equal(login.admin.cpf, "11122233344");
    const accessPayload = jwt.decode(login.token);
    const refreshPayload = jwt.decode(login.refreshToken);
    assert.equal(accessPayload.role, "admin");
    assert.equal(accessPayload.tokenType, "access");
    assert.equal(accessPayload.exp - accessPayload.iat, 60 * 60);
    assert.equal(refreshPayload.role, "admin");
    assert.equal(refreshPayload.tokenType, "refresh");
    assert.equal(refreshPayload.exp - refreshPayload.iat, 7 * 24 * 60 * 60);

    for (const [path, options] of clientManagementRequests) {
      assert.equal((await request(path, options)).status, 401);
      assert.equal((await request(path, { ...options, token: customerToken })).status, 403);
    }

    const created = await request("/clientes", {
      method: "POST",
      token: login.token,
      body: { cpf: "12345678901", senha: "senha", nome: "Novo cliente" }
    });
    assert.equal(created.status, 201);
    assert.equal(calls.create.cpf, "12345678901");

    assert.equal((await request("/clientes", { token: login.token })).status, 200);
    assert.equal(calls.find, true);
    assert.equal((await request(`/clientes/${clientId}`, { token: login.token })).status, 200);
    assert.equal(calls.findById, clientId);
    assert.equal((await request(`/clientes/${clientId}`, {
      method: "PATCH",
      token: login.token,
      body: { nome: "Novo nome" }
    })).status, 200);
    assert.equal(calls.update.id, clientId);
    assert.equal((await request(`/clientes/${clientId}`, {
      method: "DELETE",
      token: login.token
    })).status, 200);
    assert.equal(calls.delete, clientId);

    const refreshResponse = await request("/refresh-token", {
      method: "POST",
      body: { refreshToken: login.refreshToken }
    });
    assert.equal(refreshResponse.status, 200);
    const refreshed = await refreshResponse.json();
    assert.ok(refreshed.token);
    assert.ok(refreshed.refreshToken);
    assert.equal((await request("/clientes", { token: refreshed.token })).status, 200);
    assert.equal((await request("/refresh-token", {
      method: "POST",
      body: { refreshToken: login.token }
    })).status, 401);
    assert.equal((await request("/clientes", { token: login.refreshToken })).status, 401);
    assert.equal((await request("/refresh-token", {
      method: "POST",
      body: { refreshToken: "invalid" }
    })).status, 401);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
    for (const [method, original] of Object.entries(originalMethods)) {
      if (method === "save") {
        Cliente.prototype.save = original;
      } else {
        Cliente[method] = original;
      }
    }
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});
