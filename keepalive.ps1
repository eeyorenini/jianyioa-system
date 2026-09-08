# Keep jianyioa-server alive via Windows Task Scheduler
# This script is invoked by Task Scheduler to ensure the Node.js server stays running

$ErrorActionPreference = "Stop"
$logFile = "D:\wwwroot\jianyioa-system\keepalive.log"

function log($msg) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "$ts $msg" | Out-File -FilePath $logFile -Append -Encoding utf8
}

log "=== KeepAlive check started ==="

# Check if server is already running (port 3001)
$portCheck = netstat -ano | Select-String ":3001\s+.*LISTENING"
log "Port check result: $portCheck"

if ($portCheck) {
    log "Server already listening on 3001 - nothing to do"
    exit 0
}

log "Server not running on 3001 - starting it"
$null = Start-Process -FilePath "node" `
                      -ArgumentList "D:\wwwroot\jianyioa-system\server.js" `
                      -WorkingDirectory "D:\wwwroot\jianyioa-system" `
                      -WindowStyle Hidden `
                      -PassThru

log "Server start triggered"
