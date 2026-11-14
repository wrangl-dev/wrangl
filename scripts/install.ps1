# Wrangl installer for Windows.
#   irm https://raw.githubusercontent.com/wrangl-dev/wrangl/main/scripts/install.ps1 | iex
# Downloads the latest NSIS setup from GitHub Releases, checks it against
# SHA256SUMS.txt and runs it. Files fetched this way carry no "downloaded
# from the internet" mark, so SmartScreen does not stop the unsigned setup.

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$BaseUrl = 'https://github.com/wrangl-dev/wrangl'

if (-not [Environment]::Is64BitOperatingSystem) {
  throw 'Wrangl needs 64-bit Windows.'
}
if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') {
  Write-Host 'No ARM64 build yet; installing the x64 build (runs under emulation).'
}

$latest = Invoke-WebRequest -Uri "$BaseUrl/releases/latest" -MaximumRedirection 5 -UseBasicParsing
$tag = ($latest.BaseResponse.ResponseUri, $latest.BaseResponse.RequestMessage.RequestUri |
  Where-Object { $_ } | Select-Object -First 1).AbsoluteUri.Split('/')[-1]
if ($tag -notmatch '^v\d+\.\d+\.\d+') {
  throw "Could not resolve the latest Wrangl version from $BaseUrl/releases/latest"
}
$version = $tag.Substring(1)
$asset = "Wrangl_${version}_x64-setup.exe"

$dir = Join-Path ([IO.Path]::GetTempPath()) ("wrangl-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $dir | Out-Null
try {
  $sums = Join-Path $dir 'SHA256SUMS.txt'
  $setup = Join-Path $dir $asset
  Write-Host "Downloading Wrangl $tag ..."
  Invoke-WebRequest -Uri "$BaseUrl/releases/download/$tag/SHA256SUMS.txt" -OutFile $sums -UseBasicParsing
  Invoke-WebRequest -Uri "$BaseUrl/releases/download/$tag/$asset" -OutFile $setup -UseBasicParsing

  $line = Get-Content $sums | Where-Object { ($_ -split '\s+')[1] -eq $asset } | Select-Object -First 1
  if (-not $line) { throw "Integrity check failed, nothing was installed: no checksum for $asset" }
  $expected = ($line -split '\s+')[0].ToLower()
  $actual = (Get-FileHash -Algorithm SHA256 $setup).Hash.ToLower()
  if ($actual -ne $expected) { throw "Integrity check failed, nothing was installed: checksum for $asset did not match" }

  Write-Host 'Checksum OK. Running the installer ...'
  Start-Process -FilePath $setup -Wait
  Write-Host 'Done. Start Wrangl from the Start menu.'
}
finally {
  Remove-Item -Recurse -Force $dir -ErrorAction SilentlyContinue
}
