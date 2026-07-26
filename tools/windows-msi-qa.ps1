param(
    [string]$MsiPath = "",
    [string]$PreviousMsiPath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$tauriConfigPath = Join-Path $repoRoot "src-tauri\tauri.conf.json"
$bundleRoot = Join-Path $repoRoot "src-tauri\target\release\bundle"
$msiDirectory = Join-Path $bundleRoot "msi"
$tauriConfig = Get-Content -Raw -Encoding UTF8 $tauriConfigPath | ConvertFrom-Json

function Get-MsiScalar {
    param(
        [object]$Database,
        [string]$Query
    )

    $view = $null
    $record = $null

    try {
        $view = $Database.OpenView($Query)
        [void]$view.Execute()
        $record = $view.Fetch()
        if ($null -eq $record) {
            throw "MSI query returned no rows: $Query"
        }

        return $record.StringData(1)
    }
    finally {
        if ($null -ne $record) {
            [void][Runtime.InteropServices.Marshal]::ReleaseComObject($record)
        }
        if ($null -ne $view) {
            try {
                [void]$view.Close()
            }
            finally {
                [void][Runtime.InteropServices.Marshal]::ReleaseComObject($view)
            }
        }
    }
}

function Read-MsiContract {
    param([string]$Path)

    $installer = $null
    $database = $null

    try {
        $installer = New-Object -ComObject WindowsInstaller.Installer
        $database = $installer.OpenDatabase($Path, 0)

        return [pscustomobject][ordered]@{
            Path = $Path
            ProductCode = Get-MsiScalar $database "SELECT ``Value`` FROM ``Property`` WHERE ``Property`` = 'ProductCode'"
            ProductName = Get-MsiScalar $database "SELECT ``Value`` FROM ``Property`` WHERE ``Property`` = 'ProductName'"
            ProductVersion = Get-MsiScalar $database "SELECT ``Value`` FROM ``Property`` WHERE ``Property`` = 'ProductVersion'"
            UpgradeCode = Get-MsiScalar $database "SELECT ``Value`` FROM ``Property`` WHERE ``Property`` = 'UpgradeCode'"
            InstallDir = Get-MsiScalar $database "SELECT ``DefaultDir`` FROM ``Directory`` WHERE ``Directory`` = 'INSTALLDIR'"
            RemoveExistingProductsSequence = [int](Get-MsiScalar $database "SELECT ``Sequence`` FROM ``InstallExecuteSequence`` WHERE ``Action`` = 'RemoveExistingProducts'")
            InstallFilesSequence = [int](Get-MsiScalar $database "SELECT ``Sequence`` FROM ``InstallExecuteSequence`` WHERE ``Action`` = 'InstallFiles'")
        }
    }
    finally {
        if ($null -ne $database) {
            [void][Runtime.InteropServices.Marshal]::ReleaseComObject($database)
        }
        if ($null -ne $installer) {
            [void][Runtime.InteropServices.Marshal]::ReleaseComObject($installer)
        }
    }
}

if ([string]::IsNullOrWhiteSpace($MsiPath)) {
    if (-not (Test-Path -LiteralPath $msiDirectory -PathType Container)) {
        throw "MSI bundle directory not found: $msiDirectory"
    }

    $MsiPath = Get-ChildItem -LiteralPath $msiDirectory -File -Filter "*_$($tauriConfig.version)_*.msi" |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1 -ExpandProperty FullName
}
if ([string]::IsNullOrWhiteSpace($MsiPath) -or -not (Test-Path -LiteralPath $MsiPath)) {
    throw "MSI not found for version $($tauriConfig.version)."
}

$MsiPath = (Resolve-Path -LiteralPath $MsiPath).Path
$current = Read-MsiContract $MsiPath
$expectedUpgradeCode = "{D282D977-779F-5080-A3EA-623A41BA26A2}"

if ($current.ProductName -cne $tauriConfig.productName) {
    throw "ProductName '$($current.ProductName)' does not match '$($tauriConfig.productName)'."
}
if ($current.ProductVersion -cne $tauriConfig.version) {
    throw "ProductVersion '$($current.ProductVersion)' does not match '$($tauriConfig.version)'."
}
if ($current.UpgradeCode.ToUpperInvariant() -cne $expectedUpgradeCode) {
    throw "UpgradeCode '$($current.UpgradeCode)' does not match '$expectedUpgradeCode'."
}
if ($current.InstallDir -cne "iMDReader") {
    throw "INSTALLDIR DefaultDir '$($current.InstallDir)' does not match 'iMDReader'."
}
if ($current.RemoveExistingProductsSequence -ge $current.InstallFilesSequence) {
    throw "RemoveExistingProducts sequence must precede InstallFiles."
}

$nsisDirectory = Join-Path $bundleRoot "nsis"
$nsisArtifactsForCurrentVersion = @()
if (Test-Path -LiteralPath $nsisDirectory) {
    $nsisArtifactsForCurrentVersion = @(
        Get-ChildItem -LiteralPath $nsisDirectory -File -Recurse |
            Where-Object { $_.Name -like "*$($tauriConfig.version)*" } |
            Select-Object -ExpandProperty FullName
    )
}
if ($nsisArtifactsForCurrentVersion.Count -gt 0) {
    throw "NSIS artifacts exist for version $($tauriConfig.version)."
}

$previous = $null
if (-not [string]::IsNullOrWhiteSpace($PreviousMsiPath)) {
    if (-not (Test-Path -LiteralPath $PreviousMsiPath)) {
        throw "Previous MSI not found: $PreviousMsiPath"
    }

    $previous = Read-MsiContract (Resolve-Path -LiteralPath $PreviousMsiPath).Path
    if ($previous.UpgradeCode.ToUpperInvariant() -cne $expectedUpgradeCode) {
        throw "Previous UpgradeCode '$($previous.UpgradeCode)' does not match '$expectedUpgradeCode'."
    }
    if ($previous.ProductCode -ieq $current.ProductCode) {
        throw "Previous and current MSI ProductCode values must differ."
    }
    if ([version]$previous.ProductVersion -ge [version]$current.ProductVersion) {
        throw "Previous ProductVersion '$($previous.ProductVersion)' must be lower than '$($current.ProductVersion)'."
    }
}

[pscustomobject][ordered]@{
    status = "passed"
    current = $current
    previous = $previous
    nsisArtifactsForCurrentVersion = $nsisArtifactsForCurrentVersion
} | ConvertTo-Json -Depth 5
