/**
 * Fetches the mihomo binary and stages it as a Tauri sidecar.
 *
 * The chain engine is a released binary rather than something we build, so
 * unlike the Aether core there is no source tree to compile -- but it still has
 * to arrive under the target-triple name Tauri expects, and it still has to be
 * pinned, or a release would silently pick up whatever upstream published that
 * morning.
 */
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { chmod, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createGunzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createReadStream } from "node:fs";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const option = (name) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
};

/** Pinned so a build is reproducible. Bump deliberately. */
const VERSION = "v1.19.30";

/**
 * The "compatible" builds avoid newer CPU instructions, which is the right
 * default for a client that has to run on whatever machine a user has.
 */
const ASSETS = {
  "x86_64-pc-windows-msvc": `mihomo-windows-amd64-compatible-${VERSION}.zip`,
  "aarch64-pc-windows-msvc": `mihomo-windows-arm64-${VERSION}.zip`,
  "x86_64-apple-darwin": `mihomo-darwin-amd64-compatible-${VERSION}.gz`,
  "aarch64-apple-darwin": `mihomo-darwin-arm64-${VERSION}.gz`,
  "x86_64-unknown-linux-gnu": `mihomo-linux-amd64-compatible-${VERSION}.gz`,
  "aarch64-unknown-linux-gnu": `mihomo-linux-arm64-${VERSION}.gz`,
};

const target = option("--target") ?? process.env.CARGO_BUILD_TARGET ?? rustHost();
const asset = ASSETS[target];
if (!asset) {
  throw new Error(
    `No mihomo build is mapped for ${target}. Add it to ASSETS, or the chain will be missing.`,
  );
}

const extension = target.includes("windows") ? ".exe" : "";
const destination = join(appRoot, "src-tauri", "binaries", `mihomo-${target}${extension}`);
await mkdir(dirname(destination), { recursive: true });

if (await isStaged(destination)) {
  console.log(`mihomo ${VERSION} already staged for ${target}`);
} else {
  const url = `https://github.com/MetaCubeX/mihomo/releases/download/${VERSION}/${asset}`;
  console.log(`Fetching ${asset}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }

  const scratch = `${destination}.download`;
  if (asset.endsWith(".gz")) {
    await pipeline(Readable.fromWeb(response.body), createGunzip(), createWriteStream(scratch));
  } else {
    // Node has no zip reader, and adding a dependency to unpack one file is a
    // poor trade. The platforms that ship zips all have a system unzip.
    const archive = `${destination}.zip`;
    await writeFile(archive, Buffer.from(await response.arrayBuffer()));
    unzipSingle(archive, scratch);
    await rm(archive, { force: true });
  }

  await rm(destination, { force: true });
  await writeFile(destination, await readFile(scratch));
  await rm(scratch, { force: true });
  if (!target.includes("windows")) await chmod(destination, 0o755);
}

const size = (await stat(destination)).size;
const digest = createHash("sha256");
await pipeline(createReadStream(destination), digest);
console.log(`Staged mihomo ${VERSION} for ${target}`);
console.log(`  ${destination}`);
console.log(`  ${(size / 1048576).toFixed(1)} MB  sha256:${digest.digest("hex").slice(0, 16)}…`);

async function isStaged(path) {
  try {
    return (await stat(path)).size > 1_000_000;
  } catch {
    return false;
  }
}

function unzipSingle(archive, into) {
  const script =
    `$e=[IO.Compression.ZipFile]::OpenRead('${archive}');` +
    `$f=$e.Entries|Where-Object{$_.Name -like '*.exe'}|Select-Object -First 1;` +
    `[IO.Compression.ZipFileExtensions]::ExtractToFile($f,'${into}',$true);$e.Dispose()`;
  execFileSync(
    "powershell",
    ["-NoProfile", "-Command", `Add-Type -AssemblyName System.IO.Compression.FileSystem; ${script}`],
    { stdio: "inherit" },
  );
}

function rustHost() {
  const output = execFileSync("rustc", ["-vV"], { encoding: "utf8", windowsHide: true });
  const host = output.match(/^host:\s*(.+)$/m)?.[1]?.trim();
  if (!host) throw new Error("Could not determine the Rust host target");
  return host;
}
