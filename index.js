const express = require('express');
const path = require('path');
const app = express();

const __path = process.cwd();
const PORT = process.env.PORT || 8000;

// Increase EventEmitter limit if needed
require('events').EventEmitter.defaultMaxListeners = 500;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use('/qr', require('./qr'));
app.use('/code', require('./pair'));

app.get('/pair', (req, res) => {
  res.sendFile(path.join(__path, 'pair.html'), (err) => {
    if (err) res.status(404).send('File not found');
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__path, 'main.html'), (err) => {
    if (err) res.status(404).send('File not found');
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

module.exports = app;