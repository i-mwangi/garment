param(
    [ValidateSet('check','build','test','all')][string]$Action = 'all',
    [ValidateRange(1,8)][int]$Jobs = 2
)
$ErrorActionPreference = 'Stop'
$taskCargo = Join-Path $env:USERPROFILE '.cargo\bin\cargo.exe'
if (!(Test-Path -LiteralPath $taskCargo)) { throw 'Install Rustup before building the native contracts.' }
$env:Path = (Split-Path $taskCargo) + ';' + $env:Path
$taskVswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
if (Test-Path -LiteralPath $taskVswhere) {
    $taskVsRoot = & $taskVswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
    if ($taskVsRoot) {
        $taskDevShell = Join-Path $taskVsRoot 'Common7\Tools\Launch-VsDevShell.ps1'
        if (Test-Path -LiteralPath $taskDevShell) { & $taskDevShell -Arch amd64 -HostArch amd64 -SkipAutomaticLocation }
    }
    $taskCMake = & $taskVswhere -latest -products '*' -find 'Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe'
    if ($taskCMake) { $env:Path = (Split-Path ($taskCMake | Select-Object -First 1)) + ';' + $env:Path }
}
foreach ($taskNasmDirectory in @("$env:LOCALAPPDATA\bin\NASM", "$env:ProgramFiles\NASM")) {
    if (Test-Path -LiteralPath (Join-Path $taskNasmDirectory 'nasm.exe')) { $env:Path = $taskNasmDirectory + ';' + $env:Path; break }
}
$taskContractRoot = Join-Path (Split-Path $PSScriptRoot) 'contracts\near'
function Invoke-NearCargo([string[]]$CargoArguments) {
    & $taskCargo '+1.93.0' @CargoArguments --jobs $Jobs
    if ($LASTEXITCODE -ne 0) { throw "Native contract command failed (exit $LASTEXITCODE)." }
}
Push-Location $taskContractRoot
try {
    if ($Action -in @('check','build','all')) {
        $taskPreviousRustFlags = $env:RUSTFLAGS
        try {
            # near-sdk 5.27+ selects its on-chain environment with this flag.
            $env:RUSTFLAGS = ($taskPreviousRustFlags + ' --cfg near').Trim()
            if ($Action -in @('check','all')) { Invoke-NearCargo -CargoArguments @('check','--workspace','--locked','--target','wasm32-unknown-unknown') }
            if ($Action -in @('build','all')) { Invoke-NearCargo -CargoArguments @('build','--workspace','--locked','--release','--target','wasm32-unknown-unknown') }
        } finally { $env:RUSTFLAGS = $taskPreviousRustFlags }
    }
    if ($Action -in @('test','all')) { Invoke-NearCargo -CargoArguments @('test','--workspace','--locked') }
} finally { Pop-Location }
