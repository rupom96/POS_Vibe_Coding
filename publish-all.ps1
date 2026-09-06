# Builds the frontend into PosApi/wwwroot, then publishes one IIS/Kestrel site
# (API + SPA on the same port). For local single-port: start-local.ps1
# Split folders remain at publish/backend and publish/frontend.

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$wwwroot = Join-Path $root "backend\PosApi\wwwroot"
$outDir = Join-Path $root "publish\site"

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

if (Test-Path $outDir) {
  Remove-Item $outDir -Recurse -Force
}

dotnet publish (Join-Path $root "backend\PosApi\PosApi.csproj") -c Release -o $outDir

Write-Host ""
Write-Host "Combined site: $outDir"
Write-Host "Host that folder on one port. UI is /  API is /api  Swagger is /swagger"
