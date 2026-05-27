import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const appRoot = join(root, "..");
const source = join(appRoot, "src", "main", "preload.cjs");
const target = join(appRoot, "dist-electron", "main", "preload.cjs");

await mkdir(dirname(target), { recursive: true });
await copyFile(source, target);
