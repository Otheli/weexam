$ErrorActionPreference = 'Stop'
$src  = $PSScriptRoot
$dest = Join-Path $env:LOCALAPPDATA 'Weexam'
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item (Join-Path $src 'Weexam-Offline.html') $dest -Force
$icoSrc = Join-Path $src 'weexam.ico'
if (Test-Path $icoSrc) { Copy-Item $icoSrc $dest -Force }

$candidates = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
$browser = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
$page = Join-Path $dest 'Weexam-Offline.html'

if (-not $browser) { Start-Process $page; exit 0 }

$url = ([System.Uri]$page).AbsoluteUri
$ws  = New-Object -ComObject WScript.Shell
foreach ($folder in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {
  $lnk = $ws.CreateShortcut((Join-Path $folder 'Weexam.lnk'))
  $lnk.TargetPath  = $browser
  $lnk.Arguments   = "--app=$url"
  $lnk.Description = 'Weexam - Weekly Exam'
  $ico = Join-Path $dest 'weexam.ico'
  if (Test-Path $ico) { $lnk.IconLocation = $ico }
  $lnk.Save()
}
Start-Process $browser -ArgumentList "--app=$url"
