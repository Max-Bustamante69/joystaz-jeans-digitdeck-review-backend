require("dotenv").config();

const config = {
  port: process.env.PORT || 3001,
  shopify: {
    storeDomain: process.env.SHOPIFY_STORE_DOMAIN,
    accessToken: process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN,
    apiVersion: process.env.SHOPIFY_API_VERSION,
  },
  corsOrigin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",") : [],
  databaseUrl: process.env.DATABASE_URL,
};

// Validar que las variables de Shopify estén presentes
if (
  !config.shopify.storeDomain ||
  !config.shopify.accessToken ||
  !config.shopify.apiVersion
) {
  console.error("Missing Shopify API credentials in .env file.");
  process.exit(1);
}

module.exports = config;
