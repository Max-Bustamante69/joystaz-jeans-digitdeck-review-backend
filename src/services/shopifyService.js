const config = require("../config");
const fetch = require("node-fetch"); // node-fetch para versiones antiguas de Node.js o para ser explícito

const SHOPIFY_API_BASE_URL = `https://${config.shopify.storeDomain}/admin/api/${config.shopify.apiVersion}`;

const shopifyService = {
  async createMetaobjectEntry(reviewData) {
    try {
      const endpoint = `${SHOPIFY_API_BASE_URL}/metaobjects.json`;
      const {
        shopifyProductId,
        rating,
        title,
        body,
        authorName,
        authorEmail,
        isVerifiedBuyer,
        isApproved,
        imageUrl,
      } = reviewData;

      const payload = {
        metaobject: {
          definition: "product_review", // Handle de tu definición de metaobject
          fields: [
            { key: "product_id", value: String(shopifyProductId) }, // Shopify usa ID como string en la API a veces
            { key: "rating", value: String(rating) }, // Rating field might be int or string, be consistent
            { key: "title", value: title || "" },
            { key: "body", value: body },
            { key: "author_name", value: authorName },
            { key: "author_email", value: authorEmail || "" },
            { key: "is_verified_buyer", value: String(isVerifiedBuyer) },
            { key: "is_approved", value: String(isApproved) },
            { key: "created_at", value: new Date().toISOString() },
            ...(imageUrl ? [{ key: "image", value: imageUrl }] : []), // Add image field if present
          ],
        },
      };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "X-Shopify-Access-Token": config.shopify.accessToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error("Error creating Metaobject entry:", data.errors);
        throw new Error(`Shopify API error: ${JSON.stringify(data.errors)}`);
      }

      return data.metaobject;
    } catch (error) {
      console.error("Failed to create Metaobject entry:", error);
      throw error;
    }
  },

  async updateProductMetafields(
    shopifyProductId,
    newRating,
    currentReviewCount
  ) {
    try {
      const endpoint = `${SHOPIFY_API_BASE_URL}/products/${shopifyProductId}/metafields.json`;

      // Fetch existing metafields to calculate new average
      const existingMetafieldsResponse = await fetch(endpoint, {
        method: "GET",
        headers: {
          "X-Shopify-Access-Token": config.shopify.accessToken,
          "Content-Type": "application/json",
        },
      });
      const existingMetafieldsData = await existingMetafieldsResponse.json();

      let existingRatingSum = 0;
      let existingRatingCount = 0;

      const ratingMetafield = existingMetafieldsData.metafields.find(
        (mf) => mf.key === "rating" && mf.namespace === "reviews"
      );
      const countMetafield = existingMetafieldsData.metafields.find(
        (mf) => mf.key === "rating_count" && mf.namespace === "reviews"
      );

      if (ratingMetafield) {
        existingRatingSum =
          parseFloat(ratingMetafield.value) *
          parseInt(countMetafield.value || 0);
        existingRatingCount = parseInt(countMetafield.value || 0);
      }

      const newTotalRatingSum = existingRatingSum + newRating;
      const newTotalReviewCount = existingRatingCount + 1;
      const newAverageRating =
        newTotalReviewCount > 0
          ? (newTotalRatingSum / newTotalReviewCount).toFixed(1)
          : newRating.toFixed(1);

      const metafields = [
        {
          namespace: "reviews",
          key: "rating",
          value: String(newAverageRating),
          type: "number_decimal",
          owner_resource: "product",
          owner_id: shopifyProductId,
        },
        {
          namespace: "reviews",
          key: "rating_count",
          value: String(newTotalReviewCount),
          type: "number_integer",
          owner_resource: "product",
          owner_id: shopifyProductId,
        },
      ];

      // Shopify API requires updating one metafield at a time, or using the bulk API
      // For simplicity, we'll send two separate PUT requests or use a more recent metafields update API
      // Note: direct update via PUT with specific ID for each metafield is more reliable.
      // Let's create/update using PUT if ID exists, or POST if not.

      const results = [];
      for (const mf of metafields) {
        const existing = existingMetafieldsData.metafields.find(
          (e_mf) => e_mf.namespace === mf.namespace && e_mf.key === mf.key
        );

        let res;
        if (existing) {
          // Update existing metafield
          res = await fetch(
            `${SHOPIFY_API_BASE_URL}/metafields/${existing.id}.json`,
            {
              method: "PUT",
              headers: {
                "X-Shopify-Access-Token": config.shopify.accessToken,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ metafield: mf }),
            }
          );
        } else {
          // Create new metafield
          res = await fetch(`${SHOPIFY_API_BASE_URL}/metafields.json`, {
            method: "POST",
            headers: {
              "X-Shopify-Access-Token": config.shopify.accessToken,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ metafield: mf }),
          });
        }
        results.push(await res.json());
        if (!res.ok) {
          console.error(
            `Error updating metafield ${mf.key}:`,
            results[results.length - 1].errors
          );
          throw new Error(
            `Shopify API error: ${JSON.stringify(
              results[results.length - 1].errors
            )}`
          );
        }
      }

      return { newAverageRating, newTotalReviewCount };
    } catch (error) {
      console.error("Failed to update product metafields:", error);
      throw error;
    }
  },
};

module.exports = shopifyService;
