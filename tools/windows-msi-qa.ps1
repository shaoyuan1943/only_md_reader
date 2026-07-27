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

function Get-MsiUpgradeRows {
    param([object]$Database)

    $view = $null
    $record = $null
    $rows = @()

    try {
        $view = $Database.OpenView("SELECT ``UpgradeCode``,``VersionMin``,``VersionMax``,``Attributes``,``ActionProperty`` FROM ``Upgrade``")
        [void]$view.Execute()

        while ($null -ne ($record = $view.Fetch())) {
            $rows += [pscustomobject][ordered]@{
                UpgradeCode = $record.StringData(1)
                VersionMin = $record.StringData(2)
                VersionMax = $record.StringData(3)
                Attributes = $record.IntegerData(4)
                ActionProperty = $record.StringData(5)
            }
            [void][Runtime.InteropServices.Marshal]::ReleaseComObject($record)
            $record = $null
        }

        return $rows
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

function Get-MsiLaunchConditions {
    param([object]$Database)

    $view = $null
    $record = $null
    $rows = @()

    try {
        $view = $Database.OpenView("SELECT ``Condition``,``Description`` FROM ``LaunchCondition``")
        [void]$view.Execute()

        while ($null -ne ($record = $view.Fetch())) {
            $rows += [pscustomobject][ordered]@{
                Condition = $record.StringData(1)
                Description = $record.StringData(2)
            }
            [void][Runtime.InteropServices.Marshal]::ReleaseComObject($record)
            $record = $null
        }

        return $rows
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

function Get-MsiDialogControls {
    param([object]$Database)

    $view = $null
    $record = $null
    $rows = @()

    try {
        $view = $Database.OpenView("SELECT ``Dialog_``,``Control``,``Type``,``Text`` FROM ``Control`` WHERE ``Dialog_`` = 'UpgradeReadyDlg'")
        [void]$view.Execute()

        while ($null -ne ($record = $view.Fetch())) {
            $rows += [pscustomobject][ordered]@{
                Dialog = $record.StringData(1)
                Control = $record.StringData(2)
                Type = $record.StringData(3)
                Text = $record.StringData(4)
            }
            [void][Runtime.InteropServices.Marshal]::ReleaseComObject($record)
            $record = $null
        }

        return $rows
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

function Get-MsiUpgradePromptEvents {
    param([object]$Database)

    $view = $null
    $record = $null
    $rows = @()

    try {
        $view = $Database.OpenView("SELECT ``Dialog_``,``Control_``,``Event``,``Argument``,``Condition``,``Ordering`` FROM ``ControlEvent`` WHERE ``Dialog_`` = 'InstallDirDlg' OR ``Dialog_`` = 'UpgradeReadyDlg'")
        [void]$view.Execute()

        while ($null -ne ($record = $view.Fetch())) {
            $rows += [pscustomobject][ordered]@{
                Dialog = $record.StringData(1)
                Control = $record.StringData(2)
                Event = $record.StringData(3)
                Argument = $record.StringData(4)
                Condition = $record.StringData(5)
                Ordering = $record.IntegerData(6)
            }
            [void][Runtime.InteropServices.Marshal]::ReleaseComObject($record)
            $record = $null
        }

        return $rows
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
    param(
        [string]$Path,
        [switch]$IncludeDowngradeContract
    )

    $installer = $null
    $database = $null

    try {
        $installer = New-Object -ComObject WindowsInstaller.Installer
        $database = $installer.OpenDatabase($Path, 0)

        $contract = [ordered]@{
            Path = $Path
            ProductCode = Get-MsiScalar $database "SELECT ``Value`` FROM ``Property`` WHERE ``Property`` = 'ProductCode'"
            ProductName = Get-MsiScalar $database "SELECT ``Value`` FROM ``Property`` WHERE ``Property`` = 'ProductName'"
            ProductVersion = Get-MsiScalar $database "SELECT ``Value`` FROM ``Property`` WHERE ``Property`` = 'ProductVersion'"
            UpgradeCode = Get-MsiScalar $database "SELECT ``Value`` FROM ``Property`` WHERE ``Property`` = 'UpgradeCode'"
            InstallDir = Get-MsiScalar $database "SELECT ``DefaultDir`` FROM ``Directory`` WHERE ``Directory`` = 'INSTALLDIR'"
            RemoveExistingProductsSequence = [int](Get-MsiScalar $database "SELECT ``Sequence`` FROM ``InstallExecuteSequence`` WHERE ``Action`` = 'RemoveExistingProducts'")
            InstallFilesSequence = [int](Get-MsiScalar $database "SELECT ``Sequence`` FROM ``InstallExecuteSequence`` WHERE ``Action`` = 'InstallFiles'")
        }
        if ($IncludeDowngradeContract) {
            $contract.UpgradeRows = @(Get-MsiUpgradeRows $database)
            $contract.LaunchConditions = @(Get-MsiLaunchConditions $database)
            $contract.UpgradePromptDialog = Get-MsiScalar $database "SELECT ``Dialog`` FROM ``Dialog`` WHERE ``Dialog`` = 'UpgradeReadyDlg'"
            $contract.UpgradePromptControls = @(Get-MsiDialogControls $database)
            $contract.UpgradePromptEvents = @(Get-MsiUpgradePromptEvents $database)
        }

        return [pscustomobject]$contract
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
$current = Read-MsiContract $MsiPath -IncludeDowngradeContract
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
$current.InstallDir = ($current.InstallDir -split "\|")[-1]
if ($current.InstallDir -cne "iMDReader") {
    throw "INSTALLDIR DefaultDir '$($current.InstallDir)' does not match 'iMDReader'."
}
if ($current.RemoveExistingProductsSequence -ge $current.InstallFilesSequence) {
    throw "RemoveExistingProducts sequence must precede InstallFiles."
}

$msidbUpgradeAttributesOnlyDetect = 2
$msidbUpgradeAttributesVersionMaxInclusive = 512
$olderVersionRows = @(
    $current.UpgradeRows |
        Where-Object { $_.ActionProperty -ceq "OLDER_VERSION_DETECTED" }
)
if ($olderVersionRows.Count -ne 1) {
    throw "Expected exactly one OLDER_VERSION_DETECTED row in the MSI Upgrade table."
}
$olderVersion = $olderVersionRows[0]
if ($olderVersion.UpgradeCode.ToUpperInvariant() -cne $expectedUpgradeCode) {
    throw "Older-version UpgradeCode '$($olderVersion.UpgradeCode)' does not match '$expectedUpgradeCode'."
}
if (-not [string]::IsNullOrWhiteSpace($olderVersion.VersionMin)) {
    throw "OLDER_VERSION_DETECTED VersionMin must be empty so every older version is detected."
}
if ($olderVersion.VersionMax -cne $current.ProductVersion) {
    throw "OLDER_VERSION_DETECTED VersionMax '$($olderVersion.VersionMax)' does not match ProductVersion '$($current.ProductVersion)'."
}
if (($olderVersion.Attributes -band $msidbUpgradeAttributesOnlyDetect) -eq 0) {
    throw "OLDER_VERSION_DETECTED must use the Upgrade table OnlyDetect attribute."
}
if (($olderVersion.Attributes -band $msidbUpgradeAttributesVersionMaxInclusive) -ne 0) {
    throw "OLDER_VERSION_DETECTED must not use VersionMaxInclusive; same-version reinstall is not an old-version upgrade."
}

$downgradeRows = @(
    $current.UpgradeRows |
        Where-Object { $_.ActionProperty -ceq "WIX_DOWNGRADE_DETECTED" }
)
if ($downgradeRows.Count -ne 1) {
    throw "Expected exactly one WIX_DOWNGRADE_DETECTED row in the MSI Upgrade table."
}
$downgrade = $downgradeRows[0]
if ($downgrade.UpgradeCode.ToUpperInvariant() -cne $expectedUpgradeCode) {
    throw "Downgrade UpgradeCode '$($downgrade.UpgradeCode)' does not match '$expectedUpgradeCode'."
}
if ($downgrade.VersionMin -cne $current.ProductVersion) {
    throw "Downgrade VersionMin '$($downgrade.VersionMin)' does not match ProductVersion '$($current.ProductVersion)'."
}
if (-not [string]::IsNullOrWhiteSpace($downgrade.VersionMax)) {
    throw "Downgrade VersionMax must be empty so every higher version is detected."
}
if ($downgrade.Attributes -cne $msidbUpgradeAttributesOnlyDetect) {
    throw "WIX_DOWNGRADE_DETECTED must use only the Upgrade table OnlyDetect attribute."
}
$downgradeBlockConditions = @(
    $current.LaunchConditions |
        Where-Object { $_.Condition -ceq "NOT WIX_DOWNGRADE_DETECTED" }
)
if ($downgradeBlockConditions.Count -ne 1) {
    throw "Expected the MSI LaunchCondition table to block WIX_DOWNGRADE_DETECTED."
}
$downgradeBlockCondition = $downgradeBlockConditions[0]
if ([string]::IsNullOrWhiteSpace($downgradeBlockCondition.Description)) {
    throw "The MSI downgrade block must provide a user-facing error message."
}

if ($current.UpgradePromptDialog -cne "UpgradeReadyDlg") {
    throw "The MSI Dialog table must contain UpgradeReadyDlg."
}
$upgradePromptTitle = @(
    $current.UpgradePromptControls |
        Where-Object { $_.Control -ceq "Title" -and $_.Type -ceq "Text" }
)
if ($upgradePromptTitle.Count -ne 1 -or $upgradePromptTitle[0].Text -notmatch "\u68C0\u6D4B\u5230\u5DF2\u5B89\u88C5\u7684\u65E7\u7248\u672C") {
    throw "UpgradeReadyDlg must explain that an installed old version was detected."
}
$upgradePromptDescription = @(
    $current.UpgradePromptControls |
        Where-Object { $_.Control -ceq "Description" -and $_.Type -ceq "Text" }
)
if (
    $upgradePromptDescription.Count -ne 1 -or
    $upgradePromptDescription[0].Text -notmatch "\u5148\u5378\u8F7D\u65E7\u7248\u672C" -or
    $upgradePromptDescription[0].Text -notmatch "\[ProductName\]" -or
    $upgradePromptDescription[0].Text -notmatch "\[ProductVersion\]" -or
    $upgradePromptDescription[0].Text -notmatch "\u5E94\u7528\u8BBE\u7F6E\u3001\u6700\u8FD1\u6587\u4EF6\u548C\u9605\u8BFB\u4F4D\u7F6E\u4E0D\u4F1A\u88AB\u5220\u9664"
) {
    throw "UpgradeReadyDlg must describe the uninstall-then-install behavior and preserved user data."
}
$upgradePromptButton = @(
    $current.UpgradePromptControls |
        Where-Object { $_.Control -ceq "Upgrade" -and $_.Type -ceq "PushButton" }
)
if ($upgradePromptButton.Count -ne 1 -or $upgradePromptButton[0].Text -notmatch "^\u5347\u7EA7$") {
    throw "UpgradeReadyDlg must provide an Upgrade button."
}
foreach ($controlName in @("Back", "Cancel")) {
    if (@($current.UpgradePromptControls | Where-Object { $_.Control -ceq $controlName }).Count -ne 1) {
        throw "UpgradeReadyDlg must provide a $controlName button."
    }
}

$upgradePromptRoutes = @(
    $current.UpgradePromptEvents |
        Where-Object {
            $_.Dialog -ceq "InstallDirDlg" -and
            $_.Control -ceq "Next" -and
            $_.Event -ceq "NewDialog" -and
            $_.Argument -ceq "UpgradeReadyDlg"
        }
)
if ($upgradePromptRoutes.Count -ne 1) {
    throw "InstallDirDlg must have exactly one route to UpgradeReadyDlg."
}
$upgradePromptRoute = $upgradePromptRoutes[0]
if (
    $upgradePromptRoute.Condition -notmatch "OLDER_VERSION_DETECTED" -or
    $upgradePromptRoute.Condition -notmatch "WIXUI_DONTVALIDATEPATH" -or
    $upgradePromptRoute.Condition -notmatch "WIXUI_INSTALLDIR_VALID"
) {
    throw "The UpgradeReadyDlg route must require an older version and a valid install path."
}
$standardReadyRoutes = @(
    $current.UpgradePromptEvents |
        Where-Object {
            $_.Dialog -ceq "InstallDirDlg" -and
            $_.Control -ceq "Next" -and
            $_.Event -ceq "NewDialog" -and
            $_.Argument -ceq "VerifyReadyDlg"
        }
)
if ($standardReadyRoutes.Count -ne 1) {
    throw "InstallDirDlg must retain exactly one standard VerifyReadyDlg route."
}
$standardReadyRoute = $standardReadyRoutes[0]
if ($upgradePromptRoute.Ordering -le $standardReadyRoute.Ordering) {
    throw "The conditional UpgradeReadyDlg route must take precedence over VerifyReadyDlg."
}

$upgradePromptReturnEvents = @(
    $current.UpgradePromptEvents |
        Where-Object {
            $_.Dialog -ceq "UpgradeReadyDlg" -and
            $_.Control -ceq "Upgrade" -and
            $_.Event -ceq "EndDialog" -and
            $_.Argument -ceq "Return"
        }
)
if ($upgradePromptReturnEvents.Count -lt 1) {
    throw "UpgradeReadyDlg Upgrade must continue the MSI transaction."
}
if (@(
    $current.UpgradePromptEvents |
        Where-Object {
            $_.Dialog -ceq "UpgradeReadyDlg" -and
            $_.Control -ceq "Back" -and
            $_.Event -ceq "NewDialog" -and
            $_.Argument -ceq "InstallDirDlg"
        }
).Count -ne 1) {
    throw "UpgradeReadyDlg Back must return to InstallDirDlg."
}
if (@(
    $current.UpgradePromptEvents |
        Where-Object {
            $_.Dialog -ceq "UpgradeReadyDlg" -and
            $_.Control -ceq "Cancel" -and
            $_.Event -ceq "SpawnDialog" -and
            $_.Argument -ceq "CancelDlg"
        }
).Count -ne 1) {
    throw "UpgradeReadyDlg Cancel must open CancelDlg."
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
    OlderVersionDetected = $olderVersion
    UpgradePrompt = [ordered]@{
        Dialog = $current.UpgradePromptDialog
        Title = $upgradePromptTitle[0]
        Description = $upgradePromptDescription[0]
        Button = $upgradePromptButton[0]
        Route = $upgradePromptRoute
        StandardRoute = $standardReadyRoute
    }
    DowngradeDetected = $downgrade
    DowngradeBlockCondition = $downgradeBlockCondition
    nsisArtifactsForCurrentVersion = $nsisArtifactsForCurrentVersion
} | ConvertTo-Json -Depth 5
