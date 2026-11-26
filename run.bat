@echo off
setlocal
cd /d "%~dp0"
title AegisCode AI - Experiments 13, 14 & 15 Runner

where node >nul 2>nul
if errorlevel 1 goto nonode
node -e "process.exit(Number(process.versions.node.split('.')[0])<20?1:0)"
if errorlevel 1 goto oldnode

if exist node_modules\express goto setup
echo.
echo Installing project packages (one time only, please wait)...
call npm install
if errorlevel 1 goto npmfail

:setup
if exist scripts\setup.js node scripts\setup.js

:menu
cls
echo.
echo  ╔══════════════════════════════════════════════════════════╗
echo  ║          A E G I S C O D E   A I                        ║
echo  ║      AI Code Security Auditor and Architecture Platform  ║
echo  ║               Experiments 13, 14 and 15                 ║
echo  ╚══════════════════════════════════════════════════════════╝
echo.
echo   13A  Experiment 13 - Step 1: Git setup and push to GitHub (auto)
echo   13B  Experiment 13 - Step 2: Take all 8 deployment screenshots (auto)
echo.
echo   14   Experiment 14 - Tests, audit, performance and Lighthouse (auto)
echo.
echo   15   Experiment 15 - Capstone screenshots with live Groq AI (auto)
echo.
echo   R    Run AegisCode AI locally at http://localhost:3015
echo   D    Change student name, roll number and section
echo   0    Exit
echo.
set "choice="
set /p choice= Type your choice and press Enter:
if /i "%choice%"=="0" goto end
if /i "%choice%"=="R" goto runapp
if /i "%choice%"=="D" goto details
if /i "%choice%"=="13A" goto exp13a
if /i "%choice%"=="13B" goto exp13b
if "%choice%"=="14" goto exp14
if "%choice%"=="15" goto exp15
goto menu

:exp13a
echo.
echo  Experiment 13 Step 1 - Automating Git commits, branch, PR push and v1.0.0 tag...
echo  You will need: Git installed + an empty GitHub repository URL.
echo.
node scripts\exp13_git.js
goto after

:exp13b
echo.
echo  Experiment 13 Step 2 - Automating all 8 deployment screenshots...
echo  You will need: your GitHub username, repo name, and live Render URL.
echo.
set "show="
set "watch="
set /p watch= Watch the browser while it works? Type Y or N:
if /i "%watch%"=="Y" set "show=--show"
node scripts\shots13.js %show%
goto after

:exp14
echo.
echo  Experiment 14 - Running tests, audit, performance benchmark and Lighthouse...
if exist node_modules\lighthouse goto exp14go
echo  Installing Lighthouse (one time only)...
call npm install lighthouse@12 --save-dev
:exp14go
node scripts\shots14.js
goto after

:exp15
echo.
echo  Experiment 15 - Setting up AI and capturing capstone screenshots...
node scripts\setup_ai.js
set "show="
set "watch="
set /p watch= Watch the browser while it works? Type Y or N:
if /i "%watch%"=="Y" set "show=--show"
node scripts\shots15.js %show%
goto after

:runapp
echo.
node scripts\setup_ai.js
echo  Starting AegisCode AI on http://localhost:3015 ...
echo  Press Ctrl+C in this window to stop the server.
npm start
goto menu

:details
node scripts\setup.js --edit
goto menu

:after
echo.
pause
goto menu

:nonode
echo.
echo  Node.js 20 or newer is required. Download from https://nodejs.org
echo  After installing, close this window and open run.bat again.
pause
exit /b 1

:oldnode
echo.
echo  Your Node.js is too old. Please update to v20 or newer from https://nodejs.org
pause
exit /b 1

:npmfail
echo.
echo  npm install failed. Check your internet connection and try again.
pause
exit /b 1

:end
endlocal
