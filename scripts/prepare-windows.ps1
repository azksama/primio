$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$cacheRoot = Join-Path $projectRoot 'tmp/windows-deps'
$resourceRoot = Join-Path $projectRoot 'apps/client/src-tauri/resources/windows'
New-Item -ItemType Directory -Force -Path $cacheRoot | Out-Null
function Get-VerifiedArchive($Name, $Url, $Hash) {
    $archive = Join-Path $cacheRoot $Name
    if (!(Test-Path -LiteralPath $archive)) { Invoke-WebRequest -Uri $Url -OutFile $archive }
    if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $Hash) { throw "Invalid SHA256: $Name" }
    return $archive
}
$mpv = Get-VerifiedArchive 'mpv.7z' 'https://github.com/shinchiro/mpv-winbuild-cmake/releases/download/20260923/mpv-x86_64-20260923-git-6fd80b2003.7z' 'a2fc7178ee5d49869b7719e907ed402d6191e27167d4631ff9aa2592910632aa'
$uosc = Get-VerifiedArchive 'uosc.zip' 'https://github.com/tomasklaen/uosc/releases/download/5.13.0/uosc.zip' '4be9da3289285300fa374496c3f1bfd7bb20ac08e890d25bd5a06b28eebe4882'
$sevenZip = (Get-Command 7z -ErrorAction SilentlyContinue).Source
if (!$sevenZip) { $sevenZip = 'C:\Program Files\7-Zip\7z.exe' }
if (!(Test-Path -LiteralPath $sevenZip)) { throw '7-Zip is required to prepare the Windows player.' }
& $sevenZip x $mpv "-o$resourceRoot/mpv" -y -bso0 -bsp0
if ($LASTEXITCODE -ne 0) { throw 'mpv extraction failed' }
Copy-Item -LiteralPath "$resourceRoot/mpv/mpv.exe" -Destination "$resourceRoot/mpv/primio-player.exe" -Force
Expand-Archive -LiteralPath $uosc -DestinationPath "$resourceRoot/player" -Force
Write-Host 'Verified Windows player resources are ready.'
