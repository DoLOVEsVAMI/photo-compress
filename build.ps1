param(
    [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$Python = Join-Path $ProjectRoot "venv\Scripts\python.exe"

if (-not (Test-Path -LiteralPath $Python)) {
    python -m venv (Join-Path $ProjectRoot "venv")
}

if (-not $SkipInstall) {
    & $Python -m pip install -r (Join-Path $ProjectRoot "requirements.txt")
    if ($LASTEXITCODE -ne 0) { throw "Failed to install dependencies" }
}

& $Python -m PyInstaller `
    --noconfirm `
    --clean `
    --onefile `
    --windowed `
    --name "PhotoCompressor" `
    --distpath (Join-Path $ProjectRoot "dist") `
    --workpath (Join-Path $ProjectRoot "build") `
    --specpath $ProjectRoot `
    --add-data "$(Join-Path $ProjectRoot 'templates');templates" `
    --add-data "$(Join-Path $ProjectRoot 'static');static" `
    (Join-Path $ProjectRoot "app.py")

if ($LASTEXITCODE -ne 0) { throw "PyInstaller build failed" }

$Exe = Join-Path $ProjectRoot "dist\PhotoCompressor.exe"
Write-Host ""
Write-Host "Ready: $Exe" -ForegroundColor Green
