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
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$api = Join-Path $root "packages\api"

# tsx is hoisted to the workspace root by npm; resolve it from there.
$tsxEntry = "$root\node_modules\tsx\dist\cli.mjs"
if (-not (Test-Path $tsxEntry)) { throw "tsx cli not found at $tsxEntry (run npm install at repo root)" }

# Boot env: absolute SQLite URL (Prisma would otherwise resolve relative to the schema dir),
# mock Redis so no broker is needed for a compare run.
# ADMIN_API_KEY: prod has one set, so prod's moderation/admin probes 401; the
# candidate must too or the -Full byte-compare counts those 3 probes as fails
# (503-instead-of-401). Deterministic compare-only value, never a real secret.
$dbUrl = "file:$($api.Replace('\', '/'))/prisma/prisma/dev.db"
$adminKey = if ($env:COMPARE_ADMIN_API_KEY) { $env:COMPARE_ADMIN_API_KEY } else { "contract-compare-admin-key" }

# PS5-compatible bootstrap: cmd /c with cwd pinned to packages/api.
$cmd = "cmd /c `"cd /d `"$api`" && set PORT=3197&& set MOCK_REDIS=1&& set DATABASE_URL=$dbUrl&& set ADMIN_API_KEY=$adminKey&& set NODE_ENV=development&& node `"$tsxEntry`" src\server.ts`""

# Server stdout/stderr land here so a failed boot is diagnosable after the fact.
$bootLog = "$root\tmp\api-boot.log"

# Stop-Process kills only the cmd wrapper; the node server child survives as an
# orphan still holding :3197 (breaks every later compare run until killed by
# hand). taskkill /T takes down the whole tree.
function Kill-Tree([int]$ProcessId) {
  if (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue) {
    cmd /c "taskkill /PID $ProcessId /T /F" 2>$null | Out-Null
    if (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue) {
      Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
    }
  }
}

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
  if ($proc) { Kill-Tree $proc.Id }
  Write-Output "[run-compare] boot log:"
  Get-Content $bootLog -ErrorAction SilentlyContinue
  throw "API never became healthy on :3197"
}
Write-Output "[run-compare] API up; comparing..."

try {
  $harnessArgs = @("$root\scripts\contract-compare.mjs", "--candidate", "http://127.0.0.1:3197")
  if ($NoProd) { $harnessArgs += "--no-prod" }
  if ($Full) { $harnessArgs += "--full" }
  # Approved-divergence ledger (documented shape/data divergences) so the gate
  # counts only NEW divergences as failures; run from any checkout dir.
  $harnessArgs += @("--approved-file", "$root\scripts\approved-divergences.json")
  if ($Report -eq "") { $Report = "$root\tmp\contract-compare.json" }
  $harnessArgs += @("--report", $Report)
  node @harnessArgs
  $exit = $LASTEXITCODE
  Write-Output "[run-compare] harness exit $exit (report: $Report)"
  exit $exit
} finally {
  if ($proc) { Kill-Tree $proc.Id }
}
