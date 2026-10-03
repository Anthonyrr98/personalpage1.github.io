import { spawn } from "node:child_process";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import chokidar from "chokidar";
import EleventyDevServer from "@11ty/eleventy-dev-server";

const { values } = parseArgs({ options: { port: { type: "string", default: "8080" }, config: { type: "string" } } });
const port = Number(values.port);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("Preview port must be between 0 and 65535.");
const root = process.cwd();
const cli = fileURLToPath(new URL("../cmd.cjs", import.meta.resolve("@11ty/eleventy")));
const config = path.resolve(root, values.config || "eleventy.config.js");
const changes = new Set();
let timer;
let buildChild;
let currentBuild;
let server;
let closing = false;

// A fresh process performs every full build. Eleventy's watch cache can retain
// renamed/deleted Windows paths, and its unlink event alone does not rebuild.
async function build() {
  if (currentBuild || closing) return;
  const files = [...changes];
  changes.clear();
  currentBuild = new Promise((resolve) => {
    buildChild = spawn(process.execPath, [cli, `--config=${config}`], { cwd: root, stdio: "inherit", windowsHide: true });
    buildChild.once("error", error => { console.error(error); resolve(false); });
    buildChild.once("exit", code => resolve(code === 0));
  });
  const success = await currentBuild;
  currentBuild = undefined;
  buildChild = undefined;
  if (success) {
    console.log("[dev] Build complete.");
    server?.reload({ files });
  } else if (!closing) {
    console.error("[dev] Build failed. Waiting for the next source change.");
  }
  if (changes.size && !closing) scheduleBuild();
  return success;
}

function scheduleBuild() {
  clearTimeout(timer);
  timer = setTimeout(() => { void build(); }, 200);
}

const watcher = chokidar.watch(["src", "assets", "media", "highlight", "scripts", config, "verification.html"], {
  cwd: root, ignoreInitial: true,
  ignored: ["**/.git/**", "**/node_modules/**", "**/_site/**", "**/.cache/**", "**/*.tmp"],
  awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 25 },
});
watcher.on("all", (event, file) => {
  if (!["add", "change", "unlink", "addDir", "unlinkDir"].includes(event)) return;
  console.log(`[dev] ${event}: ${file}`);
  changes.add(file);
  scheduleBuild();
});
watcher.on("error", error => { console.error(error); });

async function stop() {
  if (closing) return;
  closing = true;
  clearTimeout(timer);
  await watcher.close();
  if (buildChild?.exitCode === null) buildChild.kill();
  await currentBuild;
  await server?.close();
}
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => { void stop().then(() => process.exit(0)); });
}

await new Promise(resolve => watcher.once("ready", resolve));
await build();
server = EleventyDevServer.getServer("site-preview", "_site", { port });
server.serve(port);
await server.ready();
console.log("[dev] Watching source files, including additions and deletions.");
