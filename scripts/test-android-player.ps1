param([Parameter(Mandatory=$true)][string]$DeviceSerial)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot
$env:JAVA_HOME='C:/Program Files/Android/Android Studio/jbr'
if(!$env:ANDROID_HOME){$env:ANDROID_HOME=Join-Path $env:LOCALAPPDATA 'Android/Sdk'}
$env:PATH="$env:JAVA_HOME/bin;$env:PATH"
$adb=Join-Path $env:ANDROID_HOME 'platform-tools/adb.exe'
$android=Join-Path $root 'apps/client/src-tauri/gen/android'
$output=Join-Path $root 'tmp/player-tests'
New-Item -ItemType Directory -Force $output | Out-Null
# Build the native libraries first with scripts/build-android.ps1.
Push-Location $android
try {
 & ./gradlew.bat assembleUniversalDebug assembleUniversalDebugAndroidTest '-PabiList=arm64-v8a,x86_64' '-ParchList=arm64,x86_64' '-PtargetList=aarch64,x86_64' -x rustBuildArm64Debug -x rustBuildX86_64Debug --console=plain
 if($LASTEXITCODE -ne 0){throw 'Android test build failed'}
} finally {Pop-Location}
$fixture=Join-Path $output 'trailer.mp4'
Invoke-WebRequest 'https://media.w3.org/2010/05/bunny/trailer.mp4' -OutFile $fixture
if((Get-FileHash $fixture -Algorithm SHA256).Hash -ne 'B2DED9AE5A20FA36CA8CEC49EF923BFFB5E1A51D9E8C1F8336273D2FA9D35FF0'){throw 'Unexpected video fixture checksum'}
& $adb -s $DeviceSerial install --no-incremental -r "$android/app/build/outputs/apk/universal/debug/app-universal-debug.apk"
if($LASTEXITCODE -ne 0){throw 'App installation failed'}
& $adb -s $DeviceSerial install --no-incremental -r "$android/app/build/outputs/apk/androidTest/universal/debug/app-universal-debug-androidTest.apk"
if($LASTEXITCODE -ne 0){throw 'Test installation failed'}
& $adb -s $DeviceSerial shell mkdir -p /sdcard/Android/data/fr.azks.primio/files
& $adb -s $DeviceSerial push $fixture /sdcard/Android/data/fr.azks.primio/files/validation.mp4
if($LASTEXITCODE -ne 0){throw 'Fixture transfer failed'}
# Baseline H.264 with even dimensions is supported by the emulator's platform thumbnail decoder.
$previewFixture=Join-Path $output 'preview.mp4'
& ffmpeg -hide_banner -loglevel error -y -i $fixture -vf scale=640:360 -c:v libx264 -profile:v baseline -pix_fmt yuv420p -g 24 -c:a copy $previewFixture
if($LASTEXITCODE -ne 0){throw 'Preview fixture creation failed'}
& $adb -s $DeviceSerial push $previewFixture /sdcard/Android/data/fr.azks.primio/files/validation-preview.mp4
if($LASTEXITCODE -ne 0){throw 'Preview fixture transfer failed'}
$subtitle=Join-Path $output 'subtitle.srt'
@("1","00:00:00,000 --> 00:00:32,000","Primio subtitle fixture","") | Set-Content -LiteralPath $subtitle -Encoding utf8
$multi=Join-Path $output 'tracks.mkv'
& ffmpeg -hide_banner -loglevel error -y -i $fixture -i $subtitle -map 0:v -map 0:a -map 0:a -map 1:s -map 1:s -c copy -metadata:s:a:0 language=eng -metadata:s:a:0 'title=QA Audio English' -metadata:s:a:1 language=fra -metadata:s:a:1 'title=QA Audio French' -metadata:s:s:0 language=eng -metadata:s:s:0 'title=QA Subtitle English' -metadata:s:s:1 language=fra -metadata:s:s:1 'title=QA Subtitle French' $multi
if($LASTEXITCODE -ne 0){throw 'Multitrack fixture creation failed'}
& $adb -s $DeviceSerial push $multi /sdcard/Android/data/fr.azks.primio/files/validation.mkv
if($LASTEXITCODE -ne 0){throw 'Multitrack fixture transfer failed'}

& $adb -s $DeviceSerial shell pm grant fr.azks.primio android.permission.POST_NOTIFICATIONS
try {
 $result=& $adb -s $DeviceSerial shell am instrument -w -r -e class fr.azks.primio.PlayerFlowTest fr.azks.primio.test/androidx.test.runner.AndroidJUnitRunner
 $result | Set-Content (Join-Path $output 'instrumentation.txt') -Encoding utf8
 $result
 if(($result -join "`n") -notmatch 'OK \(14 tests\)'){throw 'Player instrumentation tests failed'}
} finally {
 & $adb -s $DeviceSerial shell rm -f /sdcard/Android/data/fr.azks.primio/files/validation.mp4 /sdcard/Android/data/fr.azks.primio/files/validation.mkv /sdcard/Android/data/fr.azks.primio/files/validation-preview.mp4
}
