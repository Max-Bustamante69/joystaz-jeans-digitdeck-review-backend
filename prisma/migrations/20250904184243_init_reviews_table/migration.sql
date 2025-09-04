-- CreateTable
CREATE TABLE "public"."Review" (
    "id" TEXT NOT NULL,
    "shopifyProductId" BIGINT NOT NULL,
    "shopifyMetaobjectId" TEXT,
    "rating" INTEGER NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "authorEmail" TEXT,
    "isVerifiedBuyer" BOOLEAN NOT NULL DEFAULT false,
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "imageUrl" TEXT,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Review_shopifyMetaobjectId_key" ON "public"."Review"("shopifyMetaobjectId");
