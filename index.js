const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.json({
    status: 'online',
    message: 'Ricart Labs API está operando',
    version: '1.0.0'
  });
});

app.listen(port, () => {
  console.log(`Servidor corriendo en el puerto ${port}`);
});