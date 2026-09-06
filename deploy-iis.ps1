#Requires -RunAsAdministrator
# Creates/updates an IIS site for the combined POS publish folder.

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$sitePath = Join-Path $root "publish\site"
$siteName = "VibeCodingPOS"
$appPool = "VibeCodingPOS"
$port = 8080

if (-not (Test-Path (Join-Path $sitePath "PosApi.dll"))) {
  throw "Publish folder missing. Run: powershell -File publish-all.ps1"
}

Import-Module WebAdministration

if (-not (Test-Path "IIS:\AppPools\$appPool")) {
  New-WebAppPool -Name $appPool | Out-Null
  Set-ItemProperty "IIS:\AppPools\$appPool" -Name managedRuntimeVersion -Value ""
  Set-ItemProperty "IIS:\AppPools\$appPool" -Name startMode -Value "AlwaysRunning"
}

$existing = Get-Website -Name $siteName -ErrorAction SilentlyContinue
if ($existing) {
  Stop-Website -Name $siteName -ErrorAction SilentlyContinue
  Set-ItemProperty "IIS:\Sites\$siteName" -Name physicalPath -Value $sitePath
  Set-ItemProperty "IIS:\Sites\$siteName" -Name applicationPool -Value $appPool
} else {
  New-Website -Name $siteName -PhysicalPath $sitePath -Port $port -ApplicationPool $appPool | Out-Null
}

Start-Website -Name $siteName

Write-Host ""
Write-Host "IIS site '$siteName' -> $sitePath"
Write-Host "POS:     http://localhost:$port/"
Write-Host "API:     http://localhost:$port/api"
Write-Host "Swagger: http://localhost:$port/swagger"
