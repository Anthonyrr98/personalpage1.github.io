import { mkdir, realpath, rm } from "node:fs/promises";
import path from "node:path";

// Eleventy does not remove pages whose source was deleted or renamed. Only the
// project's disposable _site directory may be cleared before a full build.
export async function cleanGeneratedOutput(directory = "_site", { root = process.cwd() } = {}) {
  const project = path.resolve(root);
  const output = path.resolve(project, directory);
  if (output !== path.join(project, "_site")) {
    throw new Error(`Refusing to clean a directory other than the project's _site: ${output}`);
  }

  const canonicalProject = await realpath(project);
  try {
    const canonicalOutput = await realpath(output);
    if (path.relative(canonicalProject, canonicalOutput) !== "_site") {
      throw new Error(`Refusing to clean a redirected _site directory: ${output}`);
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
}
