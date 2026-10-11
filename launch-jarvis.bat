@echo off
title Launching JARVIS 2.0 Desktop App...
cd /d "%~dp0ui"
start "" npx electron .
exit
