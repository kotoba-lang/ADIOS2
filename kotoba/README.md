<!--
SPDX-FileCopyrightText: 2026 Oak Ridge National Laboratory and Contributors

SPDX-License-Identifier: Apache-2.0
-->

# Kotoba v1 ADIOS2/BP binding

Honest v1 only: **magic / header**. This tree is a first-class sibling of
`bindings/{C,CXX,Fortran,Matlab,Python}` **on this fork**. It is not a
replacement for the C++ library and it is not robotics-ready.

Owner constraint: magic/header or one record. No I/O engine, no BP writer,
no timestep/query.

The module compiles with [Kotoba](https://github.com/kotoba-lang/kotoba) CLI
**0.7.3** to `wasm32-kotoba-v1` under the `i64-v1` value profile: no FFI, no
IEEE floats, no vector or externref ABI.

## Identification fields vs fixture file

`fixtures/bp5-index-header.bin` is a 64-byte file (the on-disk
`BP5IndexTableHeader` size). That is the **fixture**.

`adios2.kotoba` parses the identification fields from header bytes passed in
as little-endian i64 words (`w0` = bytes 0-7, `w4` = bytes 32-39), the same
packing the LIEF Kotoba binding uses. Kotoba v1 has no bytes builtin, so
`main` parses the fixture's words embedded as `fixture-w0` / `fixture-w4`.
`header-byte` returns `-1` for offsets it does not parse.

| Offset | Fixture | Meaning | Export |
| ------ | ------- | ------- | ------ |
| 0-7 | `ADIOS-BP` | File magic | `magic-ok w0` |
| 36 | `0` | Little-endian (`0` little, `1` big) | `endian-flag w4` |
| 37 | `5` | BP major version | `bp-version w4` |
| 38 | `2` | BP5 minor version | `bp-minor w4` |
| 39 | `0` | Header active-flag byte | `active-flag w4` |

The rest of the fixture file (VersionTag tail, ASCII library digits, UUID,
padding) is not parsed. `checks.sh` locks the full file hex. Layout source
(struct only): `source/adios2/engine/bp5/BP5Engine.h`.

`pack w0 w4` returns those identification fields packed as decimal digits,
or `0` for bad magic or a BP major version other than 5. For the fixture it
is `110520`:

- `1` magic `ADIOS-BP`
- `1` little-endian
- `05` BP version
- `2` BP minor
- `0` active-flag byte

## What this is not

- Not an I/O engine.
- Not a BP writer.
- Not timestep, step, or query support.
- Not a reader for `md.0`, `mmd.0`, `data.*`, variables, or attributes.
- Not FFS / MetaMeta decode.
- Not a replacement for the C, C++, Fortran, Matlab, or Python bindings.
- Not robotics-ready.

This is not a claim that Kotoba can open production ADIOS2 datasets.

## Checks

`checks.sh` downloads Kotoba 0.7.3 (or uses `KOTOBA` / `KOTOBA_BIN`), compiles
`adios2.kotoba` to wasm, and requires a real compiler receipt:

- `value-profile` is `i64-v1`
- target is `wasm32-kotoba-v1`
- `value-abi` is `direct-v1`
- `wasm-features` is empty
- the artifact starts with wasm magic and carries `wasm32-kotoba-v1`

The expected packed value is computed from the fixture bytes, not written as
a literal. `kotoba run` must return it. `run_wasm.mjs` (Node) then
instantiates the wasm and, with every expected value read from the fixture
file:

- packs the fixture into `w0` / `w4` and checks each parse export and
  `header-byte` against the file bytes
- fails if the embedded `fixture-w0` / `fixture-w4` drift from the file
- checks big-endian, minor-version, bad-magic, and BP4 variants of the
  fixture, so a field that ignores its input bytes fails

It does not invent a pass. A local `110520` is not a CI result.

```sh
bash kotoba/checks.sh
```

## Upstream

This binding lives on `kotoba-lang/ADIOS2`. It is not an `ornladios/ADIOS2`
release surface. Do not open a pull request to `ornladios/ADIOS2` from this
tree.

Fork operator: [awai.network](https://awai.network) / Ryo Awai.
