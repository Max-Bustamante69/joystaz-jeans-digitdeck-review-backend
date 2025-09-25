const shopifyService = require("../services/shopifyService");
const Joi = require("joi");

// Helper function to convert base64 to File object
function convertBase64ToFile(base64Data, type, mimeType) {
  try {
    // Remove data URL prefix if present
    const base64String = base64Data.replace(/^data:[^;]+;base64,/, "");

    // Convert base64 to buffer
    const buffer = Buffer.from(base64String, "base64");

    // Create a File-like object
    const file = {
      buffer: buffer,
      size: buffer.length,
      type: mimeType,
      name: `${type}-${Date.now()}.${mimeType.split("/")[1]}`,
      stream: () => require("stream").Readable.from(buffer),
    };

    return file;
  } catch (error) {
    console.error("Error converting base64 to file:", error);
    throw new Error("Invalid file data");
  }
}

// Validation schemas
const createReviewSchema = Joi.object({
  productId: Joi.number().integer().positive().required(),
  rating: Joi.number().integer().min(1).max(5).required(),
  title: Joi.string().min(1).max(200).required(),
  body: Joi.string().min(1).max(2000).required(),
  authorName: Joi.string().min(1).max(100).required(),
  authorEmail: Joi.string().email().required(),
  isVerifiedBuyer: Joi.boolean().default(false),
  ageRange: Joi.string().max(50).optional(),
  sizePurchased: Joi.string().max(50).optional(),
  fitRating: Joi.number().integer().min(1).max(5).required(),
  shippingRating: Joi.number().integer().min(1).max(5).optional(),
  recommendsProduct: Joi.boolean().optional(),
  image: Joi.string().optional(), // Base64 encoded image
  video: Joi.string().optional(), // Base64 encoded video
});

const updateReviewSchema = Joi.object({
  isApproved: Joi.boolean().optional(),
  rating: Joi.number().integer().min(1).max(5).optional(),
  title: Joi.string().min(1).max(200).optional(),
  body: Joi.string().min(1).max(2000).optional(),
});

