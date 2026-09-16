# Registrerar KalenderBradet-Rek i Schemaläggaren: varje dag 07:50 skrivs EN ny
# förbättringsidé för Kalenderbrädet till The Work List (tools/daglig-rek.js).
# Kör:  powershell -ExecutionPolicy Bypass -File tools\install-rek.ps1
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$launcher = Join-Path $dir 'KalenderBradet-Rek.vbs'
$action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument ('"' + $launcher + '"')
$trigger = New-ScheduledTaskTrigger -Daily -At 07:50
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName 'KalenderBradet-Rek' -Action $action -Trigger $trigger -Settings $settings -Description 'Kalenderbrädet: varje dag 07:50 en ny rekommendation om vad appen kan göra bättre, till The Work List (tools/daglig-rek.js). Väcker inte datorn; missas den tas den igen av Rutin-Vakt.' -Force | Out-Null
$t = Get-ScheduledTask -TaskName 'KalenderBradet-Rek'
Write-Output ("KalenderBradet-Rek: " + $t.State + " · " + $t.Triggers[0].StartBoundary)