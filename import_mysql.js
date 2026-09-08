// Import using MySQL CLI via cmd /c with file redirection
const { exec } = require('child_process');
const fs = require('fs');

const OUTPUT_PATH = 'D:/wwwroot/jianyioa-system/migrate_final.sql';
const MYSQL_BIN = 'D:/BtSoft/mysql/MySQL5.5/bin/mysql.exe';
const MYSQL_USER = 'jianyioa';
const MYSQL_PASS = 'zpfbAsxyA76P2ZHw';
const MYSQL_DB = 'jianyioa';

// Using PowerShell to run mysql with stdin from file
const ps = `
$ErrorActionPreference = "Stop"
$sql = Get-Content '${OUTPUT_PATH.replace(/\\/g, '\\\\')}' -Raw -Encoding UTF8
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = '${MYSQL_BIN.replace(/\\/g, '\\\\')}'
$psi.Arguments = '-u${MYSQL_USER} -p${MYSQL_PASS} ${MYSQL_DB}'
$psi.UseShellExecute = $false
$psi.RedirectStandardInput = $true
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.CreateNoWindow = $true
$proc = [System.Diagnostics.Process]::Start($psi)
$proc.StandardInput.Write($sql)
$proc.StandardInput.Close()
$stdout = $proc.StandardOutput.ReadToEnd()
$stderr = $proc.StandardError.ReadToEnd()
$proc.WaitForExit()
Write-Host "Exit code: $($proc.ExitCode)"
if ($stderr) { Write-Host "STDERR: $stderr" }
`;

const { spawn } = require('child_process');
const psProc = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], {
  windowsHide: true
});

let out = '';
let err = '';
psProc.stdout.on('data', d => out += d);
psProc.stderr.on('data', d => err += d);
psProc.on('close', code => {
  console.log('Exit code:', code);
  if (err) console.log('Errors:', err.substring(0, 500));
  console.log(out.substring(0, 300));
});
