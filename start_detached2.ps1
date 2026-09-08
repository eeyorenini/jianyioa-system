# Run this via Start-Job to launch server in a detached session
$ErrorActionPreference = "Continue"

$serverDir = "D:\wwwroot\jianyioa-system"
$logFile = "$serverDir\detached_out.log"

# Start node in a NEW detached powershell that survives our session
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = "powershell.exe"
$psi.Arguments = "-NoProfile -WindowStyle Hidden -Command `"Set-Location '$serverDir'; node server.js 2>>'$logFile'`""
$psi.UseShellExecute = $false
$psi.CreateNoWindow = $true
$psi.WorkingDirectory = $serverDir

$proc = [System.Diagnostics.Process]::Start($psi)
"Started at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), PID=$($proc.Id)" | Out-File "$serverDir\detached_pid.txt" -Encoding utf8
