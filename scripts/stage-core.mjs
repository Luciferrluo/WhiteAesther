import { constants } from "node:fs";
import { access, chmod, copyFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const option = (name) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
};

const target = option("--target") ?? process.env.CARGO_BUILD_TARGET ?? rustHost();
const extension = target.includes("windows") ? ".exe" : "";
const source = await findCore(extension);
const destination = join(appRoot, "src-tauri", "binaries", `aether-${target}${extension}`);
const version = execFileSync(source, ["--version"], {
  encoding: "utf8",
  timeout: 10_000,
  windowsHide: true,
}).trim();

if (!/^aether\s+\d+\.\d+\.\d+/.test(version)) {
  throw new Error(`${source} did not identify itself as an Aether executable`);
}

await mkdir(dirname(destination), { recursive: true });
if (resolve(source) !== resolve(destination)) await copyFile(source, destination);
if (!target.includes("windows")) await chmod(destination, 0o755);
console.log(`Staged ${version} for ${target}`);

function rustHost() {
  const output = execFileSync("rustc", ["-vV"], { encoding: "utf8", windowsHide: true });
  const host = output.match(/^host:\s*(.+)$/m)?.[1]?.trim();
  if (!host) throw new Error("Could not determine the Rust host target");
  return host;
}

async function findCore(binaryExtension) {
  const requested = option("--source") ?? process.env.AETHER_CORE_SOURCE ?? process.env.WHITEAESTHER_CORE_PATH;
  const candidates = [
    requested,
    join(appRoot, "..", "Aether", "aether", "target", "release", `aether${binaryExtension}`),
    join(appRoot, "..", "Aether", "aether", "target", "debug", `aether${binaryExtension}`),
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      return resolve(candidate);
    } catch {
      // Try the next explicit or conventional location.
    }
  }
  throw new Error("Aether core not found. Set AETHER_CORE_SOURCE or pass --source <path>.");
}
