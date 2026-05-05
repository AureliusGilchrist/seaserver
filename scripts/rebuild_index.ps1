$indexPath = 'e:\Main\server\seanime-themes\seanime-themes\index.json'
$themesDir = 'e:\Main\server\seanime-themes\seanime-themes\themes'

$json = Get-Content $indexPath -Raw | ConvertFrom-Json

# Build a lookup of existing entries
$existingMap = @{}
foreach ($t in $json.themes) {
    $existingMap[$t.id] = $t
}

# Get all folder names
$folders = (Get-ChildItem $themesDir -Directory).Name | Sort-Object

$newThemes = @()
foreach ($folder in $folders) {
    if ($existingMap.ContainsKey($folder)) {
        $newThemes += $existingMap[$folder]
    } else {
        # Try to read theme.json for metadata
        $themeJsonPath = Join-Path $themesDir "$folder\theme.json"
        $displayName = $folder -replace '-', ' ' -replace '(\b\w)', { $_.Value.ToUpper() }
        $description = ""
        $previewColors = @{ bg = "#0a0a0a"; primary = "#888888"; secondary = "#666666"; accent = "#aaaaaa" }
        $backgroundImageUrl = ""
        $fontFamily = $null
        $fontHref = $null

        if (Test-Path $themeJsonPath) {
            try {
                $themeData = Get-Content $themeJsonPath -Raw | ConvertFrom-Json
                if ($themeData.displayName) { $displayName = $themeData.displayName }
                if ($themeData.description) { $description = $themeData.description }
                if ($themeData.previewColors) { $previewColors = $themeData.previewColors }
                if ($themeData.backgroundImageUrl) { $backgroundImageUrl = $themeData.backgroundImageUrl }
                if ($themeData.fontFamily) { $fontFamily = $themeData.fontFamily }
                if ($themeData.fontHref) { $fontHref = $themeData.fontHref }
            } catch {}
        }

        $entry = [PSCustomObject]@{
            id = $folder
            name = $displayName
            description = $description
            author = "seanime"
            tags = @()
            previewColors = $previewColors
            themeRef = "themes/$folder/theme.json"
            backgroundImageUrl = $backgroundImageUrl
            createdAt = "2025-01-01"
        }
        $newThemes += $entry
    }
}

$output = [PSCustomObject]@{
    version = "1"
    generatedAt = (Get-Date -Format "yyyy-MM-ddTHH:mm:ss.fffZ")
    themes = $newThemes
}

$output | ConvertTo-Json -Depth 10 | Set-Content $indexPath -Encoding UTF8
Write-Host "Done. Total themes: $($newThemes.Count)"
