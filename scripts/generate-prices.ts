import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateAll, registrySource, serialisePriceFile } from "./generator/generate";

// Writes data/prices/*.json, data/indices/*.json and lib/data/seriesRegistry.ts.
// Deterministic: running it twice produces byte-identical files.

const root = process.cwd();
const data = generateAll();
mkdirSync(join(root, "data/prices"), { recursive: true });
mkdirSync(join(root, "data/indices"), { recursive: true });
for (const [ticker, file] of Object.entries(data.prices)) {
  writeFileSync(join(root, "data/prices", `${ticker}.json`), serialisePriceFile(file));
}
for (const [id, file] of Object.entries(data.indices)) {
  writeFileSync(join(root, "data/indices", `${id}.json`), serialisePriceFile(file));
}
writeFileSync(join(root, "lib/data/seriesRegistry.ts"), registrySource(data));
console.log(
  `Wrote ${Object.keys(data.prices).length} price files and ${Object.keys(data.indices).length} index files.`,
);
