# Publish combined PosApi + SPA to PUBLISH\site2 (IIS port 8081).
# Usage:
#   .\Publish-Site2.ps1
#   .\Publish-Site2.ps1 -AppBaseUrl "http://localhost:8081" -Br2ReportBaseUrl "http://localhost:8080/BRReports"
#   .\Publish-Site2.ps1 -SkipFrontend

param(
  [string]$OutDir = "",
  [string]$AppBaseUrl = "http://localhost:8081",
  [string]$Br2ReportBaseUrl = "http://localhost:8080/BRReports",
  [switch]$SkipFrontend
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
if (-not $OutDir) { $OutDir = Join-Path $root "PUBLISH\site2" }

$wwwroot = Join-Path $root "backend\PosApi\wwwroot"
$csproj = Join-Path $root "backend\PosApi\PosApi.csproj"
$tmpDir = Join-Path $root "PUBLISH\site2_build_tmp"
$utf8 = New-Object System.Text.UTF8Encoding $false

function Write-ApiSettings([string]$targetDir) {
  $path = Join-Path $targetDir "apiSettings.json"
  $lines = @(
    "{"
    '  "baseUrl": "/api",'
    ('  "appBaseUrl": "{0}",' -f $AppBaseUrl)
    ('  "br2ReportBaseUrl": "{0}"' -f $Br2ReportBaseUrl)
    "}"
  )
  [System.IO.File]::WriteAllText($path, (($lines -join "`r`n") + "`r`n"), $utf8)
}

function Strip-Bom([string]$dir) {
  Get-ChildItem $dir -Filter *.json -File -ErrorAction SilentlyContinue | ForEach-Object {
    $bytes = [System.IO.File]::ReadAllBytes($_.FullName)
    if ($bytes.Length -ge 3 -and $bytes[0] -eq 239 -and $bytes[1] -eq 187 -and $bytes[2] -eq 191) {
      [System.IO.File]::WriteAllBytes($_.FullName, $bytes[3..($bytes.Length - 1)])
    }
  }
}

Write-Host "=== Publish Site2 ===" -ForegroundColor Cyan
Write-Host "OutDir: $OutDir"
Write-Host "AppBaseUrl: $AppBaseUrl"
Write-Host "Br2ReportBaseUrl: $Br2ReportBaseUrl"

if (-not $SkipFrontend) {
  Write-Host ""
  Write-Host "[1/3] Building frontend -> PosApi\wwwroot ..." -ForegroundColor Cyan
  Push-Location (Join-Path $root "frontend\web")
  try {
    npm run build -- --outDir $wwwroot --emptyOutDir
    if ($LASTEXITCODE -ne 0) { throw "Frontend build failed (exit $LASTEXITCODE)." }
  }
  finally {
    Pop-Location
  }

  Write-ApiSettings $wwwroot
  Remove-Item (Join-Path $wwwroot "web.config") -ErrorAction SilentlyContinue
  Remove-Item (Join-Path $wwwroot "_redirects") -ErrorAction SilentlyContinue
  Strip-Bom $wwwroot
}
else {
  Write-Host ""
  Write-Host "[1/3] SkipFrontend - using existing wwwroot" -ForegroundColor Yellow
  if (-not (Test-Path (Join-Path $wwwroot "index.html"))) {
    throw "wwwroot missing index.html. Run without -SkipFrontend."
  }
  Write-ApiSettings $wwwroot
}

Write-Host ""
Write-Host "[2/3] dotnet publish -> temp ..." -ForegroundColor Cyan
if (Test-Path $tmpDir) { Remove-Item $tmpDir -Recurse -Force }
dotnet publish $csproj -c Release -o $tmpDir
if ($LASTEXITCODE -ne 0) { throw "dotnet publish failed (exit $LASTEXITCODE)." }

$tmpWww = Join-Path $tmpDir "wwwroot"
if (-not (Test-Path $tmpWww)) { throw "Publish output missing wwwroot." }
Write-ApiSettings $tmpWww
Strip-Bom $tmpWww

Write-Host ""
Write-Host "[3/3] Deploying to $OutDir ..." -ForegroundColor Cyan
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null

$dll = Join-Path $OutDir "PosApi.dll"
if (Test-Path $dll) {
  try {
    $bak = Join-Path $OutDir ("PosApi.dll.old_{0}" -f (Get-Date -Format "HHmmss"))
    Move-Item $dll $bak -Force -ErrorAction Stop
    Write-Host ("  Renamed locked PosApi.dll -> {0}" -f (Split-Path $bak -Leaf))
  }
  catch {
    Write-Host "  WARNING: PosApi.dll may be locked by IIS. If copy fails, recycle the app pool and re-run." -ForegroundColor Yellow
  }
}

$outWww = Join-Path $OutDir "wwwroot"
if (Test-Path $outWww) { Remove-Item $outWww -Recurse -Force -ErrorAction SilentlyContinue }

# robocopy tolerates locks better than Copy-Item (retries). Exit codes 0-7 = success.
$robolog = Join-Path $env:TEMP ("publish-site2-{0}.log" -f (Get-Date -Format "HHmmss"))
& robocopy $tmpDir $OutDir /E /R:2 /W:1 /NFL /NDL /NJH /NJS /NP /LOG:$robolog | Out-Null
$rc = $LASTEXITCODE
if ($rc -ge 8) {
  Write-Host "  robocopy had errors (code $rc). Copying critical files individually..." -ForegroundColor Yellow
  $critical = @(
    "PosApi.dll", "PosApi.pdb", "PosApi.deps.json", "PosApi.runtimeconfig.json",
    "appsettings.json", "appsettings.Development.json", "web.config"
  )
  foreach ($f in $critical) {
    $src = Join-Path $tmpDir $f
    if (Test-Path $src) {
      Copy-Item $src (Join-Path $OutDir $f) -Force -ErrorAction SilentlyContinue
    }
  }
  if (Test-Path $outWww) { Remove-Item $outWww -Recurse -Force -ErrorAction SilentlyContinue }
  Copy-Item (Join-Path $tmpDir "wwwroot") $outWww -Recurse -Force
}
else {
  Write-Host ("  robocopy OK (code {0})" -f $rc)
}

$webConfig = Join-Path $OutDir "web.config"
if (Test-Path $webConfig) {
  (Get-Item $webConfig).LastWriteTime = Get-Date
  Write-Host "  Touched web.config (app recycle)"
}

# Ensure PosApi.dll is the new build even if earlier rename left a gap
$srcDll = Join-Path $tmpDir "PosApi.dll"
$dstDll = Join-Path $OutDir "PosApi.dll"
if ((Test-Path $srcDll) -and (-not (Test-Path $dstDll) -or ((Get-Item $srcDll).Length -ne (Get-Item $dstDll).Length) -or ((Get-Item $srcDll).LastWriteTime -gt (Get-Item $dstDll).LastWriteTime))) {
  try {
    if (Test-Path $dstDll) {
      $bak2 = Join-Path $OutDir ("PosApi.dll.old_{0}" -f (Get-Date -Format "HHmmss"))
      Move-Item $dstDll $bak2 -Force -ErrorAction SilentlyContinue
    }
    Copy-Item $srcDll $dstDll -Force
    Write-Host "  Ensured PosApi.dll is latest build"
  }
  catch {
    Write-Host "  WARNING: Could not refresh PosApi.dll while locked." -ForegroundColor Yellow
  }
}

Write-Host ""
Write-Host "Published OK: $OutDir" -ForegroundColor Green
Write-Host ("  SPA:  {0}\wwwroot" -f $OutDir)
Write-Host "  API:  /api"
Write-Host ("  URL:  {0}" -f $AppBaseUrl)
Write-Host ""
