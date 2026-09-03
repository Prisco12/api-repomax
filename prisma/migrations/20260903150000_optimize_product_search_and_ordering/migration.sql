CREATE EXTENSION IF NOT EXISTS pg_trgm;

DROP INDEX IF EXISTS "Product_status_isFeatured_sortOrder_idx";

CREATE INDEX "Product_createdAt_desc_idx"
ON "Product"("createdAt" DESC);

CREATE INDEX "Product_public_catalog_order_idx"
ON "Product"("status", "isFeatured" DESC, "sortOrder" ASC, "createdAt" DESC);

CREATE INDEX "Product_name_trgm_idx"
ON "Product" USING GIN ("name" gin_trgm_ops);

CREATE INDEX "Product_slug_trgm_idx"
ON "Product" USING GIN ("slug" gin_trgm_ops);

CREATE INDEX "Product_sku_trgm_idx"
ON "Product" USING GIN ("sku" gin_trgm_ops);

CREATE INDEX "Product_shortDescription_trgm_idx"
ON "Product" USING GIN ("shortDescription" gin_trgm_ops);
