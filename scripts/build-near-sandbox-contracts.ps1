param()
$ErrorActionPreference='Stop'
& (Join-Path $PSScriptRoot 'near-contracts.ps1') -Action build
$taskCargo=Join-Path $env:USERPROFILE '.cargo/bin/cargo.exe'
$taskRoot=Split-Path $PSScriptRoot
$taskPreviousFlags=$env:RUSTFLAGS
try {
 $env:RUSTFLAGS=($taskPreviousFlags+' --cfg near').Trim()
 & $taskCargo '+1.93.0' build --locked --release --target wasm32-unknown-unknown --manifest-path (Join-Path $taskRoot 'contracts/near/integration-token/Cargo.toml') --target-dir (Join-Path $taskRoot 'contracts/near/target/integration-token') --jobs 2
 if($LASTEXITCODE -ne 0){throw 'Sandbox token fixture compilation failed'}
} finally {$env:RUSTFLAGS=$taskPreviousFlags}
