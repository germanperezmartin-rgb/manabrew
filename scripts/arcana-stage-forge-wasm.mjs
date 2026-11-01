import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(root, "packages", "forge-wasm");
const manifest = JSON.parse(readFileSync(join(target, "package.json"), "utf8"));
const packageSpec = `${manifest.name}@${manifest.version}`;
const temporary = mkdtempSync(join(tmpdir(), "arcana-forge-wasm-"));

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed (${result.status}):\n${result.stderr || result.stdout}`,
    );
  }
  return result.stdout.trim();
}

try {
  console.log(`Downloading the real Forge WebAssembly engine: ${packageSpec}`);
  const archive = basename(
    run("npm", ["pack", packageSpec, "--silent", "--pack-destination", temporary])
      .split("\n")
      .at(-1),
  );
  run("tar", ["-xzf", join(temporary, archive), "-C", temporary]);

  const unpacked = join(temporary, "package");
  const installed = JSON.parse(readFileSync(join(unpacked, "package.json"), "utf8"));
  if (installed.name !== manifest.name || installed.version !== manifest.version) {
    throw new Error("The retrieved Forge engine does not match the expected package version");
  }

  for (const name of ["forgeharness.js", "forgeharness.js.wasm"]) {
    const source = join(unpacked, name);
    if (!existsSync(source) || statSync(source).size < 1_000_000) {
      throw new Error(`The Forge Web Image is missing or incomplete: ${name}`);
    }
    if (name.endsWith(".wasm")) {
      const header = readFileSync(source).subarray(0, 8);
      if (header.subarray(0, 4).toString("hex") !== "0061736d") {
        throw new Error("Forge WebAssembly has an invalid binary signature");
      }
    }
    copyFileSync(source, join(target, name));
    console.log(`Staged ${name}: ${statSync(source).size} bytes`);
  }
  console.log("The complete Forge browser rules engine is staged for Vite.");
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
