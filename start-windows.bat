@echo off
chcp 65001 >nul
title Κοστολόγηση
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto nonode

echo.
echo Ενημέρωση βιβλιοθηκών (την πρώτη φορά μπορεί να πάρει 1-2 λεπτά)...
call npm install --no-audit --no-fund
if errorlevel 1 goto fail

echo.
echo Προετοιμασία εφαρμογής...
call npm run build
if errorlevel 1 goto fail

start "" cmd /c "timeout /t 4 /nobreak >nul & start http://localhost:3000"
echo.
echo ============================================================
echo  Η εφαρμογή τρέχει: http://localhost:3000
echo  ΜΗΝ κλείσετε αυτό το παράθυρο όσο τη χρησιμοποιείτε.
echo  Από το iPhone (ίδιο Wi-Fi): http://IP-του-υπολογιστή:3000
echo ============================================================
echo.
call npm start
goto end

:nonode
echo.
echo Δεν βρέθηκε το Node.js. Εγκαταστήστε το από https://nodejs.org (έκδοση LTS)
echo και μετά κάντε ξανά διπλό κλικ σε αυτό το αρχείο.
pause
exit /b 1

:fail
echo.
echo Κάτι πήγε στραβά. Στείλτε μια φωτογραφία αυτού του παραθύρου.
pause
exit /b 1

:end
pause
