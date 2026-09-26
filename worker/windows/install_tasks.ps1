# Creates the two scheduled tasks for the Hitlist worker.
# Run from an Administrator PowerShell:
#   powershell -ExecutionPolicy Bypass -File C:\Hitlist\worker\windows\install_tasks.ps1
$ErrorActionPreference = "Stop"
$here   = Split-Path -Parent $MyInvocation.MyCommand.Path
$worker = Split-Path -Parent $here
$user   = (whoami)

Write-Host "Tasks will run as $user, even when nobody is logged in."
$cred = Get-Credential -UserName $user -Message "Windows password for $user (not a PIN)"
$pass = $cred.GetNetworkCredential().Password

# 1. Worker: starts with Windows, never times out, restarts if it stops
$s1 = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) `
        -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 5) `
        -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew
$a1 = New-ScheduledTaskAction -Execute "$here\run_worker.bat" -WorkingDirectory $worker
$t1 = New-ScheduledTaskTrigger -AtStartup
Register-ScheduledTask -TaskName "Hitlist worker" -Action $a1 -Trigger $t1 -Settings $s1 `
    -User $user -Password $pass -RunLevel Highest -Force | Out-Null

# 2. Weekly summary: Mondays 7:00 AM
$s2 = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Hours 1) `
        -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
$a2 = New-ScheduledTaskAction -Execute "$here\weekly_summary.bat" -WorkingDirectory $worker
$t2 = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At 7:00am
Register-ScheduledTask -TaskName "Hitlist weekly summary" -Action $a2 -Trigger $t2 -Settings $s2 `
    -User $user -Password $pass -RunLevel Highest -Force | Out-Null

Start-ScheduledTask -TaskName "Hitlist worker"
Start-Sleep -Seconds 3
Get-ScheduledTask -TaskName "Hitlist*" | Select-Object TaskName, State | Format-Table -AutoSize
Write-Host "Done. The worker log is $worker\logs\worker.log"
