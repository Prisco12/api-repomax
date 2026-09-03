import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, ProductStatus } from '../src/generated/prisma/client';

const PRODUCT_PREFIX = 'repomax-perf-product-';
const CATEGORY_PREFIX = 'repomax-perf-category-';
const SKU_PREFIX = 'PERF-';
const DEFAULT_PRODUCTS = 10_000;
const DEFAULT_CATEGORIES = 100;
const BATCH_SIZE = 1_000;

function integerArgument(name: string, fallback: number) {
  const argument = process.argv.find((value) => value.startsWith(`--${name}=`));
  if (!argument) return fallback;
  const parsed = Number(argument.slice(argument.indexOf('=') + 1));
  if (!Number.isInteger(parsed) || parsed <= 0)
    throw new Error(`--${name} must be a positive integer`);
  return parsed;
}

function batches<T>(items: T[], size = BATCH_SIZE) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size)
    result.push(items.slice(index, index + size));
  return result;
}

function suffix(index: number, total: number) {
  return String(index + 1).padStart(String(total).length, '0');
}

function statusFor(index: number) {
  const bucket = index % 10;
  if (bucket < 7) return ProductStatus.PUBLISHED;
  if (bucket < 9) return ProductStatus.DRAFT;
  return ProductStatus.ARCHIVED;
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

async function seed() {
  const productCount = integerArgument('products', DEFAULT_PRODUCTS);
  const categoryCount = integerArgument('categories', DEFAULT_CATEGORIES);
  if (categoryCount < 5)
    throw new Error(
      '--categories must be at least 5 to build realistic relations',
    );

  console.log(
    `Preparing ${productCount} products and ${categoryCount} categories...`,
  );
  await prisma.category.createMany({
    data: Array.from({ length: categoryCount }, (_, index) => {
      const id = suffix(index, categoryCount);
      return {
        name: `Performance Category ${id}`,
        slug: `${CATEGORY_PREFIX}${id}`,
        description: 'Generated exclusively for RepoMax performance tests.',
        isActive: index % 10 !== 9,
        sortOrder: index,
      };
    }),
    skipDuplicates: true,
  });

  const productRows = Array.from({ length: productCount }, (_, index) => {
    const id = suffix(index, productCount);
    const status = statusFor(index);
    return {
      name: `Performance Product ${id}`,
      slug: `${PRODUCT_PREFIX}${id}`,
      sku: `${SKU_PREFIX}${id}`,
      shortDescription: `Performance catalog item ${id} for search and pagination tests.`,
      description:
        'Synthetic RepoMax product generated for local capacity testing. It can be safely removed with perf:cleanup.',
      status,
      isFeatured: index % 20 === 0 && status === ProductStatus.PUBLISHED,
      sortOrder: index % 500,
      price: ((index % 50_000) / 100 + 10).toFixed(2),
      showPrice: true,
      specifications: {
        source: 'performance-seed',
        reference: id,
        application: index % 2 ? 'Dianteira' : 'Traseira',
      },
      publishedAt: status === ProductStatus.PUBLISHED ? new Date() : null,
    };
  });
  for (const [index, batch] of batches(productRows).entries()) {
    await prisma.product.createMany({ data: batch, skipDuplicates: true });
    console.log(
      `Products: ${Math.min((index + 1) * BATCH_SIZE, productCount)}/${productCount}`,
    );
  }

  const [categories, products] = await Promise.all([
    prisma.category.findMany({
      where: { slug: { startsWith: CATEGORY_PREFIX } },
      select: { id: true },
      orderBy: { slug: 'asc' },
    }),
    prisma.product.findMany({
      where: {
        slug: { startsWith: PRODUCT_PREFIX },
        sku: { startsWith: SKU_PREFIX },
      },
      select: { id: true, slug: true },
      orderBy: { slug: 'asc' },
    }),
  ]);

  const assignments = products.flatMap((product, productIndex) => {
    const relationCount = 2 + (productIndex % 4);
    return Array.from({ length: relationCount }, (_, relationIndex) => ({
      productId: product.id,
      categoryId:
        categories[(productIndex * 7 + relationIndex * 13) % categories.length]
          .id,
      sortOrder: relationIndex,
    }));
  });
  for (const batch of batches(assignments, 5_000))
    await prisma.productCategory.createMany({
      data: batch,
      skipDuplicates: true,
    });

  await prisma.productImage.deleteMany({
    where: { objectKey: { startsWith: 'performance/' } },
  });
  const images = products
    .filter((_, index) => index % 10 < 3)
    .flatMap((product) =>
      [0, 1].map((imageIndex) => ({
        productId: product.id,
        objectKey: `performance/${product.slug}/image-${imageIndex + 1}.webp`,
        altText: `Synthetic image ${imageIndex + 1} for ${product.slug}`,
        sortOrder: imageIndex,
        isPrimary: imageIndex === 0,
      })),
    );
  for (const batch of batches(images, 5_000))
    await prisma.productImage.createMany({ data: batch, skipDuplicates: true });

  const totals = await Promise.all([
    prisma.product.count({ where: { slug: { startsWith: PRODUCT_PREFIX } } }),
    prisma.category.count({ where: { slug: { startsWith: CATEGORY_PREFIX } } }),
    prisma.productCategory.count({
      where: { product: { slug: { startsWith: PRODUCT_PREFIX } } },
    }),
    prisma.productImage.count({
      where: { product: { slug: { startsWith: PRODUCT_PREFIX } } },
    }),
  ]);
  console.log(
    `Performance data ready: ${totals[0]} products, ${totals[1]} categories, ${totals[2]} assignments and ${totals[3]} image metadata rows.`,
  );
}

async function cleanup() {
  const products = await prisma.product.count({
    where: {
      slug: { startsWith: PRODUCT_PREFIX },
      sku: { startsWith: SKU_PREFIX },
    },
  });
  const categories = await prisma.category.count({
    where: { slug: { startsWith: CATEGORY_PREFIX } },
  });
  const deletedProducts = await prisma.product.deleteMany({
    where: {
      slug: { startsWith: PRODUCT_PREFIX },
      sku: { startsWith: SKU_PREFIX },
    },
  });
  const deletedCategories = await prisma.category.deleteMany({
    where: { slug: { startsWith: CATEGORY_PREFIX } },
  });
  console.log(
    `Removed ${deletedProducts.count}/${products} performance products and ${deletedCategories.count}/${categories} performance categories.`,
  );
}

async function main() {
  const command = process.argv[2] || 'seed';
  try {
    if (command === 'seed') await seed();
    else if (command === 'cleanup') await cleanup();
    else throw new Error('Use "seed" or "cleanup"');
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
