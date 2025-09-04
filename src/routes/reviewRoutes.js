const express = require("express");
const router = express.Router();
const reviewController = require("../controllers/reviewController");

// Ruta para enviar una nueva reseña
router.post("/reviews", reviewController.submitReview);

// (Opcional) Ruta para aprobar una reseña
// router.put('/reviews/:id/approve', reviewController.approveReview);

module.exports = router;
