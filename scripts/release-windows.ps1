$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
npm run tauri -- build --no-bundle
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$binary = (Resolve-Path 'src-tauri/target/release/FunChoice.exe').Path
$check = Start-Process -FilePath $binary -ArgumentList '--check-assets' -WindowStyle Hidden -Wait -PassThru
if ($check.ExitCode -ne 0) {
    throw 'FunChoice is missing embedded frontend assets. Packaging stopped.'
}

npm run tauri -- bundle --bundles nsis
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$version = (Get-Content 'src-tauri/tauri.conf.json' -Raw | ConvertFrom-Json).version
New-Item -ItemType Directory -Force 'release' | Out-Null
Copy-Item -LiteralPath "src-tauri/target/release/bundle/nsis/FunChoice_${version}_x64-setup.exe" -Destination "release/FunChoice-${version}-x64-setup.exe" -Force
Get-Item -LiteralPath "release/FunChoice-${version}-x64-setup.exe" | Select-Object Name,Length

