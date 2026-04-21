$root = "C:\Users\ripre\Documents\Proyectos\CanTrack-CRM\.claude\worktrees\dreamy-lovelace"
$npx  = "C:\Program Files\nodejs\npx.cmd"
$py   = "python"

# Kill leftover node processes
Write-Host "Stopping any running node processes..." -ForegroundColor Yellow
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1

# 1. SSH Tunnel — open in its own CMD window
Write-Host "Starting SSH tunnel..." -ForegroundColor Cyan
Start-Process cmd.exe -ArgumentList "/k title TUNNEL && cd /d `"$root`" && $py tunnel.py" -WindowStyle Normal

Write-Host "Waiting 5s for tunnel to establish..." -ForegroundColor Gray
Start-Sleep -Seconds 5

# 2. Backend server — open in its own CMD window
Write-Host "Starting backend (port 3000)..." -ForegroundColor Cyan
Start-Process cmd.exe -ArgumentList "/k title BACKEND && cd /d `"$root`" && `"$npx`" tsx server.ts" -WindowStyle Normal

Write-Host "Waiting 6s for backend..." -ForegroundColor Gray
Start-Sleep -Seconds 6

# 3. Vite frontend — open in its own CMD window
Write-Host "Starting Vite (port 5173)..." -ForegroundColor Cyan
Start-Process cmd.exe -ArgumentList "/k title VITE && cd /d `"$root`" && `"$npx`" vite" -WindowStyle Normal

Write-Host ""
Write-Host "==================================" -ForegroundColor Green
Write-Host " App running at http://localhost:5173" -ForegroundColor Green
Write-Host " Login: admin@cantrack.com" -ForegroundColor Green
Write-Host " Pass:  Admin123!" -ForegroundColor Green
Write-Host "==================================" -ForegroundColor Green
