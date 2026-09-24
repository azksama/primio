$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot
$archive = Join-Path $root 'tmp/native/libmpv.aar'
$expected = 'DF146592480FC8418415A06B1F1A1D6318B0088E21F52254B0E9A82B61CA8FA2'
New-Item -ItemType Directory -Force (Split-Path $archive) | Out-Null
if (!(Test-Path $archive)) {
 Invoke-WebRequest 'https://github.com/jarnedemeulemeester/libmpv-android/releases/download/v1.0.0/libmpv-release.aar' -OutFile $archive
}
if ((Get-FileHash $archive -Algorithm SHA256).Hash -ne $expected) { throw 'libmpv artifact checksum mismatch' }
$extract = Join-Path $root 'tmp/native/aar'
Expand-Archive -Path $archive -DestinationPath $extract -Force
$native = Join-Path $root 'apps/client/src-tauri/native'
$jni = Join-Path $root 'apps/client/src-tauri/gen/android/app/src/main/jniLibs'
New-Item -ItemType Directory -Force $native,$jni | Out-Null
foreach ($abi in @('arm64-v8a','armeabi-v7a','x86','x86_64')) {
 New-Item -ItemType Directory -Force (Join-Path $native $abi),(Join-Path $jni $abi) | Out-Null
 Get-ChildItem (Join-Path $extract "jni/$abi") -Filter '*.so' | Where-Object Name -ne 'libplayer.so' | ForEach-Object {
  Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $native $abi) -Force
  Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $jni $abi) -Force
 }
}
Write-Output 'Pinned libmpv native libraries verified and prepared.'

