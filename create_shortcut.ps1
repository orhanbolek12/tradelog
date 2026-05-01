$WshShell = New-Object -comObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("$env:USERPROFILE\Desktop\TradeLog.lnk")
$Shortcut.TargetPath = "$env:USERPROFILE\.gemini\antigravity\scratch\tradelog\start.bat"
$Shortcut.WorkingDirectory = "$env:USERPROFILE\.gemini\antigravity\scratch\tradelog"
$Shortcut.Description = "TradeLog Trading Journal Dashboard"
$Shortcut.IconLocation = "$env:USERPROFILE\.gemini\antigravity\scratch\tradelog\icon.ico"
$Shortcut.WindowStyle = 7
$Shortcut.Save()
Write-Host "Desktop shortcut created successfully!"
