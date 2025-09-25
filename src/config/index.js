require("dotenv").config();

const config = {
  port: process.env.PORT || 3001,
  shopify: {
    storeDomain: process.env.SHOPIFY_STORE_DOMAIN,
    adminApiAccessToken: process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN,
    apiKey: process.env.SHOPIFY_API_KEY,
    secretApiKey: process.env.SHOPIFY_SECRET_API_KEY,
    apiVersion: "2024-01",
    graphqlEndpoint: `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2024-01/graphql.json`,
  },
  cors: {
    origin: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(",")
      : ["http://localhost:3000"],
    credentials: true,
  },
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
  },
  upload: {
    maxFileSize: 5 * 1024 * 1024, // 5MB
    allowedTypes: [
      "image/jpeg",
      "image/png",
      "image/gif",
      "video/mp4",
      "video/webm",
    ],
  },
};

// Validation
if (!config.shopify.storeDomain) {
  throw new Error("SHOPIFY_STORE_DOMAIN is required");
}
if (!config.shopify.adminApiAccessToken) {
  throw new Error("SHOPIFY_ADMIN_API_ACCESS_TOKEN is required");
}

module.exports = config;
