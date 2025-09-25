const express = require("express");
const reviewController = require("../controllers/reviewController");
const rateLimit = require("express-rate-limit");
const config = require("../config");

const router = express.Router();

// Rate limiting for review creation
const createReviewLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // limit each IP to 20 review submissions per hour
  message: {
    success: false,
    message: "Too many review submissions, please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting for general API calls
const generalLimiter = rateLimit(config.rateLimit);

// Apply general rate limiting to all routes
router.use(generalLimiter);

/**
 * @route POST /api/reviews
 * @desc Create a new product review
 * @access Public (with rate limiting)
 */
router.post("/", createReviewLimiter, reviewController.createReview);

/**
 * @route GET /api/reviews/product/:productId
 * @desc Get all reviews for a specific product
 * @access Public
 */
router.get("/product/:productId", reviewController.getProductReviews);

/**
 * @route GET /api/reviews/stats/:productId
 * @desc Get review statistics for a product
 * @access Public
 */
router.get("/stats/:productId", reviewController.getReviewStats);

/**
 * @route GET /api/reviews
 * @desc Get all reviews (for admin use)
 * @access Public (should be protected in production)
 */
router.get("/", reviewController.getAllReviews);

/**
 * @route PUT /api/reviews/:ratingId
 * @desc Update a review (for moderation)
 * @access Public (should be protected in production)
 */
router.put("/:ratingId", reviewController.updateReview);

/**
 * @route DELETE /api/reviews/:ratingId
 * @desc Delete a review
 * @access Public (should be protected in production)
 */
router.delete("/:ratingId", reviewController.deleteReview);

/**
 * @route PUT /api/reviews/:ratingId/publish
 * @desc Publish a specific review (change from draft to active)
 * @access Public (should be protected in production)
 */
router.put("/:ratingId/publish", reviewController.publishReview);

/**
 * @route POST /api/reviews/publish-all-drafts
 * @desc Publish all draft reviews (change from draft to active)
 * @access Public (should be protected in production)
 */
router.post("/publish-all-drafts", reviewController.publishAllDraftReviews);

module.exports = router;
