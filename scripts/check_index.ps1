$json = Get-Content 'e:\Main\server\seanime-themes\seanime-themes\index.json' -Raw | ConvertFrom-Json
Write-Host "Current indexed: $($json.themes.Count)"
$folders = (Get-ChildItem 'e:\Main\server\seanime-themes\seanime-themes\themes' -Directory).Name
$indexed = @($json.themes | ForEach-Object { $_.id })
$missing = $folders | Where-Object { $indexed -notcontains $_ }
Write-Host "Missing count: $($missing.Count)"
$missing
