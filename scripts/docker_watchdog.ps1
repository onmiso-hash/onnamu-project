# 도커 감시 — 엔진이 멈췄으면 도커 데스크톱을 다시 띄운다.
#
# 왜 필요한가: 2026-09-05·09-09·09-13 세 번, 윈도우 업데이트가 WSL을 갱신하면서
# 도커의 리눅스 가상머신이 꺼졌고 웹서비스 12개가 10~34시간 멈췄다. 도커가 스스로
# 켜지는 장치는 '로그인할 때 자동 실행' 하나뿐인데, WSL 갱신은 재부팅도 로그아웃도
# 일으키지 않으므로 그 방아쇠가 당겨지지 않았다.
#
# 어떻게 도는가: 작업 스케줄러가 3분마다 onmiso 의 로그인 세션 안에서 이 파일을
# 부른다(예약 작업 NamuDockerWatchdog). 로그인 세션 안이어야 하는 이유 — 원격 접속
# (SSH)에서 띄운 도커 데스크톱은 접속이 끝날 때 함께 정리된다(2026-09-10·09-14 실측).
#
# 판단: 엔진이 두 번 연속(약 3~6분) 응답하지 않을 때만 다시 띄운다. 한 번으로 하면
# 도커 데스크톱이 스스로 업데이트하거나 켜지는 중인 짧은 틈에 끼어든다. 다시 띄운
# 뒤 10분 동안은 또 건드리지 않는다 — 켜지는 데 약 80초가 걸리고, 그 사이에
# 거듭 죽이면 영영 못 올라온다.
#
# 설치(미니PC, 한 번): scripts\docker_watchdog.ps1 -Install

param([switch]$Install)

$ErrorActionPreference = 'Continue'
$root      = Join-Path $env:USERPROFILE 'docker_watchdog'
$stateFile = Join-Path $root 'state.json'
$logFile   = Join-Path $root 'watchdog.log'
$desktop   = 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
$docker    = 'C:\Program Files\Docker\Docker\resources\bin\docker.exe'
$taskName  = 'NamuDockerWatchdog'

New-Item -ItemType Directory -Force -Path $root | Out-Null

function Write-Log($msg) {
    $line = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + ' ' + $msg
    Add-Content -Path $logFile -Value $line -Encoding UTF8
    # 1MB를 넘으면 최근 2000줄만 남긴다 — 이상이 있을 때만 적으므로 드물게 일어난다.
    if ((Get-Item $logFile).Length -gt 1MB) {
        Get-Content $logFile -Tail 2000 | Set-Content ($logFile + '.tmp') -Encoding UTF8
        Move-Item ($logFile + '.tmp') $logFile -Force
    }
}

if ($Install) {
    $self = $MyInvocation.MyCommand.Path
    $arg  = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $self + '"'
    $action    = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arg
    $trigger   = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
                    -RepetitionInterval (New-TimeSpan -Minutes 3)
    $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive
    $settings  = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
                    -ExecutionTimeLimit (New-TimeSpan -Minutes 2) -MultipleInstances IgnoreNew `
                    -StartWhenAvailable
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
        -Principal $principal -Settings $settings -Force | Out-Null
    Write-Log ('설치: 예약 작업 ' + $taskName + ' 등록 (3분 간격)')
    Get-ScheduledTask -TaskName $taskName | Select-Object TaskName, State
    exit 0
}

# 이전 상태 읽기
$state = @{ fails = 0; lastRestart = '' }
if (Test-Path $stateFile) {
    try {
        $raw = Get-Content $stateFile -Raw | ConvertFrom-Json
        $state.fails = [int]$raw.fails
        $state.lastRestart = [string]$raw.lastRestart
    } catch {}
}

# 엔진이 응답하는가 — docker 명령은 엔진이 반쯤 죽었을 때 한없이 멈출 수 있어
# 30초 넘게 걸리면 응답하지 않은 것으로 본다.
function Test-Engine {
    try {
        $p = Start-Process -FilePath $docker -ArgumentList 'info', '--format', '{{.ServerVersion}}' `
                -NoNewWindow -PassThru -RedirectStandardOutput (Join-Path $root 'info.out') `
                -RedirectStandardError (Join-Path $root 'info.err')
        if (-not $p.WaitForExit(30000)) { try { $p.Kill() } catch {}; return $false }
        return ($p.ExitCode -eq 0)
    } catch { return $false }
}

$ok = Test-Engine

if ($ok) {
    if ($state.fails -gt 0) { Write-Log ('엔진 응답 회복 (연속 실패 ' + $state.fails + '회 뒤)') }
    $state.fails = 0
} else {
    $state.fails += 1
    Write-Log ('엔진 응답 없음 — 연속 ' + $state.fails + '회')

    $cooling = $false
    if ($state.lastRestart) {
        $since = (Get-Date) - [datetime]::Parse($state.lastRestart)
        if ($since.TotalMinutes -lt 10) { $cooling = $true }
    }
    # 로그인 직후처럼 도커 데스크톱이 방금 켜지는 중이면 기다린다.
    $young = Get-Process 'Docker Desktop' -EA 0 |
             Where-Object { $_.StartTime -gt (Get-Date).AddMinutes(-5) }

    if ($state.fails -ge 2 -and -not $cooling -and -not $young) {
        Write-Log '도커 데스크톱을 다시 띄운다'
        Get-Process 'Docker Desktop', 'com.docker.backend', 'com.docker.build' -EA 0 |
            Stop-Process -Force -EA 0
        Start-Sleep -Seconds 5
        Start-Process -FilePath $desktop
        $state.lastRestart = (Get-Date).ToString('o')
        $state.fails = 0
    }
}

$state | ConvertTo-Json | Set-Content $stateFile -Encoding UTF8
exit 0
