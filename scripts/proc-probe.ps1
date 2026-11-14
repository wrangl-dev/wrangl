Get-Process | Where-Object { $_.ProcessName -match 'wrangl|wrangl|webview' } |
  Select-Object Id, ProcessName, StartTime, @{n='WS_MB';e={[math]::Round($_.WorkingSet64/1MB)}}, @{n='CPU_s';e={[math]::Round($_.CPU,1)}} |
  Format-Table -AutoSize

"--- installed binary ---"
Test-Path "$env:LOCALAPPDATA\Wrangl\wrangl.exe"
Test-Path "$env:LOCALAPPDATA\Wrangl Manager\wrangl-manager.exe"
