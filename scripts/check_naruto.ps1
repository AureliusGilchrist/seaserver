$json = Get-Content 'e:\Main\server\seanime-themes\seanime-themes\index.json' -Raw | ConvertFrom-Json
Write-Host "Total: $($json.themes.Count)"
$naruto = $json.themes | Where-Object { $_.id -eq 'naruto' }
$naruto | ConvertTo-Json -Depth 3
