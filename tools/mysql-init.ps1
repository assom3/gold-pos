# MySQL portable bootstrap (runs once)
$ErrorActionPreference = 'Stop'

$root    = "C:\Users\D047\Gold\tools\mysql"
$basedir = Join-Path $root "mysql-8.4.0-winx64"
$datadir = Join-Path $root "data"
$myini   = Join-Path $root "my.ini"
$mysqld  = Join-Path $basedir "bin\mysqld.exe"
$mysql   = Join-Path $basedir "bin\mysql.exe"

if (-not (Test-Path $mysqld)) { throw "mysqld not found: $mysqld" }

if (-not (Test-Path $datadir)) {
    Write-Host "-> initializing data directory..." -ForegroundColor Yellow
    & $mysqld --defaults-file="$myini" --initialize-insecure --console
    if ($LASTEXITCODE -ne 0) { throw "initialize failed (exit $LASTEXITCODE)" }
} else {
    Write-Host "-> data directory exists, skipping init." -ForegroundColor DarkGray
}

$listening = (Get-NetTCPConnection -State Listen -LocalPort 3306 -ErrorAction SilentlyContinue)
if (-not $listening) {
    Write-Host "-> starting server..." -ForegroundColor Yellow
    Start-Process -FilePath $mysqld -ArgumentList "--defaults-file=`"$myini`"" -WindowStyle Hidden
    $ok = $false
    for ($i = 0; $i -lt 60; $i++) {
        Start-Sleep -Milliseconds 500
        if (Get-NetTCPConnection -State Listen -LocalPort 3306 -ErrorAction SilentlyContinue) { $ok = $true; break }
    }
    if (-not $ok) { throw "server did not start. check tools/mysql/data/mysql-error.log" }
}

Write-Host "-> creating database and user..." -ForegroundColor Yellow
$sql = @"
CREATE DATABASE IF NOT EXISTS gold_pos CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER IF NOT EXISTS 'gold'@'localhost' IDENTIFIED BY 'Gold@Dev2026';
CREATE USER IF NOT EXISTS 'gold'@'127.0.0.1' IDENTIFIED BY 'Gold@Dev2026';
GRANT ALL PRIVILEGES ON gold_pos.* TO 'gold'@'localhost';
GRANT ALL PRIVILEGES ON gold_pos.* TO 'gold'@'127.0.0.1';
GRANT ALL PRIVILEGES ON ``prisma\_migrate\_shadow\_db\_%``.* TO 'gold'@'localhost';
GRANT ALL PRIVILEGES ON ``prisma\_migrate\_shadow\_db\_%``.* TO 'gold'@'127.0.0.1';
FLUSH PRIVILEGES;
"@
$tmp = Join-Path $env:TEMP "gold_mysql_init.sql"
Set-Content -Path $tmp -Value $sql -Encoding ASCII
& $mysql --defaults-file="$myini" -u root --skip-password -e "source $($tmp -replace '\\','/')"
if ($LASTEXITCODE -ne 0) { throw "database setup failed (exit $LASTEXITCODE)" }
Remove-Item $tmp -ErrorAction SilentlyContinue

Write-Host "OK: MySQL ready on 127.0.0.1:3306, database gold_pos" -ForegroundColor Green
