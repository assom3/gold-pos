# Start portable MySQL
$root    = "C:\Users\D047\Gold\tools\mysql"
$myini   = Join-Path $root "my.ini"
$mysqld  = Join-Path $root "mysql-8.4.0-winx64\bin\mysqld.exe"

if (Get-NetTCPConnection -State Listen -LocalPort 3306 -ErrorAction SilentlyContinue) {
    Write-Host "MySQL already listening on 3306" -ForegroundColor DarkGray
    exit 0
}

Start-Process -FilePath $mysqld -ArgumentList "--defaults-file=`"$myini`"" -WindowStyle Hidden
for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Milliseconds 500
    if (Get-NetTCPConnection -State Listen -LocalPort 3306 -ErrorAction SilentlyContinue) {
        Write-Host "OK: MySQL started" -ForegroundColor Green
        exit 0
    }
}
Write-Host "ERROR: MySQL did not start - see tools/mysql/data/mysql-error.log" -ForegroundColor Red
exit 1
