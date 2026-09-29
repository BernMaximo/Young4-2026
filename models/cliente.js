const mongoose = require('mongoose');
const clienteSchema = new mongoose.Schema({
   nome: { type: String },
   sobrenome: { type: String },
   cpf: { type: String, required: true, trim: true },
   genre: { type: String },
   senha: { type: String, required: true, select: false },
   createdAt: { type: Date, default: (Date.now) }
});
clienteSchema.set('toJSON', {
   transform: (_doc, ret) => {
      delete ret.senha;
      return ret;
   }
});
const Cliente = mongoose.model('Cliente', clienteSchema);

module.exports = Cliente;
