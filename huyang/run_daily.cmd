@echo off
rem 휴양림 빈자리 하루 한 번 모으기 — 미니PC의 예약된 작업이 새벽에 이것을 부른다.
rem 로그는 덧붙여 쌓되, 너무 커지면 앞을 버린다(마지막 2000줄만 남긴다).
chcp 65001 > nul
set PY=C:\Users\onmis\AppData\Local\Programs\Python\Python312\python.exe
set BASE=C:\Users\onmis\project
set DATA=%BASE%\huyang_data
set LOG=%DATA%\collect.log

if not exist "%DATA%" mkdir "%DATA%"
echo. >> "%LOG%"
echo ===== %DATE% %TIME% 시작 ===== >> "%LOG%"
"%PY%" "%BASE%\huyang\collect.py" >> "%LOG%" 2>&1
echo ===== %DATE% %TIME% 끝 (결과코드 %ERRORLEVEL%) ===== >> "%LOG%"

powershell -NoProfile -Command "$p='%LOG%'; $l=Get-Content -LiteralPath $p; if ($l.Count -gt 2000) { $l[-2000..-1] | Set-Content -LiteralPath $p -Encoding UTF8 }"
