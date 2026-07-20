Continue = 'Stop'
 = 'C:\Users\Zebra\Documents\Codex\2026-07-19\ztoolscenter-ztools-https-github-com-ztoolscenter\work\md-workspace'
 = 'D:\Code\ZTools_Plugin\md-workspace'
 = 'C:\Users\Zebra\Documents\Codex\2026-07-19\ztoolscenter-ztools-https-github-com-ztoolscenter\outputs\md-workspace-v0.3.0.zip'
Write-Host ('Sync md-workspace v0.3.0 -> ' + )
 = Join-Path  'release\md-workspace-v0.3.0.zip'
if (-not (Test-Path )) { throw ('Missing built zip: ' + ) }
if (-not (Test-Path )) { New-Item -ItemType Directory -Path  -Force | Out-Null }
Get-ChildItem  -Recurse -File | Where-Object { .FullName -notmatch '\\node_modules\\|\\dist\\|\\release\\|\\.vite-cache\\|\\.vite-temp\\' } | ForEach-Object {
   = .FullName.Substring(.Length + 1)
   = Join-Path  
   = Split-Path  -Parent
  if (-not (Test-Path )) { New-Item -ItemType Directory -Path  -Force | Out-Null }
  Copy-Item -LiteralPath .FullName -Destination  -Force
}
 = Join-Path  'release'
if (-not (Test-Path )) { New-Item -ItemType Directory -Path  -Force | Out-Null }
Copy-Item -LiteralPath  -Destination (Join-Path  'md-workspace-v0.3.0.zip') -Force
Copy-Item -LiteralPath  -Destination  -Force
if (Test-Path (Join-Path  'node_modules')) {
  Set-Location 
  npm.cmd run test:core
  if ( -ne 0) { throw 'tests failed' }
} else {
  Write-Host 'Skip test:core on D (no node_modules)'
}
Write-Host 'DONE'
Write-Host ('Install zip: ' + )
