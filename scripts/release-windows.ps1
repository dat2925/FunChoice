$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
if (!$env:TAURI_SIGNING_PRIVATE_KEY) {
    $keyFile = Join-Path $env:LOCALAPPDATA 'FunChoiceRelease/updater.key'
    if (!(Test-Path -LiteralPath $keyFile)) {
        throw 'Set TAURI_SIGNING_PRIVATE_KEY to the original FunChoice updater key before building a release.'
    }
    $env:TAURI_SIGNING_PRIVATE_KEY = $keyFile
}
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
$bundle = "src-tauri/target/release/bundle/nsis/FunChoice_${version}_x64-setup.exe"
$installer = "FunChoice-${version}-x64-setup.exe"
$signature = (Get-Content -LiteralPath "$bundle.sig" -Raw).Trim()
if (!$signature) { throw 'The installer signature is missing.' }
Copy-Item -LiteralPath $bundle -Destination "release/$installer" -Force
Copy-Item -LiteralPath "$bundle.sig" -Destination "release/$installer.sig" -Force
$manifest = [ordered]@{
    version = $version
    pub_date = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')
    platforms = @{
        'windows-x86_64' = @{
            signature = $signature
            url = "https://github.com/dat2925/FunChoice/releases/download/v$version/$installer"
        }
    }
}
$manifestPath = Join-Path $PWD.Path 'release/latest.json'
[IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json -Depth 5), [Text.UTF8Encoding]::new($false))
Get-Item -LiteralPath "release/$installer", "release/$installer.sig", $manifestPath | Select-Object Name,Length

