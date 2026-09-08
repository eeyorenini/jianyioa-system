$ErrorActionPreference = "SilentlyContinue"

# Launch a detached PowerShell that starts node
# -WindowStyle Hidden: no window
# -PassThru: get process object (but not needed for persistence)
# The new powershell.exe becomes child of explorer.exe when parent dies

$proc = Start-Process -FilePath "powershell.exe" `
  -ArgumentList "-NoProfile -WindowStyle Hidden -Command `"Set-Location 'D:\wwwroot\jianyioa-system'; node server.js 2>>'D:\wwwroot\jianyioa-system\detached_out.log'"` `
  -PassThru `
  -WindowStyle Hidden

# Write PID to file so we can verify it later
"Detached node PID: $($proc.Id)" | Out-File "D:\wwwroot\jianyioa-system\detached_pid.txt" -Encoding utf8
