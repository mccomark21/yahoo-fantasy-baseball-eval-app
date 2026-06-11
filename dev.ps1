$port = 5173
$url  = "http://localhost:$port/yahoo-fantasy-baseball-eval-app/"

# Kill anything already on the port
$proc = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess
if ($proc) { Stop-Process -Id $proc -Force -ErrorAction SilentlyContinue }

# Start dev server
$job = Start-Process -FilePath "npm" -ArgumentList "run", "dev", "--", "--port", $port `
    -WorkingDirectory $PSScriptRoot -PassThru -NoNewWindow

Write-Host "Starting dev server (pid $($job.Id))..."
Start-Sleep -Seconds 3

# Open in default browser
Start-Process $url
Write-Host "Opened $url"
Write-Host "Press Ctrl+C to stop."

# Keep the window alive so server stays up
try { $job.WaitForExit() } catch { }
