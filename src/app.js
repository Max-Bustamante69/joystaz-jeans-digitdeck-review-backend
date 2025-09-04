const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const config = require("./config");
const reviewRoutes = require("./routes/reviewRoutes");

const app = express();

// Middleware
app.use(bodyParser.json());

// Configuración de CORS
// Permitir solo orígenes específicos definidos en .env
app.use(cors({ origin: config.corsOrigin }));

// Rutas
app.use("/api", reviewRoutes); // Prefijo /api para todas las rutas de reseña

// Ruta de prueba
app.get("/", (req, res) => {
  res.send("Shopify Review Backend is running!");
});

// Iniciar servidor
app.listen(config.port, () => {
  console.log(`Backend server running on http://localhost:${config.port}`);
  console.log(`Allowed CORS origins: ${config.corsOrigin.join(", ")}`);
});
