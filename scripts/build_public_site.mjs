import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(projectRoot, "site");
const outputRoot = path.join(projectRoot, "dist-site");
const packagePath = path.join(projectRoot, "package.json");
const versionToken = "__MARGIN_VERSION__";

const packageMetadata = JSON.parse(await readFile(packagePath, "utf8"));
const version = packageMetadata.version;

if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error("package.json must contain a semantic Margin version.");
}

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
await cp(sourceRoot, outputRoot, { recursive: true });

const indexPath = path.join(outputRoot, "index.html");
const indexSource = await readFile(indexPath, "utf8");

if (!indexSource.includes(versionToken)) {
  throw new Error(`site/index.html must contain ${versionToken}.`);
}

await writeFile(indexPath, indexSource.replaceAll(versionToken, version), "utf8");
await writeFile(path.join(outputRoot, ".nojekyll"), "", "utf8");

console.log(`Built Margin ${version} site at ${outputRoot}`);
