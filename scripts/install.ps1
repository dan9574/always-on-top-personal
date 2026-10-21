param(
    [Parameter(Mandatory = $true)][string]$VaultPath,
    [string]$ConfigDir = '.obsidian',
    [switch]$Enable,
    [switch]$DryRun
)
$ErrorActionPreference = 'Stop'
$pluginId = 'personal-pinned-notes'
$files = @('main.js', 'background.cjs', 'manifest.json', 'styles.css')
if ($env:OS -ne 'Windows_NT') { throw 'This installer supports Windows only.' }
if ($ConfigDir -notmatch '^[\w.-]+$' -or $ConfigDir -in @('.', '..')) { throw 'ConfigDir must be a single folder name.' }
$vault = (Resolve-Path -LiteralPath $VaultPath).Path
$config = Join-Path $vault $ConfigDir
if (-not (Test-Path -LiteralPath $config -PathType Container)) { throw 'Existing Obsidian config folder not found. Open this vault in Obsidian first, or specify -ConfigDir.' }
$root = Split-Path -Parent $PSScriptRoot
$package = Join-Path $root "dist\$pluginId"
if (-not (Test-Path -LiteralPath $package -PathType Container)) { $package = $root }
foreach ($file in $files) {
    if (-not (Test-Path -LiteralPath (Join-Path $package $file) -PathType Leaf)) { throw "Package missing $file. Download the release ZIP or run npm run package first." }
}
$manifest = Get-Content -LiteralPath (Join-Path $package 'manifest.json') -Raw | ConvertFrom-Json
if ($manifest.id -ne $pluginId -or -not $manifest.version) { throw 'Package manifest identity is invalid.' }
$plugins = Join-Path $config 'plugins'
$target = Join-Path $plugins $pluginId
$enabledPath = Join-Path $config 'community-plugins.json'
$enabled = @()
if ($Enable -and (Test-Path -LiteralPath $enabledPath)) {
    $raw = Get-Content -LiteralPath $enabledPath -Raw
    if (-not $raw.TrimStart().StartsWith('[')) { throw 'community-plugins.json must be a JSON array.' }
    $parsed = $raw | ConvertFrom-Json
    $enabled = @($parsed)
    foreach ($item in $enabled) { if ($item -isnot [string]) { throw 'community-plugins.json contains a non-string entry.' } }
}
# Do not write through redirected plugin/config paths or linked destination files.
foreach ($path in @($config, $plugins, $target, $enabledPath, (Join-Path $config 'plugin-backups')) + @($files | ForEach-Object { Join-Path $target $_ })) {
    if ((Test-Path -LiteralPath $path) -and ((Get-Item -LiteralPath $path -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw "Linked destination is not supported: $path"
    }
}
Write-Output "Plugin: $pluginId $($manifest.version)"
Write-Output "Source: $package"
Write-Output "Target: $target"
Write-Output "Enable: $Enable"
if ($DryRun) { Write-Output 'Dry run: no files changed.'; return }
if (Get-Process -Name Obsidian -ErrorAction SilentlyContinue) {
    throw 'Fully quit Obsidian from the Pinned Notes tray/title menu before installing. Closing its main window may only hide it.'
}
$backup = Join-Path $config ('plugin-backups\' + $pluginId + '-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Path $backup -Force | Out-Null
if (Test-Path -LiteralPath $target) { Copy-Item -LiteralPath $target -Destination (Join-Path $backup 'plugin') -Recurse }
$hadEnabled = Test-Path -LiteralPath $enabledPath
if ($Enable -and $hadEnabled) { Copy-Item -LiteralPath $enabledPath -Destination (Join-Path $backup 'community-plugins.json') }
$existed = @{}
foreach ($file in $files) { $existed[$file] = Test-Path -LiteralPath (Join-Path $target $file) }
try {
    New-Item -ItemType Directory -Path $target -Force | Out-Null
    foreach ($file in $files) { Copy-Item -LiteralPath (Join-Path $package $file) -Destination (Join-Path $target $file) -Force }
    if ($Enable -and $enabled -notcontains $pluginId) {
        $json = ConvertTo-Json -InputObject @($enabled + $pluginId)
        [IO.File]::WriteAllText($enabledPath, $json, (New-Object Text.UTF8Encoding($false)))
    }
} catch {
    $failure = $_
    foreach ($file in $files) {
        $dest = Join-Path $target $file
        if ($existed[$file]) { Copy-Item -LiteralPath (Join-Path $backup "plugin\$file") -Destination $dest -Force }
        elseif (Test-Path -LiteralPath $dest) { Remove-Item -LiteralPath $dest }
    }
    if ($Enable) {
        if ($hadEnabled) { Copy-Item -LiteralPath (Join-Path $backup 'community-plugins.json') -Destination $enabledPath -Force }
        elseif (Test-Path -LiteralPath $enabledPath) { Remove-Item -LiteralPath $enabledPath }
    }
    throw $failure
}
Write-Output "Backup: $backup"
Write-Output 'Installed. Personal data.json and notes were preserved. Start Obsidian to verify; community plugins must be allowed in its settings.'
