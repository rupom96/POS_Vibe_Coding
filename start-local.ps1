# Single-port local run: UI + API on http://localhost:5080
# Builds the SPA into PosApi/wwwroot, then starts the API.

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$wwwroot = Join-Path $root "backend\PosApi\wwwroot"

Push-Location (Join-Path $root "frontend\web")
try {
  npm run build -- --outDir $wwwroot --emptyOutDir
}
finally {
  Pop-Location
}

$utf8 = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText(
  (Join-Path $wwwroot "apiSettings.json"),
  "{`r`n  `"baseUrl`": `"/api`"`r`n}",
  $utf8
)

Remove-Item (Join-Path $wwwroot "web.config") -ErrorAction SilentlyContinue
Remove-Item (Join-Path $wwwroot "_redirects") -ErrorAction SilentlyContinue

Get-ChildItem $wwwroot -Filter *.json -File | ForEach-Object {
  $bytes = [System.IO.File]::ReadAllBytes($_.FullName)
  if ($bytes.Length -ge 3 -and $bytes[0] -eq 239 -and $bytes[1] -eq 187 -and $bytes[2] -eq 191) {
    [System.IO.File]::WriteAllBytes($_.FullName, $bytes[3..($bytes.Length - 1)])
  }
}

Write-Host "Starting single-port site at http://localhost:5080 ..."
Set-Location (Join-Path $root "backend\PosApi")
dotnet run --urls "http://localhost:5080" --no-launch-profile
