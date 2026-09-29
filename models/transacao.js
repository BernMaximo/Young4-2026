const mongoose = require('mongoose');
const TransacaoSchema = new mongoose.Schema({
   cliente: { type: mongoose.Schema.Types.ObjectId, ref: 'Cliente', required: true },
   tipo: { type: String, enum: ['Receita', 'Despesa'], required: true },
   valor: { type: Number, required: true, min: 0.01 },
   data: { type: Date, required: true },
   descricao: { type: String, trim: true },
   tag: { type: String, trim: true },
   detalhes: { type: String, trim: true },
   createdAt: { type: Date, default: Date.now }
});
TransacaoSchema.index({ cliente: 1, data: -1 });
const Transacao = mongoose.model('Transacao', TransacaoSchema);

module.exports = Transacao;