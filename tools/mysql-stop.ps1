# Stop portable MySQL cleanly
$root       = "C:\Users\D047\Gold\tools\mysql"
$myini      = Join-Path $root "my.ini"
$mysqladmin = Join-Path $root "mysql-8.4.0-winx64\bin\mysqladmin.exe"

if (-not (Get-NetTCPConnection -State Listen -LocalPort 3306 -ErrorAction SilentlyContinue)) {
    Write-Host "MySQL already stopped." -ForegroundColor DarkGray
    exit 0
}

& $mysqladmin --defaults-file="$myini" -u root --skip-password shutdown
Write-Host "OK: MySQL stopped" -ForegroundColor Green