class ReviewController {
  /**
   * Create a new product review
   */
  async createReview(req, res) {
    try {
      // Validate input
      const { error, value } = createReviewSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          message: "Validation error",
          errors: error.details.map((detail) => detail.message),
        });
      }

      // Process file uploads - convert base64 to File objects
      if (value.image) {
        console.log("[createReview] Incoming image payload detected (base64 length):", value.image.length);
        value.image = convertBase64ToFile(value.image, "image", "image/jpeg");
        console.log("[createReview] Image file prepared:", {
          name: value.image.name,
          sizeBytes: value.image.size,
          mimeType: value.image.type,
        });
      }

      if (value.video) {
        console.log("[createReview] Incoming video payload detected (base64 length):", value.video.length);
        value.video = convertBase64ToFile(value.video, "video", "video/mp4");
        console.log("[createReview] Video file prepared:", {
          name: value.video.name,
          sizeBytes: value.video.size,
          mimeType: value.video.type,
        });
      }

      // Create the metaobject
      const ratingMetaobject = await shopifyService.createProductRating(value);
      console.log("[createReview] Metaobject created:", {
        id: ratingMetaobject.id,
        handle: ratingMetaobject.handle,
        type: ratingMetaobject.type,
        fields: ratingMetaobject.fields,
      });

      // Link the rating to the product
      await shopifyService.linkRatingToProduct(
        value.productId,
        ratingMetaobject.id
      );

      // Extract uploaded file IDs (if present in fields)
      const fieldMap = {};
      try {
        ratingMetaobject.fields.forEach((f) => {
          fieldMap[f.key] = f.value;
        });
      } catch (_) {}

      res.status(201).json({
        success: true,
        message: "Review created successfully",
        data: {
          ratingId: ratingMetaobject.id,
          productId: value.productId,
          status: "pending_approval",
          imageFileId: fieldMap.image || null,
          videoFileId: fieldMap.video || null,
        },
      });
    } catch (error) {
      console.error("Error creating review:", error);
      res.status(500).json({
        success: false,
        message: "Failed to create review",
        error: error.message,
      });
    }
  }

  /**
   * Get reviews for a specific product
   */
  async getProductReviews(req, res) {
    try {
      const { productId } = req.params;

      if (!productId || isNaN(productId)) {
        return res.status(400).json({
          success: false,
          message: "Valid product ID is required",
        });
      }

      const reviews = await shopifyService.getProductReviews(productId);

      res.json({
        success: true,
        data: reviews,
      });
    } catch (error) {
      console.error("Error fetching product reviews:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch product reviews",
        error: error.message,
      });
    }
  }

  /**
   * Get all reviews (for admin/moderator use)
   */
  async getAllReviews(req, res) {
    try {
      const { page = 1, limit = 20 } = req.query;
      const first = parseInt(limit);
      const after = page > 1 ? req.query.cursor : null;

      const result = await shopifyService.getAllProductRatings(first, after);

      const reviews = result.edges.map((edge) => {
        const fields = {};
        edge.node.fields.forEach((field) => {
          fields[field.key] = field.value;
        });

        return {
          id: edge.node.id,
          handle: edge.node.handle,
          ...fields,
        };
      });

      res.json({
        success: true,
        data: {
          reviews: reviews,
          pagination: {
            hasNextPage: result.pageInfo.hasNextPage,
            hasPreviousPage: result.pageInfo.hasPreviousPage,
            startCursor: result.pageInfo.startCursor,
            endCursor: result.pageInfo.endCursor,
          },
        },
      });
    } catch (error) {
      console.error("Error fetching all reviews:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch reviews",
        error: error.message,
      });
    }
  }

  /**
   * Update a review (for moderation)
   */
  async updateReview(req, res) {
    try {
      const { ratingId } = req.params;

      if (!ratingId) {
        return res.status(400).json({
          success: false,
          message: "Rating ID is required",
        });
      }

      // Validate input
      const { error, value } = updateReviewSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          message: "Validation error",
          errors: error.details.map((detail) => detail.message),
        });
      }

      const updatedRating = await shopifyService.updateProductRating(
        ratingId,
        value
      );

      res.json({
        success: true,
        message: "Review updated successfully",
        data: updatedRating,
      });
    } catch (error) {
      console.error("Error updating review:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update review",
        error: error.message,
      });
    }
  }

  /**
   * Delete a review
   */
  async deleteReview(req, res) {
    try {
      const { ratingId } = req.params;

      if (!ratingId) {
        return res.status(400).json({
          success: false,
          message: "Rating ID is required",
        });
      }

      const deletedId = await shopifyService.deleteProductRating(ratingId);

      res.json({
        success: true,
        message: "Review deleted successfully",
        data: { deletedId },
      });
    } catch (error) {
      console.error("Error deleting review:", error);
      res.status(500).json({
        success: false,
        message: "Failed to delete review",
        error: error.message,
      });
    }
  }

  /**
   * Get review statistics for a product
   */
  async getReviewStats(req, res) {
    try {
      const { productId } = req.params;

      if (!productId || isNaN(productId)) {
        return res.status(400).json({
          success: false,
          message: "Valid product ID is required",
        });
      }

      const reviews = await shopifyService.getProductReviews(productId);

      // Filter only approved reviews
      const approvedReviews = reviews.filter((review) => review.isApproved);

      // Calculate statistics
      const totalReviews = approvedReviews.length;
      const averageRating =
        totalReviews > 0
          ? approvedReviews.reduce((sum, review) => sum + review.rating, 0) /
            totalReviews
          : 0;

      const ratingDistribution = {};
      [1, 2, 3, 4, 5].forEach((rating) => {
        ratingDistribution[rating] = approvedReviews.filter(
          (review) => review.rating === rating
        ).length;
      });

      const verifiedBuyers = approvedReviews.filter(
        (review) => review.isVerifiedBuyer
      ).length;
      const recommendations = approvedReviews.filter(
        (review) => review.recommendsProduct
      ).length;

      res.json({
        success: true,
        data: {
          productId: parseInt(productId),
          totalReviews,
          averageRating: Math.round(averageRating * 10) / 10,
          ratingDistribution,
          verifiedBuyers,
          recommendations,
          recommendationRate:
            totalReviews > 0
              ? Math.round((recommendations / totalReviews) * 100)
              : 0,
        },
      });
    } catch (error) {
      console.error("Error fetching review stats:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch review statistics",
        error: error.message,
      });
    }
  }

  /**
   * Publish a specific review (change from draft to active)
   */
  async publishReview(req, res) {
    try {
      const { ratingId } = req.params;

      if (!ratingId) {
        return res.status(400).json({
          success: false,
          message: "Rating ID is required",
        });
      }

      const publishedReview = await shopifyService.publishMetaobject(ratingId);

      res.json({
        success: true,
        message: "Review published successfully",
        data: publishedReview,
      });
    } catch (error) {
      console.error("Error publishing review:", error);
      res.status(500).json({
        success: false,
        message: "Failed to publish review",
        error: error.message,
      });
    }
  }

  /**
   * Publish all draft reviews (change from draft to active)
   */
  async publishAllDraftReviews(req, res) {
    try {
      const result = await shopifyService.publishAllDraftRatings();

      res.json({
        success: true,
        message: `Published ${result.successful} out of ${result.totalProcessed} draft reviews`,
        data: result,
      });
    } catch (error) {
      console.error("Error publishing all draft reviews:", error);
      res.status(500).json({
        success: false,
        message: "Failed to publish draft reviews",
        error: error.message,
      });
    }
  }
}

module.exports = new ReviewController();