const prisma = require("../services/prismaService");
const shopifyService = require("../services/shopifyService");

const reviewController = {
  async submitReview(req, res) {
    try {
      const {
        shopifyProductId,
        rating,
        title,
        body,
        authorName,
        authorEmail,
        isVerifiedBuyer,
        imageUrl,
      } = req.body;

      if (!shopifyProductId || !rating || !body || !authorName) {
        return res
          .status(400)
          .json({ success: false, message: "Missing required fields." });
      }

      // 1. Guardar la reseña en tu base de datos (PostgreSQL)
      const newReview = await prisma.review.create({
        data: {
          shopifyProductId: BigInt(shopifyProductId), // Asegúrate de que Prisma maneja BigInt correctamente
          rating: parseInt(rating),
          title,
          body,
          authorName,
          authorEmail,
          isVerifiedBuyer: isVerifiedBuyer || false,
          isApproved: false, // Inicialmente no aprobada
          imageUrl,
        },
      });

      // 2. Crear una entrada en el Metaobject de Shopify
      const shopifyMetaobject = await shopifyService.createMetaobjectEntry({
        shopifyProductId,
        rating: parseInt(rating),
        title,
        body,
        authorName,
        authorEmail,
        isVerifiedBuyer: isVerifiedBuyer || false,
        isApproved: false, // Debe coincidir con la de DB
        imageUrl,
      });

      // Actualizar la reseña en la DB con el ID del Metaobject de Shopify
      await prisma.review.update({
        where: { id: newReview.id },
        data: { shopifyMetaobjectId: shopifyMetaobject.id },
      });

      // 3. Actualizar los metafields del producto para el promedio de rating (si la reseña está aprobada)
      // Aquí, en un sistema real, harías esto DESPUÉS de aprobar la reseña.
      // Para el propósito de esta demo local, la actualizaremos asumiendo aprobación.
      // Si quieres un sistema de moderación, moverías esta parte a una función de "aprobar reseña"
      // que se ejecutaría desde tu propio panel de administración o desde un script.

      const updatedProductMetafields =
        await shopifyService.updateProductMetafields(
          shopifyProductId,
          parseInt(rating)
          // Aquí necesitarías el currentReviewCount antes de añadir la nueva.
          // En un sistema robusto, la lógica de promedio debería ser calculada
          // con todas las reseñas aprobadas, no solo añadiendo.
          // Para esta demo, simplificamos asumiendo que el servicio calcula correctamente
          // al leer los metafields existentes.
        );

      res.status(201).json({
        success: true,
        message: "Review submitted and saved!",
        review: {
          id: newReview.id,
          shopifyMetaobjectId: shopifyMetaobject.id,
          ...newReview,
        },
        productMetafieldsUpdated: updatedProductMetafields,
      });
    } catch (error) {
      console.error("Error submitting review:", error);
      res
        .status(500)
        .json({
          success: false,
          message: "Internal server error",
          error: error.message,
        });
    }
  },

  // Aquí podrías añadir un endpoint para un panel de administración
  // donde apruebas reseñas y luego disparas la actualización de Metafields
  async approveReview(req, res) {
    // Implementación de aprobación de reseña y actualización de Metafields
    // Esto implicaría:
    // 1. Marcar la reseña como isApproved = true en tu DB y en el Metaobject de Shopify
    // 2. Recalcular y actualizar los metafields de rating en Shopify
  },
};

module.exports = reviewController;
