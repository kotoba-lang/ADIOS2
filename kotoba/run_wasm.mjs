#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 Oak Ridge National Laboratory and Contributors
//
// SPDX-License-Identifier: Apache-2.0

// Instantiate the kotoba-compiled wasm module and assert the BP5 index-header
// identification fields against fixtures/bp5-index-header.bin. The fixture
// file is the source of truth: every expected value below is read from its
// bytes, the file is packed into i64 words and fed to the module's parse
// exports, and the module's embedded fixture words must equal the file.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const wasmPath = process.argv[2];
if (!wasmPath) {
  console.error("usage: node run_wasm.mjs <file.wasm> [fixture.bin]");
  process.exit(2);
}
const fixturePath = process.argv[3] || join(here, "fixtures", "bp5-index-header.bin");

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

const buf = readFileSync(wasmPath);
if (buf.length < 4 || buf[0] !== 0x00 || buf[1] !== 0x61 || buf[2] !== 0x73 || buf[3] !== 0x6d) {
  fail("not a wasm module (missing magic)");
}
const module = new WebAssembly.Module(buf);
const imports = WebAssembly.Module.imports(module);
if (imports.length !== 0) {
  fail(`wasm module has imports (not host-independent): ${JSON.stringify(imports)}`);
}
// Kotoba v1 wasm carries a per-instance call budget (a mutable global that
// traps at zero), so each export call gets a fresh instance.
function i64(name, ...args) {
  const fn = new WebAssembly.Instance(module).exports[name];
  if (typeof fn !== "function") fail(`missing export ${name}`);
  const v = fn(...args.map((a) => BigInt(a)));
  return typeof v === "bigint" ? v : BigInt(v);
}

function packWord(bytes, off) {
  let n = 0n;
  for (let i = 0; i < 8; i++) n += BigInt(bytes[off + i]) << BigInt(8 * i);
  return BigInt.asIntN(64, n);
}

// Expected packed value, computed from header bytes only (same formula as
// the module's pack, written independently here).
function expectedPack(bytes) {
  if (bytes.subarray(0, 8).toString("latin1") !== "ADIOS-BP" || bytes[37] !== 5) return 0n;
  const le = bytes[36] === 0 ? 1 : 0;
  return BigInt(100000 + le * 10000 + bytes[37] * 100 + bytes[38] * 10 + bytes[39]);
}

function checkHeader(label, bytes) {
  const w0 = packWord(bytes, 0);
  const w4 = packWord(bytes, 32);
  for (const i of [0, 1, 2, 3, 4, 5, 6, 7, 36, 37, 38, 39]) {
    const got = i64("header-byte", w0, w4, i);
    if (got !== BigInt(bytes[i])) fail(`${label}: header-byte ${i} = ${got}, file has ${bytes[i]}`);
  }
  const magic = bytes.subarray(0, 8).toString("latin1") === "ADIOS-BP" ? 1n : 0n;
  const fields = [
    ["magic-ok", [w0], magic],
    ["endian-flag", [w4], BigInt(bytes[36])],
    ["little-endian?", [w4], bytes[36] === 0 ? 1n : 0n],
    ["bp-version", [w4], BigInt(bytes[37])],
    ["bp-minor", [w4], BigInt(bytes[38])],
    ["active-flag", [w4], BigInt(bytes[39])],
    ["pack", [w0, w4], expectedPack(bytes)],
  ];
  for (const [name, args, want] of fields) {
    const got = i64(name, ...args);
    if (got !== want) fail(`${label}: ${name} = ${got}, expected ${want} from header bytes`);
  }
  return i64("pack", w0, w4);
}

// 1. The vendored fixture file.
const fixture = readFileSync(fixturePath);
if (fixture.length !== 64) fail(`fixture length ${fixture.length}, expected 64`);
if (i64("header-len") !== BigInt(fixture.length)) fail("header-len does not match fixture length");
const packed = checkHeader("fixture", fixture);

// 2. Embedded fixture words (what `main` / `kotoba run` parse) must equal the file.
const fileW0 = packWord(fixture, 0);
const fileW4 = packWord(fixture, 32);
if (i64("fixture-w0") !== fileW0 || i64("fixture-w4") !== fileW4) {
  fail(
    `embedded fixture words drifted from ${fixturePath}: ` +
      `file w0=${fileW0} w4=${fileW4}, wasm w0=${i64("fixture-w0")} w4=${i64("fixture-w4")}`,
  );
}
if (i64("main") !== packed) fail(`main = ${i64("main")}, expected ${packed} from fixture file`);

// 3. Variants derived from the fixture: the parser must follow the bytes.
const variant = (edit) => {
  const b = Buffer.from(fixture);
  edit(b);
  return b;
};
checkHeader("big-endian active", variant((b) => { b[36] = 1; b[39] = 1; }));
checkHeader("bp5 minor 0", variant((b) => { b[38] = 0; }));
if (checkHeader("bad magic", variant((b) => { b[0] = 0x58; })) !== 0n) fail("bad magic was not rejected");
if (checkHeader("bp4", variant((b) => { b[37] = 4; })) !== 0n) fail("BP version 4 was not rejected");

console.log(
  `fixture fields: magic=ADIOS-BP endian=${fixture[36]} bp=${fixture[37]}.${fixture[38]} ` +
    `active=${fixture[39]} packed=${packed}`,
);
console.log("kotoba wasm BP5 index-header fixture checks passed");
