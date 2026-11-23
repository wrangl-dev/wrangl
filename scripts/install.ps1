# Install Wrangl on Windows from its latest GitHub release.
#
#   irm https://raw.githubusercontent.com/wrangl-dev/wrangl/main/scripts/install.ps1 | iex
#
# Runs the per-user installer (no admin rights needed).
#
# Options (environment):
#   $env:WRANGL_VERSION = '0.2.0'     install that version instead of the latest
#   $env:WRANGL_DRY_RUN = '1'         print what would be downloaded, change nothing
#   $env:WRANGL_RELEASE_JSON = path   read the release from a file (for tests)

$ErrorActionPreference = 'Stop'
$repo = 'wrangl-dev/wrangl'

function Get-WranglRelease {
  if ($env:WRANGL_RELEASE_JSON) {
    return Get-Content -Raw $env:WRANGL_RELEASE_JSON | ConvertFrom-Json
  }
  $url = "https://api.github.com/repos/$repo/releases/latest"
  if ($env:WRANGL_VERSION) {
    $url = "https://api.github.com/repos/$repo/releases/tags/v$($env:WRANGL_VERSION.TrimStart('v'))"
  }
  try {
    return Invoke-RestMethod -Uri $url -Headers @{ Accept = 'application/vnd.github+json' }
  } catch {
    throw "wrangl: no release found at $url (is a release published?)"
  }
}

$release = Get-WranglRelease
$asset = $release.assets | Where-Object { $_.name -like '*_x64-setup.exe' } | Select-Object -First 1
if (-not $asset) { throw 'wrangl: the release has no Windows installer' }

if ($env:WRANGL_DRY_RUN -eq '1') {
  Write-Output $asset.browser_download_url
  return
}

$file = Join-Path ([IO.Path]::GetTempPath()) $asset.name
Write-Host "wrangl: downloading $($asset.name)"
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $file -UseBasicParsing
try {
  Write-Host 'wrangl: installing'
  $proc = Start-Process -FilePath $file -ArgumentList '/S' -Wait -PassThru
  if ($proc.ExitCode -ne 0) { throw "wrangl: the installer exited with code $($proc.ExitCode)" }
} finally {
  Remove-Item $file -ErrorAction SilentlyContinue
}
Write-Host 'wrangl: installed. Start Wrangl from the Start menu.'
