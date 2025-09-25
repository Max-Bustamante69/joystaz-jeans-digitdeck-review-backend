const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const morgan = require("morgan");
const path = require("path");

const config = require("./config");
const reviewRoutes = require("./routes/reviewRoutes");

const app = express();

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
  })
);

// CORS configuration
app.use(cors(config.cors));

// Compression middleware
app.use(compression());

// Logging middleware
app.use(morgan("combined"));

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Static files (for serving uploaded files if needed)
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    service: "Shopify Review System",
    version: "1.0.0",
  });
});

// API routes
app.use("/api/reviews", reviewRoutes);

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    message: "Shopify Review System API",
    version: "1.0.0",
    endpoints: {
      health: "/health",
      reviews: "/api/reviews",
      createReview: "POST /api/reviews",
      getProductReviews: "GET /api/reviews/product/:productId",
      getReviewStats: "GET /api/reviews/stats/:productId",
      getAllReviews: "GET /api/reviews",
      updateReview: "PUT /api/reviews/:ratingId",
      deleteReview: "DELETE /api/reviews/:ratingId",
    },
  });
});

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    message: "Endpoint not found",
    path: req.originalUrl,
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("Global error handler:", err);

  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV === "development";

  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal server error",
    ...(isDevelopment && { stack: err.stack }),
  });
});

// Start server
const PORT = config.port;
app.listen(PORT, () => {
  console.log(`🚀 Shopify Review System API running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`📝 API documentation: http://localhost:${PORT}/`);
  console.log(`🔗 CORS enabled for: ${config.cors.origin.join(", ")}`);
});

module.exports = app;
