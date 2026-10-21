param(
    [switch]$Remove,
    [string]$ObsidianExe = (Join-Path $env:LOCALAPPDATA 'Programs\Obsidian\Obsidian.exe'),
    [string]$VaultId
)
$ErrorActionPreference = 'Stop'
$runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$entryName = 'PinnedNotesPersonal'
if ($Remove) {
    if (Get-ItemProperty -LiteralPath $runKey -Name $entryName -ErrorAction SilentlyContinue) {
        Remove-ItemProperty -LiteralPath $runKey -Name $entryName
    }
    Write-Output 'PinnedNotesPersonal login startup removed.'
    return
}
if (-not (Test-Path -LiteralPath $ObsidianExe -PathType Leaf)) { throw 'Obsidian executable not found.' }
if ($VaultId -notmatch '^[a-fA-F0-9]{16}$') { throw 'Pass the registered Obsidian vault ID.' }
$resolvedExe = (Resolve-Path -LiteralPath $ObsidianExe).Path
if ($resolvedExe.Contains('"')) { throw 'Invalid executable path.' }
$uri = 'obsidian://personal-pinned-startup?vault=' + $VaultId
$command = '"' + $resolvedExe + '" --ppn-background "' + $uri + '"'
if (-not (Test-Path -LiteralPath $runKey)) { New-Item -Path $runKey -Force | Out-Null }
New-ItemProperty -LiteralPath $runKey -Name $entryName -PropertyType String -Value $command -Force | Out-Null
Write-Output ((Get-ItemProperty -LiteralPath $runKey -Name $entryName).$entryName)
