const mongoose = require('mongoose');

// O schema do cliente representa a identidade do usuário do sistema e guarda dados de acesso essenciais.
const clienteSchema = new mongoose.Schema({
   nome: { type: String },
   sobrenome: { type: String },
   cpf: { type: String, required: true, trim: true },
   genre: { type: String },
   senha: { type: String, required: true, select: false },
   createdAt: { type: Date, default: (Date.now) }
});

// Ao serializar o documento, a senha é removida para evitar que ela seja exposta em respostas HTTP.
clienteSchema.set('toJSON', {
   transform: (_doc, ret) => {
      delete ret.senha;
      return ret;
   }
});
const Cliente = mongoose.model('Cliente', clienteSchema);

module.exports = Cliente;
