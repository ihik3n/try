@echo off
chcp 65001 >nul
title Κοστολόγηση - πρόσβαση από iPhone
rem Χρειάζονται δικαιώματα διαχειριστή για αλλαγές στο Τείχος προστασίας.
fltmc >nul 2>&1
if errorlevel 1 goto elevate

echo.
echo Ρύθμιση Τείχους προστασίας για πρόσβαση από iPhone/κινητό...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; Get-NetFirewallApplicationFilter | Where-Object { $_.Program -like '*\node.exe' } | Get-NetFirewallRule | Where-Object { $_.Direction -eq 'Inbound' -and $_.Action -eq 'Block' } | Remove-NetFirewallRule; Get-NetFirewallRule -DisplayName 'Kostologisi (iPhone)' -ErrorAction SilentlyContinue | Remove-NetFirewallRule; New-NetFirewallRule -DisplayName 'Kostologisi (iPhone)' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3000 -RemoteAddress LocalSubnet -Profile Any | Out-Null"
if errorlevel 1 goto fail

echo.
echo Έτοιμο. Το iPhone (στο ίδιο Wi-Fi) μπορεί πλέον να ανοίξει την εφαρμογή.
echo Επιτρέπονται μόνο συσκευές του τοπικού δικτύου, στη θύρα 3000.
echo.
pause
exit /b 0

:elevate
echo Χρειάζεται άδεια διαχειριστή: πατήστε «Ναι» στο παράθυρο που θα εμφανιστεί.
powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
exit /b 0

:fail
echo.
echo Δεν ήταν δυνατή η ρύθμιση. Στείλτε μια φωτογραφία αυτού του παραθύρου.
pause
exit /b 1
