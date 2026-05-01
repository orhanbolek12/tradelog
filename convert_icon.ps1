Add-Type -AssemblyName System.Drawing
$pngPath = "C:\Users\orhan.bolek\.gemini\antigravity\scratch\tradelog\icon.png"
$icoPath = "C:\Users\orhan.bolek\.gemini\antigravity\scratch\tradelog\icon.ico"

try {
    $bitmap = [System.Drawing.Bitmap]::FromFile($pngPath)
    $hIcon = $bitmap.GetHicon()
    $icon = [System.Drawing.Icon]::FromHandle($hIcon)
    $fileStream = [System.IO.File]::Create($icoPath)
    $icon.Save($fileStream)
    $fileStream.Close()
    $bitmap.Dispose()
    Write-Host "Icon converted successfully!"
} catch {
    Write-Error "Failed to convert icon: $_"
}
