$root = "C:\Users\ripre\Documents\Proyectos\CanTrack-CRM\.claude\worktrees\dreamy-lovelace"
$npx  = "C:\Program Files\nodejs\npx.cmd"

Write-Host "Launching enrichment script in new CMD window..." -ForegroundColor Cyan

Start-Process cmd.exe -ArgumentList "/k title ENRICHMENT && cd /d `"$root`" && `"$npx`" tsx scripts/enrich-companies.ts" -WindowStyle Normal

Write-Host "Enrichment started. Watch the new CMD window for progress." -ForegroundColor Green
