@echo off
rem 휴양림 빈자리 하루 한 번 모으기 — 미니PC의 예약된 작업이 새벽에 이것을 부른다.
rem
rem 기록은 파이썬이 직접 남긴다(--log). 여기서 echo 로 적으면 한 파일에 글자
rem 방식이 섞여 한글이 깨진다. -u 를 붙이는 것은 진행을 한 줄씩 바로 보기 위함이다.
rem 붙이지 않으면 파이썬이 글을 모아 두었다가 끝날 때 한꺼번에 쓴다.
set PY=C:\Users\onmis\AppData\Local\Programs\Python\Python312\python.exe
set BASE=C:\Users\onmis\project
set DATA=%BASE%\huyang_data
set LOG=%DATA%\collect.log

if not exist "%DATA%" mkdir "%DATA%"
"%PY%" -u "%BASE%\huyang\collect.py" --log "%LOG%"

rem 기록이 너무 커지면 앞을 버린다(마지막 2000줄만 남긴다).
powershell -NoProfile -Command "$p='%LOG%'; if (Test-Path $p) { $l=Get-Content -LiteralPath $p -Encoding UTF8; if ($l.Count -gt 2000) { $l[-2000..-1] | Set-Content -LiteralPath $p -Encoding UTF8 } }"
