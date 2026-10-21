# Isolated tests simulate host lifecycle; no real vault is touched.
$ErrorActionPreference = 'Stop'
$global:ppnInstallerTestRunning = $false
$global:ppnInstallerTestFailCopy = $false
function Get-Process { param($Name, $ErrorAction) if ($global:ppnInstallerTestRunning) { return @{ Name = 'Obsidian' } } }
function Copy-Item {
    param($LiteralPath, $Destination, [switch]$Recurse, [switch]$Force)
    if ($global:ppnInstallerTestFailCopy -and (Split-Path -Leaf $LiteralPath) -eq 'styles.css') {
        $global:ppnInstallerTestFailCopy = $false
        throw 'Simulated copy failure'
    }
    Microsoft.PowerShell.Management\Copy-Item @PSBoundParameters
}
function Assert($Condition, $Message) { if (-not $Condition) { throw $Message } }
function Expect-Failure([scriptblock]$Action, [string]$Pattern) {
    $caught = $false
    try { & $Action | Out-Null } catch { $caught = $true; Assert ($_.Exception.Message -like "*$Pattern*") "Unexpected failure: $_" }
    Assert $caught 'Expected a failure'
}
$base = [IO.Path]::GetTempPath()
$testRoot = Join-Path $base ('ppn-test-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
$release = Join-Path $testRoot 'release'
$vault = Join-Path $testRoot 'v space'
$config = Join-Path $vault '.obsidian-work'
$target = Join-Path $config 'plugins\personal-pinned-notes'
$installer = Join-Path $release 'scripts\install.ps1'
try {
    New-Item -ItemType Directory -Path (Split-Path $installer), $config -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'install.ps1') -Destination $installer
    foreach ($file in @('main.js', 'background.cjs', 'styles.css')) { Set-Content -LiteralPath (Join-Path $release $file) -Value "new-$file" }
    Set-Content -LiteralPath (Join-Path $release 'manifest.json') -Value '{"id":"personal-pinned-notes","version":"0.1.0"}'
    $enabledPath = Join-Path $config 'community-plugins.json'
    Set-Content -LiteralPath $enabledPath -Value '[]'
    & $installer -VaultPath $vault -ConfigDir '.obsidian-work' -Enable -DryRun | Out-Null
    Set-Content -LiteralPath $enabledPath -Value '[null]'
    Expect-Failure { & $installer -VaultPath $vault -ConfigDir '.obsidian-work' -Enable -DryRun } 'non-string'
    Set-Content -LiteralPath $enabledPath -Value '["office-flow"]'
    & $installer -VaultPath $vault -ConfigDir '.obsidian-work' -Enable -DryRun | Out-Null
    Assert (-not (Test-Path -LiteralPath $target)) 'Dry run wrote files'
    $global:ppnInstallerTestRunning = $true
    Expect-Failure { & $installer -VaultPath $vault -ConfigDir '.obsidian-work' } 'Fully quit'
    Assert (-not (Test-Path -LiteralPath $target)) 'Running-host rejection wrote files'
    $global:ppnInstallerTestRunning = $false
    & $installer -VaultPath $vault -ConfigDir '.obsidian-work' -Enable | Out-Null
    $parsed = Get-Content -LiteralPath $enabledPath -Raw | ConvertFrom-Json
    $enabled = @($parsed)
    Assert ($enabled.Count -eq 2 -and $enabled -contains 'office-flow' -and $enabled -contains 'personal-pinned-notes') 'Enable lost other plugins'
    Set-Content -LiteralPath (Join-Path $target 'data.json') -Value '{"private":"keep"}'
    Set-Content -LiteralPath (Join-Path $target 'main.js') -Value 'old-main'
    & $installer -VaultPath $vault -ConfigDir '.obsidian-work' -Enable | Out-Null
    Assert ((Get-Content -LiteralPath (Join-Path $target 'data.json') -Raw).Trim() -eq '{"private":"keep"}') 'Settings overwritten'
    $backups = @(Get-ChildItem -LiteralPath (Join-Path $config 'plugin-backups') -Directory | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'plugin\main.js') })
    Assert ($backups.Count -eq 1) 'Upgrade backup missing'
    Assert ((Get-Content -LiteralPath (Join-Path $backups[0].FullName 'plugin\main.js') -Raw).Trim() -eq 'old-main') 'Backup incorrect'
    $parsed = Get-Content -LiteralPath $enabledPath -Raw | ConvertFrom-Json
    Assert (@($parsed).Count -eq 2) 'Repeated enable duplicated entry'
    Set-Content -LiteralPath (Join-Path $target 'main.js') -Value 'rollback-main'
    $global:ppnInstallerTestFailCopy = $true
    Expect-Failure { & $installer -VaultPath $vault -ConfigDir '.obsidian-work' -Enable } 'Simulated copy failure'
    Assert ((Get-Content -LiteralPath (Join-Path $target 'main.js') -Raw).Trim() -eq 'rollback-main') 'Rollback failed'
    Set-Content -LiteralPath $enabledPath -Value '{}'
    Expect-Failure { & $installer -VaultPath $vault -ConfigDir '.obsidian-work' -Enable } 'JSON array'
    Expect-Failure { & $installer -VaultPath $vault -ConfigDir '..' } 'single folder'
    Set-Content -LiteralPath (Join-Path $release 'manifest.json') -Value '{"id":"wrong","version":"0.1.0"}'
    Expect-Failure { & $installer -VaultPath $vault -ConfigDir '.obsidian-work' } 'identity'
    Write-Output 'Installer tests passed: dry run, active host, custom path, enable, backup, settings preservation, idempotency, rollback, malformed config, path validation, identity.'
} finally {
    $resolved = [IO.Path]::GetFullPath($testRoot)
    if ($resolved.StartsWith([IO.Path]::GetFullPath($base), [StringComparison]::OrdinalIgnoreCase) -and (Split-Path -Leaf $resolved) -like 'ppn-test-*') {
        if (Test-Path -LiteralPath $resolved) { Remove-Item -LiteralPath $resolved -Recurse -Force }
    } else { throw 'Unsafe test cleanup path' }
}
