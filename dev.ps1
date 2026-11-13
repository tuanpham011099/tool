$ErrorActionPreference = 'Stop'
$python = Join-Path $PSScriptRoot 'server\.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python)) {
    throw 'Backend dependencies missing. Run: cd server; python -m venv .venv; .\.venv\Scripts\python.exe -m pip install -r requirements.txt'
}
$serverPath = Join-Path $PSScriptRoot 'server'
$webPath = Join-Path $PSScriptRoot 'web'
$api = Start-Process -FilePath $python -ArgumentList '-m','uvicorn','app.main:app','--host','127.0.0.1','--port','8000' -WorkingDirectory $serverPath -WindowStyle Hidden -PassThru
try {
    Start-Sleep -Seconds 2
    if ($api.HasExited) { throw 'Backend failed to start. Check Python and port 8000.' }
    Write-Host 'Open http://localhost:3000 (API on port 8000).'
    Push-Location $webPath
    try { npm run dev } finally { Pop-Location }
} finally {
    Stop-Process -Id $api.Id -ErrorAction SilentlyContinue
}
