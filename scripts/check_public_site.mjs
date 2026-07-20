import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = path.join(projectRoot, "dist-site");
const packageMetadata = JSON.parse(await readFile(path.join(projectRoot, "package.json"), "utf8"));
const requiredFiles = [
  ".nojekyll",
  "index.html",
  "assets/components.css",
  "assets/layout.css",
  "assets/margin-notes.png",
  "assets/margin-reader.png",
  "assets/og.png",
  "assets/responsive.css",
  "assets/tokens.css",
];
const forbiddenNames = new Set(["config.json", "pkcs11.txt"]);
const forbiddenText = [
  /\/Users\//,
  /HKU_Obsidian/i,
  /(?:api[_-]?key|secret|token)\s*[:=]\s*["'][^"']+/i,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
];

async function collectFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(path.join(directory, entry.name), relativePath));
    } else {
      files.push(relativePath);
    }
  }
  return files;
}

for (const file of requiredFiles) {
  await access(path.join(outputRoot, file));
}

const files = await collectFiles(outputRoot);
const requiredFileSet = new Set(requiredFiles);
const unexpectedFiles = files.filter((file) => !requiredFileSet.has(file));
if (unexpectedFiles.length) {
  throw new Error(`Unexpected files included in Pages artifact: ${unexpectedFiles.join(", ")}`);
}
for (const file of files) {
  if (forbiddenNames.has(path.posix.basename(file))) {
    throw new Error(`Private runtime file included in Pages artifact: ${file}`);
  }
}

const html = await readFile(path.join(outputRoot, "index.html"), "utf8");
if (!html.includes(`Margin v${packageMetadata.version}`) || html.includes("__MARGIN_VERSION__")) {
  throw new Error("The public version is not synchronized with package.json.");
}
if (/<script\b/i.test(html) || /<form\b/i.test(html) || /<input\b/i.test(html)) {
  throw new Error("The product site must not include scripts, forms, or input controls.");
}

for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
  const reference = match[1];
  if (/^(?:https?:|#)/.test(reference)) continue;
  if (reference.startsWith("/")) {
    throw new Error(`Root-relative asset is unsafe under /margin/: ${reference}`);
  }
  const target = reference.replace(/^\.\//, "").split(/[?#]/, 1)[0] || "index.html";
  const resolved = path.resolve(outputRoot, target);
  if (!resolved.startsWith(`${outputRoot}${path.sep}`)) {
    throw new Error(`Local link escapes the Pages artifact: ${reference}`);
  }
  await access(resolved);
}

for (const file of files.filter((name) => /\.(?:html|css|txt)$/i.test(name))) {
  const contents = await readFile(path.join(outputRoot, file), "utf8");
  for (const pattern of forbiddenText) {
    if (pattern.test(contents)) throw new Error(`Sensitive text matched in ${file}: ${pattern}`);
  }
}

console.log(`Verified ${files.length} public files for Margin ${packageMetadata.version}.`);
