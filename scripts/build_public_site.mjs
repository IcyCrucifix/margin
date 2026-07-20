import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(projectRoot, "site");
const outputRoot = path.join(projectRoot, "dist-site");
const packagePath = path.join(projectRoot, "package.json");
const versionToken = "__MARGIN_VERSION__";
const workspaceFiles = [
  "api-client.js",
  "app.js",
  "connection.css",
  "editor-bundle.js",
  "i18n.js",
  "index.html",
  "styles.css",
  "workspace-connection.js",
];

const packageMetadata = JSON.parse(await readFile(packagePath, "utf8"));
const version = packageMetadata.version;

if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error("package.json must contain a semantic Margin version.");
}

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
await cp(sourceRoot, outputRoot, { recursive: true });

const workspaceOutput = path.join(outputRoot, "workspace");
await mkdir(workspaceOutput, { recursive: true });
for (const file of workspaceFiles) {
  await cp(path.join(projectRoot, "web", file), path.join(workspaceOutput, file));
}

const localeNames = ["en", "zh-Hans"];
const localeCatalogs = Object.fromEntries(await Promise.all(localeNames.map(async (locale) => [
  locale,
  JSON.parse(await readFile(path.join(projectRoot, "web", "locales", `${locale}.json`), "utf8")),
])));
await writeFile(
  path.join(workspaceOutput, "locales.js"),
  `window.MarginLocaleCatalogs = Object.freeze(${JSON.stringify(localeCatalogs)});\n`,
  "utf8",
);

const workspaceIndexPath = path.join(workspaceOutput, "index.html");
const workspaceIndex = await readFile(workspaceIndexPath, "utf8");
const localeMarker = "<!-- __PUBLIC_LOCALES__ -->";
const publicModeMarker = "<!-- __PUBLIC_MODE__ -->";
const localConnectPolicy = "connect-src 'self' http://127.0.0.1:4317";
if (!workspaceIndex.includes(localeMarker) || !workspaceIndex.includes(publicModeMarker)) {
  throw new Error("web/index.html must contain the public build markers.");
}
if (!workspaceIndex.includes(localConnectPolicy)) {
  throw new Error("web/index.html must contain the local companion connection policy.");
}
await writeFile(
  workspaceIndexPath,
  workspaceIndex
    .replace(localeMarker, '<script src="./locales.js" defer></script>')
    .replace(publicModeMarker, '<meta name="margin-public-workspace" content="1" />')
    .replace(localConnectPolicy, "connect-src http://127.0.0.1:4317"),
  "utf8",
);

const indexPath = path.join(outputRoot, "index.html");
const indexSource = await readFile(indexPath, "utf8");

if (!indexSource.includes(versionToken)) {
  throw new Error(`site/index.html must contain ${versionToken}.`);
}

await writeFile(indexPath, indexSource.replaceAll(versionToken, version), "utf8");
await writeFile(path.join(outputRoot, ".nojekyll"), "", "utf8");

console.log(`Built Margin ${version} site at ${outputRoot}`);
