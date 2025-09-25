const { GraphQLClient } = require("graphql-request");
const config = require("../config");

class ShopifyService {
  constructor() {
    this.client = new GraphQLClient(config.shopify.graphqlEndpoint, {
      headers: {
        "X-Shopify-Access-Token": config.shopify.adminApiAccessToken,
        "Content-Type": "application/json",
      },
    });
  }

  /**
   * Create a staged upload for file uploads
   */
  async createStagedUpload(filename, mimeType, fileSize) {
    const mutation = `
      mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets {
            url
            resourceUrl
            parameters {
              name
              value
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    // Determine resource type based on MIME type
    let resource = "FILE";
    if (mimeType.startsWith("image/")) {
      resource = "PRODUCT_IMAGE";
    } else if (mimeType.startsWith("video/")) {
      resource = "VIDEO";
    }

    const input = {
      filename: filename,
      mimeType: mimeType,
      resource: resource,
      httpMethod: "POST",
    };

    // Add fileSize for VIDEO and MODEL_3D resources
    if (resource === "VIDEO" || resource === "MODEL_3D") {
      input.fileSize = fileSize.toString();
    }

    const variables = {
      input: [input],
    };

    try {
      console.log("[Shopify] stagedUploadsCreate input:", JSON.stringify(variables, null, 2));
      const response = await this.client.request(mutation, variables);

      if (response.stagedUploadsCreate.userErrors.length > 0) {
        throw new Error(
          `Shopify API Error: ${response.stagedUploadsCreate.userErrors
            .map((error) => error.message)
            .join(", ")}`
        );
      }

      const target = response.stagedUploadsCreate.stagedTargets[0];
      console.log("[Shopify] stagedUploadsCreate target:", {
        url: target?.url,
        resourceUrl: target?.resourceUrl,
        paramCount: target?.parameters?.length,
      });
      return target;
    } catch (error) {
      console.error("Error creating staged upload:", error);
      throw new Error(`Failed to create staged upload: ${error.message}`);
    }
  }

  /**
   * Upload file to staged URL
   */
  async uploadFileToStagedUrl(stagedTarget, fileData) {
    try {
      // For Node.js, we need to use a different approach
      const fetch = require("node-fetch");
      const FormData = require("form-data");

      const formData = new FormData();

      // Add parameters from staged target
      stagedTarget.parameters.forEach((param) => {
        formData.append(param.name, param.value);
      });

      // Add the file buffer
      formData.append("file", fileData.buffer, {
        filename: fileData.name,
        contentType: fileData.type,
      });

      console.log("[Shopify] Uploading to staged URL:", stagedTarget.url);
      const response = await fetch(stagedTarget.url, {
        method: "POST",
        body: formData,
        headers: formData.getHeaders(),
      });

      if (!response.ok) {
        const text = await response.text();
        console.error("[Shopify] Upload failed status/text:", response.status, text);
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      console.log("[Shopify] Upload success, resourceUrl:", stagedTarget.resourceUrl);
      return stagedTarget.resourceUrl;
    } catch (error) {
      console.error("Error uploading file:", error);
      throw new Error(`Failed to upload file: ${error.message}`);
    }
  }

  /**
   * Create a file record in Shopify
   */
  async createFileRecord(resourceUrl, filename, mimeType) {
    const mutation = `
      mutation fileCreate($files: [FileCreateInput!]!) {
        fileCreate(files: $files) {
          files {
            id
            fileStatus
            ... on MediaImage {
              id
              image {
                url
              }
            }
            ... on Video {
              id
              sources {
                url
                mimeType
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    // Convert MIME type to Shopify enum
    let contentType = "FILE";
    if (mimeType.startsWith("image/")) {
      contentType = "IMAGE";
    } else if (mimeType.startsWith("video/")) {
      contentType = "VIDEO";
    }

    const fileInput = {
      originalSource: resourceUrl,
      contentType: contentType,
    };

    // Only add filename if it's provided (not null for videos)
    if (filename) {
      fileInput.filename = filename;
    }

    const variables = {
      files: [fileInput],
    };

    try {
      console.log("[Shopify] fileCreate variables:", JSON.stringify(variables, null, 2));

      const response = await this.client.request(mutation, variables);

      if (response.fileCreate.userErrors.length > 0) {
        console.error("[Shopify] fileCreate userErrors:", response.fileCreate.userErrors);
        throw new Error(
          `Shopify API Error: ${response.fileCreate.userErrors
            .map((error) => error.message)
            .join(", ")}`
        );
      }

      console.log("[Shopify] File record created:", response.fileCreate.files[0]);
      return response.fileCreate.files[0];
    } catch (error) {
      console.error("Error creating file record:", error);
      throw new Error(`Failed to create file record: ${error.message}`);
    }
  }

  /**
   * Process file upload (staged upload → upload → create file record)
   */
  async processFileUpload(fileData, filename, mimeType) {
    try {
      console.log(`[Shopify] Starting file upload: ${filename} (${mimeType}, ${fileData.size} bytes)`);

      // Step 1: Create staged upload
      const stagedTarget = await this.createStagedUpload(
        filename,
        mimeType,
        fileData.size
      );

      console.log("[Shopify] Staged target created:", {
        url: stagedTarget.url,
        resourceUrl: stagedTarget.resourceUrl,
        parameters: stagedTarget.parameters,
      });

      // Step 2: Upload file to staged URL
      await this.uploadFileToStagedUrl(stagedTarget, fileData);

      // Step 3: Construct the proper resource URL
      const keyParam = stagedTarget.parameters.find((p) => p.name === "key");
      let resourceUrl;
      let stagedFilename;

      // For videos, use the resourceUrl directly (it includes external_video_id)
      // For images, construct the URL with the key
      if (stagedTarget.resourceUrl.includes("external_video_id")) {
        resourceUrl = stagedTarget.resourceUrl;
        // For videos, don't provide a filename - let Shopify handle it
        stagedFilename = null;
      } else {
        const baseUrl = stagedTarget.url.endsWith("/")
          ? stagedTarget.url.slice(0, -1)
          : stagedTarget.url;
        resourceUrl = `${baseUrl}/${keyParam.value}`;
        // For images, extract filename from the key
        stagedFilename = keyParam ? keyParam.value.split("/").pop() : filename;
      }

      console.log("[Shopify] Constructed resource URL:", resourceUrl);
      console.log("[Shopify] Using filename for fileCreate:", stagedFilename);

      const fileRecord = await this.createFileRecord(
        resourceUrl,
        stagedFilename,
        mimeType
      );

      console.log("[Shopify] File record id:", fileRecord.id);
      return fileRecord.id;
    } catch (error) {
      console.error("Error processing file upload:", error);
      throw new Error(`Failed to process file upload: ${error.message}`);
    }
  }

  /**
   * Create a new product rating metaobject
   */
  async createProductRating(ratingData) {
    const mutation = `
      mutation metaobjectCreate($metaobject: MetaobjectCreateInput!) {
        metaobjectCreate(metaobject: $metaobject) {
          metaobject {
            id
            handle
            type
            fields {
              key
              value
            }
            capabilities {
              publishable {
                status
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const fields = [
      { key: "product_id", value: ratingData.productId.toString() },
      { key: "rating", value: ratingData.rating.toString() },
      { key: "title", value: ratingData.title },
      { key: "body", value: ratingData.body },
      { key: "author_name", value: ratingData.authorName },
      { key: "author_email", value: ratingData.authorEmail },
      {
        key: "is_verified_buyer",
        value: ratingData.isVerifiedBuyer.toString(),
      },
      { key: "is_approved", value: "false" }, // Default to false for moderation
      { key: "created_at", value: new Date().toISOString() },
      { key: "age_range", value: ratingData.ageRange || "" },
      { key: "size_purchased", value: ratingData.sizePurchased || "" },
      { key: "fit_rating", value: ratingData.fitRating?.toString() || "" },
      {
        key: "shipping_rating",
        value: ratingData.shippingRating?.toString() || "",
      },
      {
        key: "recommends_product",
        value: ratingData.recommendsProduct?.toString() || "false",
      },
    ];

    // Process image upload if provided
    if (ratingData.image) {
      try {
        console.log("[createProductRating] Processing image upload...");
        const imageFileId = await this.processFileUpload(
          ratingData.image,
          `review-image-${Date.now()}.jpg`,
          "image/jpeg"
        );
        fields.push({ key: "image", value: imageFileId });
        console.log("[createProductRating] Image file id:", imageFileId);
      } catch (error) {
        console.error("Error processing image upload:", error);
        // Continue without image if upload fails
      }
    }

    // Process video upload if provided
    if (ratingData.video) {
      try {
        console.log("[createProductRating] Processing video upload...");
        const videoFileId = await this.processFileUpload(
          ratingData.video,
          `review-video-${Date.now()}.mp4`,
          "video/mp4"
        );
        fields.push({ key: "video", value: videoFileId });
        console.log("[createProductRating] Video file id:", videoFileId);
      } catch (error) {
        console.error("Error processing video upload:", error);
        // Continue without video if upload fails
      }
    }

    const variables = {
      metaobject: {
        type: "product_rating",
        fields: fields,
        capabilities: {
          publishable: {
            status: "ACTIVE",
          },
        },
      },
    };

    try {
      console.log("[Shopify] metaobjectCreate variables:", JSON.stringify(variables, null, 2));
      const response = await this.client.request(mutation, variables);

      if (response.metaobjectCreate.userErrors.length > 0) {
        throw new Error(
          `Shopify API Error: ${response.metaobjectCreate.userErrors
            .map((e) => e.message)
            .join(", ")}`
        );
      }

      const created = response.metaobjectCreate.metaobject;
      console.log("[Shopify] metaobjectCreate result id:", created?.id);
      return created;
    } catch (error) {
      console.error("Error creating product rating:", error);
      throw new Error(`Failed to create product rating: ${error.message}`);
    }
  }

  /**
   * Link a rating metaobject to a product's metafield
   */
  async linkRatingToProduct(productId, ratingMetaobjectId) {
    // First, get the existing ratings metafield
    const existingRatings = await this.getExistingRatings(productId);

    // Add the new rating to the existing list
    const updatedRatings = [...existingRatings, ratingMetaobjectId];

    const mutation = `
      mutation productUpdate($input: ProductInput!) {
        productUpdate(input: $input) {
          product {
            id
            metafields(first: 10) {
              edges {
                node {
                  id
                  namespace
                  key
                  value
                }
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
      input: {
        id: `gid://shopify/Product/${productId}`,
        metafields: [
          {
            namespace: "custom",
            key: "ratings",
            value: JSON.stringify(updatedRatings),
            type: "list.metaobject_reference",
          },
        ],
      },
    };

    try {
      const response = await this.client.request(mutation, variables);

      if (response.productUpdate.userErrors.length > 0) {
        throw new Error(
          `Shopify API Error: ${response.productUpdate.userErrors
            .map((e) => e.message)
            .join(", ")}`
        );
      }

      return response.productUpdate.product;
    } catch (error) {
      console.error("Error linking rating to product:", error);
      throw new Error(`Failed to link rating to product: ${error.message}`);
    }
  }

  /**
   * Get existing ratings from a product's metafield
   */
  async getExistingRatings(productId) {
    const query = `
      query getProduct($id: ID!) {
        product(id: $id) {
          metafield(namespace: "custom", key: "ratings") {
            value
          }
        }
      }
    `;

    try {
      const response = await this.client.request(query, {
        id: `gid://shopify/Product/${productId}`,
      });

      if (response.product.metafield && response.product.metafield.value) {
        // Parse the existing JSON array
        return JSON.parse(response.product.metafield.value);
      }

      // Return empty array if no existing ratings
      return [];
    } catch (error) {
      console.error("Error fetching existing ratings:", error);
      // Return empty array on error
      return [];
    }
  }

  /**
   * Get product ratings for a specific product
   */
  async getProductRatings(productId) {
    const query = `
      query getProduct($id: ID!) {
        product(id: $id) {
          id
          title
          metafield(namespace: "custom", key: "ratings") {
            value
          }
          metafields(first: 50, namespace: "custom") {
            edges {
              node {
                id
                namespace
                key
                value
                type
              }
            }
          }
        }
      }
    `;

    try {
      const response = await this.client.request(query, {
        id: `gid://shopify/Product/${productId}`,
      });

      return response.product;
    } catch (error) {
      console.error("Error fetching product ratings:", error);
      throw new Error(`Failed to fetch product ratings: ${error.message}`);
    }
  }

  /**
   * Get reviews for a specific product
   */
  async getProductReviews(productId) {
    try {
      // First get the product's ratings metafield
      const product = await this.getProductRatings(productId);

      if (!product) {
        return [];
      }

      // Find the ratings metafield
      const ratingsMetafield = product.metafields.edges.find(
        (edge) => edge.node.key === "ratings"
      );

      if (!ratingsMetafield || !ratingsMetafield.node.value) {
        return [];
      }

      // Parse the metafield value to get metaobject IDs
      let metaobjectIds = [];
      try {
        const parsedValue = JSON.parse(ratingsMetafield.node.value);
        metaobjectIds = Array.isArray(parsedValue)
          ? parsedValue
          : [parsedValue];
      } catch (error) {
        console.error("Error parsing ratings metafield:", error);
        return [];
      }

      if (metaobjectIds.length === 0) {
        return [];
      }

      // Fetch the actual metaobject data for each ID
      const reviews = [];
      for (const metaobjectId of metaobjectIds) {
        try {
          const review = await this.getMetaobjectById(metaobjectId);
          if (review) {
            reviews.push(review);
          }
        } catch (error) {
          console.error(`Error fetching metaobject ${metaobjectId}:`, error);
        }
      }

      return reviews;
    } catch (error) {
      console.error("Error fetching product reviews:", error);
      throw new Error(`Failed to fetch product reviews: ${error.message}`);
    }
  }

  /**
   * Get a specific metaobject by ID
   */
  async getMetaobjectById(metaobjectId) {
    const query = `
      query getMetaobject($id: ID!) {
        metaobject(id: $id) {
          id
          handle
          type
          fields {
            key
            value
          }
        }
      }
    `;

    try {
      const response = await this.client.request(query, { id: metaobjectId });

      if (!response.metaobject) {
        return null;
      }

      // Convert fields array to object
      const fields = {};
      response.metaobject.fields.forEach((field) => {
        fields[field.key] = field.value;
      });

      return {
        id: response.metaobject.id,
        handle: response.metaobject.handle,
        type: response.metaobject.type,
        ...fields,
        // Convert string values to appropriate types
        rating: parseInt(fields.rating) || 0,
        fitRating: fields.fit_rating ? parseInt(fields.fit_rating) : null,
        shippingRating: fields.shipping_rating
          ? parseInt(fields.shipping_rating)
          : null,
        isVerifiedBuyer: fields.is_verified_buyer === "true",
        isApproved: fields.is_approved === "true",
        recommendsProduct: fields.recommends_product === "true",
        createdAt: fields.created_at,
        authorName: fields.author_name,
        authorEmail: fields.author_email,
        title: fields.title,
        body: fields.body,
        ageRange: fields.age_range || null,
        sizePurchased: fields.size_purchased || null,
        image: fields.image || null,
        video: fields.video || null,
      };
    } catch (error) {
      console.error("Error fetching metaobject by ID:", error);
      return null;
    }
  }

  /**
   * Get all product ratings metaobjects
   */
  async getAllProductRatings(first = 50, after = null) {
    const query = `
      query getProductRatings($first: Int!, $after: String) {
        metaobjects(type: "product_rating", first: $first, after: $after) {
          edges {
            node {
              id
              handle
              type
              fields {
                key
                value
              }
            }
            cursor
          }
          pageInfo {
            hasNextPage
            hasPreviousPage
            startCursor
            endCursor
          }
        }
      }
    `;

    try {
      const response = await this.client.request(query, { first, after });
      return response.metaobjects;
    } catch (error) {
      console.error("Error fetching all product ratings:", error);
      throw new Error(`Failed to fetch product ratings: ${error.message}`);
    }
  }

  /**
   * Update a product rating (for moderation)
   */
  async updateProductRating(ratingId, updates) {
    const mutation = `
      mutation metaobjectUpdate($id: ID!, $metaobject: MetaobjectUpdateInput!) {
        metaobjectUpdate(id: $id, metaobject: $metaobject) {
          metaobject {
            id
            handle
            type
            fields {
              key
              value
            }
            capabilities {
              publishable {
                status
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const fields = [];
    const metaobjectInput = {};

    // Handle status updates separately from field updates
    if (updates.status !== undefined) {
      metaobjectInput.capabilities = {
        publishable: {
          status: updates.status.toUpperCase(),
        },
      };
      // Remove status from field updates
      delete updates.status;
    }

    // Handle field updates
    Object.keys(updates).forEach((key) => {
      if (updates[key] !== undefined && updates[key] !== null) {
        fields.push({
          key: key,
          value: updates[key].toString(),
        });
      }
    });

    if (fields.length > 0) {
      metaobjectInput.fields = fields;
    }

    const variables = {
      id: ratingId,
      metaobject: metaobjectInput,
    };

    try {
      const response = await this.client.request(mutation, variables);

      if (response.metaobjectUpdate.userErrors.length > 0) {
        throw new Error(
          `Shopify API Error: ${response.metaobjectUpdate.userErrors
            .map((e) => e.message)
            .join(", ")}`
        );
      }

      return response.metaobjectUpdate.metaobject;
    } catch (error) {
      console.error("Error updating product rating:", error);
      throw new Error(`Failed to update product rating: ${error.message}`);
    }
  }

  /**
   * Publish a draft metaobject to active status
   */
  async publishMetaobject(metaobjectId) {
    return await this.updateProductRating(metaobjectId, { status: "ACTIVE" });
  }

  /**
   * Publish all draft product rating metaobjects to active status
   */
  async publishAllDraftRatings() {
    try {
      // Get all draft metaobjects
      const allRatings = await this.getAllProductRatings(250); // Get up to 250 at once
      const draftRatings = [];

      // Check each rating for draft status
      for (const edge of allRatings.edges) {
        try {
          const fullMetaobject = await this.getMetaobjectById(edge.node.id);
          // If we can't determine status or it's draft, include it for publishing
          if (
            !fullMetaobject ||
            !fullMetaobject.status ||
            fullMetaobject.status !== "ACTIVE"
          ) {
            draftRatings.push(edge.node.id);
          }
        } catch (error) {
          console.error(`Error checking status for ${edge.node.id}:`, error);
          // Include it anyway to be safe
          draftRatings.push(edge.node.id);
        }
      }

      console.log(`Found ${draftRatings.length} draft ratings to publish`);

      // Publish each draft rating
      const results = [];
      for (const ratingId of draftRatings) {
        try {
          const result = await this.publishMetaobject(ratingId);
          results.push({ id: ratingId, success: true, result });
          console.log(`Successfully published rating: ${ratingId}`);
        } catch (error) {
          console.error(`Failed to publish rating ${ratingId}:`, error);
          results.push({ id: ratingId, success: false, error: error.message });
        }
      }

      return {
        totalProcessed: draftRatings.length,
        successful: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
        results,
      };
    } catch (error) {
      console.error("Error publishing all draft ratings:", error);
      throw new Error(`Failed to publish draft ratings: ${error.message}`);
    }
  }

  /**
   * Delete a product rating
   */
  async deleteProductRating(ratingId) {
    const mutation = `
      mutation metaobjectDelete($id: ID!) {
        metaobjectDelete(id: $id) {
          deletedId
          userErrors {
            field
            message
          }
        }
      }
    `;

    try {
      const response = await this.client.request(mutation, { id: ratingId });

      if (response.metaobjectDelete.userErrors.length > 0) {
        throw new Error(
          `Shopify API Error: ${response.metaobjectDelete.userErrors
            .map((e) => e.message)
            .join(", ")}`
        );
      }

      return response.metaobjectDelete.deletedId;
    } catch (error) {
      console.error("Error deleting product rating:", error);
      throw new Error(`Failed to delete product rating: ${error.message}`);
    }
  }
}

module.exports = new ShopifyService();
