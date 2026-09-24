param([ValidateSet('debug','release')][string]$Profile='debug')
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot
& "$PSScriptRoot/prepare-native.ps1"
$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'
if (!$env:ANDROID_HOME) { $env:ANDROID_HOME=Join-Path $env:LOCALAPPDATA 'Android/Sdk' }
$env:NDK_HOME=Join-Path $env:ANDROID_HOME 'ndk/29.0.14206865'
$env:PATH="$env:JAVA_HOME\bin;$env:PATH"
$ndkBin=Join-Path $env:NDK_HOME 'toolchains/llvm/prebuilt/windows-x86_64/bin'
$rust=Join-Path $root 'apps/client/src-tauri'
$android=Join-Path $rust 'gen/android'
$primioConfig=Get-Content -LiteralPath (Join-Path $rust 'tauri.conf.json') -Raw | ConvertFrom-Json
$primioVersion=[version]$primioConfig.version
@("tauri.android.versionName=$($primioConfig.version)","tauri.android.versionCode=$($primioVersion.Major*1000000+$primioVersion.Minor*1000+$primioVersion.Build)") | Set-Content -LiteralPath (Join-Path $android 'app/tauri.properties') -Encoding ascii
$env:WRY_ANDROID_PACKAGE='fr.azks.primio'
$env:WRY_ANDROID_LIBRARY='primio_lib'
$env:WRY_ANDROID_KOTLIN_FILES_OUT_DIR=Join-Path $android 'app/src/main/java/fr/azks/primio/generated'
$env:TAURI_ANDROID_PROJECT_PATH=$android
$env:TAURI_ANDROID_PACKAGE_UNESCAPED='fr.azks.primio'
Push-Location (Join-Path $root 'apps/client')
try { npm run build; if($LASTEXITCODE -ne 0){throw 'Frontend build failed'} } finally {Pop-Location}
Push-Location $rust
try {
 foreach($target in @(@{triple='aarch64-linux-android';abi='arm64-v8a';clang='aarch64-linux-android26-clang.cmd'},@{triple='x86_64-linux-android';abi='x86_64';clang='x86_64-linux-android26-clang.cmd'})) {
  $key=$target.triple.Replace('-','_')
  [Environment]::SetEnvironmentVariable("CARGO_TARGET_$($key.ToUpper())_LINKER",(Join-Path $ndkBin $target.clang),'Process')
  [Environment]::SetEnvironmentVariable("CC_$key",(Join-Path $ndkBin $target.clang),'Process')
  [Environment]::SetEnvironmentVariable("AR_$key",(Join-Path $ndkBin 'llvm-ar.exe'),'Process')
  $cargoArgs=@('build','--locked','--lib','--target',$target.triple,'--features','tauri/custom-protocol')
  if($Profile -eq 'release'){$cargoArgs+='--release'}
  & cargo @cargoArgs
  if($LASTEXITCODE -ne 0){throw "Rust build failed: $($target.triple)"}
  Copy-Item -LiteralPath (Join-Path $rust "target/$($target.triple)/$Profile/libprimio_lib.so") -Destination (Join-Path $android "app/src/main/jniLibs/$($target.abi)/libprimio_lib.so") -Force
 }
} finally {Pop-Location}
Push-Location $android
try {
 $cap=(Get-Culture).TextInfo.ToTitleCase($Profile)
 & ./gradlew.bat "assembleUniversal$cap" '-PabiList=arm64-v8a,x86_64' '-ParchList=arm64,x86_64' '-PtargetList=aarch64,x86_64' '-x' "rustBuildArm64$cap" '-x' "rustBuildX86_64$cap" '--console=plain'
 if($LASTEXITCODE -ne 0){throw 'APK packaging failed'}
} finally {Pop-Location}
