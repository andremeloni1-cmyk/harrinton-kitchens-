// Import a company's rate sheet into the price list.
//
//   node scripts/import-prices.mjs scripts/data/harrington-prices.json harrington
//
// The second argument matches a LeadSource (company) by name/displayName.
// Idempotent: items are matched by name (case-insensitive). Existing items
// gain/refresh the company's rate override; new items are created with the
// rate as both the standard price and the company override.

import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const [, , dataPath, companyToken] = process.argv;
if (!dataPath || !companyToken) {
  console.error("Usage: node scripts/import-prices.mjs <data.json> <company>");
  process.exit(1);
}

const rows = JSON.parse(readFileSync(dataPath, "utf8"));
const prisma = new PrismaClient();

try {
  const sources = await prisma.leadSource.findMany();
  const token = companyToken.toLowerCase();
  const company = sources.find((s) =>
    `${s.name} ${s.displayName || ""}`.toLowerCase().includes(token)
  );
  if (!company) {
    console.error(`No company (LeadSource) matching "${companyToken}" found.`);
    console.error(`Known: ${sources.map((s) => s.displayName || s.name).join(", ")}`);
    process.exit(1);
  }
  console.log(`Importing ${rows.length} items for ${company.displayName || company.name}…`);

  const existing = await prisma.priceItem.findMany();
  let created = 0;
  let updated = 0;

  for (const row of rows) {
    const match = existing.find(
      (i) => i.name.trim().toLowerCase() === row.name.trim().toLowerCase()
    );
    if (match) {
      // Only add this company's rate override — never rewrite unit/category,
      // which are shared across every company that uses the item.
      const companyPrices = JSON.parse(match.companyPrices || "{}");
      companyPrices[company.id] = row.price;
      const updatedItem = await prisma.priceItem.update({
        where: { id: match.id },
        data: { companyPrices: JSON.stringify(companyPrices) },
      });
      // Reflect the change in the snapshot so a later duplicate row in the same
      // file updates the same item instead of creating a second one.
      match.companyPrices = updatedItem.companyPrices;
      updated++;
      console.log(`  ~ ${row.name} → ${company.displayName || company.name} rate $${row.price}`);
    } else {
      const createdItem = await prisma.priceItem.create({
        data: {
          name: row.name.trim(),
          unit: row.unit || "each",
          price: row.price,
          category: row.category || null,
          companyPrices: JSON.stringify({ [company.id]: row.price }),
        },
      });
      // Add to the snapshot so a duplicate-named row later in the file matches.
      existing.push(createdItem);
      created++;
      console.log(`  + ${row.name} ($${row.price} per ${row.unit || "each"})`);
    }
  }

  console.log(`Done: ${created} created, ${updated} updated.`);
} finally {
  await prisma.$disconnect();
}
