# Self-contained compare-runner for Windows/PowerShell 5.1:
# - starts the monorepo API on :3197 (tsx cli), waits for health
# - runs scripts/contract-compare.mjs against prod + local
# - restores cleanup on exit
# Usage: .\scripts\run-compare.ps1 [-NoProd] [-Full] [-Report <path>]
param(
  [switch]$NoProd,
  [switch]$Full,
  [string]$Report = ""
)
$ErrorActionPreference = "Stop"
$root = "D:\paperclip-data\instances\default\workspaces\50d35b5d-c5bf-4e6f-ab78-15a1008ada91"
$api = "$root\packages\api"

# tsx is hoisted to the workspace root by npm; resolve it from there.
$tsxEntry = "$root\node_modules\tsx\dist\cli.mjs"
if (-not (Test-Path $tsxEntry)) { throw "tsx cli not found at $tsxEntry (run npm install at repo root)" }

# Boot env: absolute SQLite URL (Prisma would otherwise resolve relative to the schema dir),
# mock Redis so no broker is needed for a compare run.
$dbUrl = "file:$($api.Replace('\', '/'))/prisma/prisma/dev.db"

# PS5-compatible bootstrap: cmd /c with cwd pinned to packages/api.
$cmd = "cmd /c `"cd /d `"$api`" && set PORT=3197&& set MOCK_REDIS=1&& set DATABASE_URL=$dbUrl&& set NODE_ENV=development&& node `"$tsxEntry`" src\server.ts`""

# Server stdout/stderr land here so a failed boot is diagnosable after the fact.
$bootLog = "$root\tmp\api-boot.log"

$proc = Start-Process -FilePath cmd -ArgumentList "/c", "$cmd > `"$bootLog`" 2>&1" -PassThru -WindowStyle Hidden
Write-Output "[run-compare] server starting (PID $($proc.Id))"

$ready = $false
for ($i = 0; $i -lt 30; $i++) {
  $code = & curl.exe -s -o NUL -w "%{http_code}" "http://127.0.0.1:3197/api/health" 2>$null
  if ($code -eq "200") { $ready = $true; break }
  if ($proc.HasExited) { break }
  Start-Sleep -Seconds 2
}
if (-not $ready) {
  if ($proc -and !$proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
  Write-Output "[run-compare] boot log:"
  Get-Content $bootLog -ErrorAction SilentlyContinue
  throw "API never became healthy on :3197"
}
Write-Output "[run-compare] API up; comparing..."

try {
  $harnessArgs = @("$root\scripts\contract-compare.mjs", "--candidate", "http://127.0.0.1:3197")
  if ($NoProd) { $harnessArgs += "--no-prod" }
  if ($Full) { $harnessArgs += "--full" }
  if ($Report -eq "") { $Report = "$root\tmp\contract-compare.json" }
  $harnessArgs += @("--report", $Report)
  node @harnessArgs
  $exit = $LASTEXITCODE
  Write-Output "[run-compare] harness exit $exit (report: $Report)"
  exit $exit
} finally {
  if ($proc -and !$proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
}
