const mongoose = require('mongoose');

// Centraliza a conexão com o MongoDB para que o restante da aplicação não precise repetir a URL da base.
const connectDB = async () => {
 try {
   await mongoose.connect('mongodb://localhost:27017/LivrariaDB');
   console.log('MongoDB conectado!');
 } catch (err) {
   console.error('Erro ao conectar ao MongoDB:', err);
   process.exit(1);
 }
};


module.exports = connectDB;