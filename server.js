require("dotenv").config(); // Carrega as variáveis de ambiente do arquivo .env

const express = require("express");
const connectDB = require("./config/config");
// const Cliente = require("./models/Cliente");
const app = express();

// Middleware
// O Express recebe JSON e dados de formulários para permitir a criação de clientes e autenticação via payloads de API.
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Permite o parsing de dados de formulário

// Configuração do Swagger
// A documentação da API fica acessível em /api-docs para facilitar testes e uso do backend por terceiros.
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./docs/swagger.json');
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Chamada das rotas do cliente
// A API agrupa os endpoints de clientes e finanças em namespaces distintos para separar responsabilidades.
const clienteRoutes = require('./routes/clienteRoutes');
app.use('/api', clienteRoutes);

const transacaoRoutes = require('./routes/transacaoRoutes');    // Adicionar a const transacaoRoutes para importar as rotas de transações
app.use('/api/transacoes', transacaoRoutes);

// A conexão com o MongoDB acontece ao subir o servidor, antes de receber requisições reais.
connectDB();

app.listen(3000, () => console.log("Server running on port 3000"));