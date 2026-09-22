const app = require('./app');

const PORT = 3001;

app.listen(PORT, () => {
  console.log(`Apartment Management API listening on port ${PORT}`);
});
