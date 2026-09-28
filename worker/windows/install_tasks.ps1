# Creates the two scheduled tasks for the Hitlist worker.
# Run from an Administrator PowerShell:
#   powershell -ExecutionPolicy Bypass -File C:\Hitlist\worker\windows\install_tasks.ps1 -AsSystem
# -AsSystem runs the tasks under Windows' SYSTEM account (no password needed; recommended).
# Without it, the tasks run as you and the script asks for your Windows password.
param([switch]$AsSystem)
$ErrorActionPreference = "Stop"
$here   = Split-Path -Parent $MyInvocation.MyCommand.Path
$worker = Split-Path -Parent $here

if ($AsSystem) {
    $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
    # SYSTEM can't see the browser Playwright installed in your user profile, so point it there.
    $pw = Join-Path $env:LOCALAPPDATA "ms-playwright"
    $envFile = Join-Path $worker ".env"
    if ((Test-Path $pw) -and -not (Select-String -Path $envFile -Pattern "^PLAYWRIGHT_BROWSERS_PATH=" -Quiet)) {
        Add-Content -Path $envFile -Value "`r`nPLAYWRIGHT_BROWSERS_PATH=$pw"
        Write-Host "Added PLAYWRIGHT_BROWSERS_PATH=$pw to .env"
    }
    Write-Host "Tasks will run as SYSTEM, even when nobody is logged in."
} else {
    $user = (whoami)
    $cred = Get-Credential -UserName $user -Message "Windows password for $user (not a PIN)"
    $principal = $null
    $pass = $cred.GetNetworkCredential().Password
}

function Add-Task($name, $action, $trigger, $settings) {
    if ($AsSystem) {
        Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings `
            -Principal $principal -Force | Out-Null
    } else {
        Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings `
            -User $user -Password $pass -RunLevel Highest -Force | Out-Null
    }
}

# 1. Worker: starts with Windows, never times out, restarts if it stops
$s1 = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) `
        -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 5) `
        -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew
$a1 = New-ScheduledTaskAction -Execute "$here\run_worker.bat" -WorkingDirectory $worker
$t1 = New-ScheduledTaskTrigger -AtStartup
Add-Task "Hitlist worker" $a1 $t1 $s1

# 2. Weekly summary: Mondays 6:15 AM
$s2 = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Hours 1) `
        -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
$a2 = New-ScheduledTaskAction -Execute "$here\weekly_summary.bat" -WorkingDirectory $worker
$t2 = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At 6:15am
Add-Task "Hitlist weekly summary" $a2 $t2 $s2

Start-ScheduledTask -TaskName "Hitlist worker"
Start-Sleep -Seconds 3
Get-ScheduledTask -TaskName "Hitlist*" | Select-Object TaskName, State | Format-Table -AutoSize
Write-Host "Done. The worker log is $worker\logs\worker.log"
