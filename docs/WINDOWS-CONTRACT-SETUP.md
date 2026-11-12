# Native Windows contract tooling

The user authorized Windows tooling instead of Ubuntu/WSL. No Linux distribution is being installed and the Microsoft installer was instructed not to restart Windows.

## Installed and verified

- Rustup 1.29.2 installed from the official Rust x64 Windows download.
- `rustc 1.93.0` and `cargo 1.93.0` verified by executing them.
- Both `wasm32-unknown-unknown` and `x86_64-pc-windows-msvc` targets are installed.
- Microsoft Visual Studio 2022 Build Tools installation completed successfully. `vswhere` verified the x64/x86 compiler component at `C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools`. The installation requested Windows 11 SDK 22621 and CMake components; WinGet verified the Microsoft bootstrapper hash.
- Windows SDK 22621, the actual `cl.exe` and CMake executable were separately verified. NASM 3.02 was subsequently installed from its official WinGet package and verified by executing it; the native cryptography dependency requires it.
- Cargo resolver 3 and the package Rust-version declarations select dependencies compatible with Rust 1.93.0. `Cargo.lock` was generated with 283 packages; it avoids newer NEAR environment dependencies requiring Rust 1.95.
- WebAssembly compile checks passed. All 31 native contract unit tests passed on Windows (18 treasury, 13 gift) without warnings. Both optimized release WebAssembly builds passed.
- `node scripts/inspect-near-wasm.mjs` validated the WebAssembly files, exported methods and NEAR runtime imports. `docs/NEAR-CONTRACT-ARTIFACTS.json` records their hashes and sizes. Rust formatting checks passed.

## Commands after setup

From the project root, run `./scripts/near-contracts.ps1 -Action check`, `-Action test`, or `-Action build`. The included `contracts/near/Cargo.lock` records the resolved dependency versions; repeat checks use `--locked`. The runner configures the Microsoft developer environment, CMake and NASM, and defaults to two build jobs. It sets `--cfg near` only for WebAssembly builds, as required by the pinned NEAR SDK. It does not deploy contracts or transfer assets.

Windows compilation and mocked contract unit tests do not replace asynchronous NEAR sandbox integration tests. NEAR's full node currently requires a supported Linux/macOS environment; a remote supported environment can be used without installing Ubuntu on this computer.

## Sources

- [Official Rust Windows installer](https://rust-lang.org/tools/install/)
- [Microsoft's Rust setup guide](https://learn.microsoft.com/en-us/windows/dev-environment/rust/setup)
- [NEAR build flags](https://github.com/near/cargo-near)
- [NEAR node platform support](https://github.com/near/nearcore/blob/master/CONTRIBUTING.md)
