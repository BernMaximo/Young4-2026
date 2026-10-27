# Resumo do projeto e arquitetura

## Visão geral

O Young4-2026 é uma API REST para gerenciamento de clientes e finanças pessoais. Clientes autenticados podem registrar e consultar receitas e despesas, enquanto uma área administrativa permite gerenciar os cadastros de clientes.

## Tecnologias

- **Node.js** com módulos CommonJS.
- **Express 5** para o servidor HTTP e as rotas REST.
- **MongoDB** com **Mongoose** para persistência e validação dos documentos.
- **JWT** (`jsonwebtoken`) para autenticação, e **bcryptjs** para hash de senhas de clientes.
- **Swagger UI** para disponibilizar a documentação em `/api-docs`.
- **Node.js Test Runner** (`node --test`) para os testes automatizados.

## Organização e responsabilidades

O projeto segue uma estrutura modular simples, organizada por responsabilidade:

- [`server.js`](../server.js) inicializa o Express, configura a leitura de JSON e formulários, registra a documentação Swagger e monta os grupos de rotas. Também inicia a conexão com o MongoDB e escuta na porta `3000`.
- [`routes/clienteRoutes.js`](../routes/clienteRoutes.js) implementa login de clientes, login administrativo, renovação de tokens e operações administrativas sobre clientes.
- [`routes/transacaoRoutes.js`](../routes/transacaoRoutes.js) implementa criação, consulta, atualização, exclusão e resumo mensal de transações.
- [`middleware/auth.js`](../middleware/auth.js) cria e valida tokens JWT e aplica autorização por papel (`customer` ou `admin`).
- [`models/cliente.js`](../models/cliente.js) e [`models/transacao.js`](../models/transacao.js) definem os schemas Mongoose e as regras básicas dos documentos.
- [`config/config.js`](../config/config.js) centraliza a conexão com o banco.
- [`docs/swagger.json`](./swagger.json) descreve os endpoints; o Express publica essa especificação pela interface Swagger UI.
- [`test/`](../test/) contém testes das rotas de autenticação, administração e transações.

As rotas chamam os modelos Mongoose diretamente; no código atual, não há uma camada separada de serviços ou repositórios.

## Fluxo de uma requisição

1. O cliente HTTP envia uma requisição para o servidor Express.
2. O Express interpreta o corpo da requisição e encaminha a chamada ao grupo de rotas correspondente: `/api` ou `/api/transacoes`.
3. Nas rotas protegidas, o middleware valida o token `Bearer` e define a identidade e o papel autenticados.
4. As rotas validam os dados e as permissões e então leem ou alteram documentos por meio dos modelos Mongoose.
5. A API retorna uma resposta JSON com o resultado ou um erro HTTP apropriado.

## Dados principais

### Cliente

O documento de cliente contém nome, sobrenome, CPF, gênero (`genre`), senha e data de criação. O campo de senha não é selecionado por padrão e é removido na serialização JSON. Novas senhas são armazenadas com bcrypt; no login, senhas legadas em texto simples são reconhecidas e atualizadas para hash.

### Transação

Cada transação referencia o cliente proprietário e contém tipo (`Receita` ou `Despesa`), valor positivo, data e campos opcionais de descrição, tag e detalhes. Há um índice por cliente e data para apoiar consultas cronológicas. As operações de leitura e alteração restringem as consultas ao proprietário autenticado.

## Autenticação e autorização

- `POST /api/login` autentica clientes pelo CPF e senha.
- `POST /api/admin/login` autentica o administrador com `ADMIN_CPF` e `ADMIN_PASSWORD`.
- Os dois logins retornam um token de acesso válido por uma hora e um refresh token válido por sete dias.
- `POST /api/refresh-token` emite um novo par de tokens a partir de um refresh token válido.
- Os tokens são assinados com `JWT_SECRET`, que deve ter pelo menos 32 bytes.
- As operações de administração de clientes exigem token com papel `admin`; as rotas de transações exigem papel `customer`.

## Grupos de endpoints

| Grupo | Operações principais | Acesso |
|---|---|---|
| Autenticação (`/api`) | Login de cliente e administrador; renovação de tokens | Público, com credenciais ou refresh token |
| Clientes (`/api/clientes`) | Criar, listar, obter por ID, atualizar e excluir clientes | Administrador |
| Transações (`/api/transacoes`) | Criar, listar com filtros, obter por ID, atualizar e excluir lançamentos | Cliente autenticado; os dados ficam limitados ao próprio cliente |
| Resumo mensal (`/api/transacoes/resumo-mensal`) | Somar receitas, despesas e saldo por mês e ano | Cliente autenticado |

As datas dos lançamentos e filtros usam o formato `YYYY-MM-DD`; o resumo mensal trabalha com limites de calendário UTC. A lista de transações pode ser filtrada por tipo e intervalo de datas.

## Configuração e execução

O servidor carrega variáveis de ambiente com `dotenv`. Para autenticação, são usadas `JWT_SECRET`, `ADMIN_CPF` e `ADMIN_PASSWORD`. A conexão está configurada em [`config/config.js`](../config/config.js) para `mongodb://localhost:27017/LivrariaDB`, e a porta do servidor está definida como `3000` em [`server.js`](../server.js).

Com as dependências instaladas e o MongoDB disponível localmente:

```bash
npm start
```

Para executar os testes:

```bash
npm test
```

Os testes usam o test runner nativo do Node.js e cobrem autorização, validação, isolamento de dados por cliente e regras dos modelos. Os testes de rotas substituem operações dos modelos por implementações controladas, sem depender de uma instância MongoDB real.
