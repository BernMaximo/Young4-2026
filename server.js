require("dotenv").config(); // Carrega as variáveis de ambiente do arquivo .env

const express = require("express");
const connectDB = require("./config/config");
// const Cliente = require("./models/Cliente");
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Permite o parsing de dados de formulário

// Configuração do Swagger
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./docs/swagger.json');
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Chamada das rotas do cliente
const clienteRoutes = require('./routes/clienteRoutes');
app.use('/api', clienteRoutes);

const transacaoRoutes = require('./routes/transacaoRoutes');    // Adicionar a const transacaoRoutes para importar as rotas de transações
app.use('/api/transacoes', transacaoRoutes);

connectDB();

app.listen(3000, () => console.log("Server running on port 3000"));