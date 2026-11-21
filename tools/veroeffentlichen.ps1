# Lädt die Offline-Datei Aschenblatt.html als GitHub-Release „Aktueller Stand“ hoch (Download-Link auch fürs Handy).
# Vorher bauen: node tools/einzeldatei.mjs
# Aufruf (Windows, im Repo):  powershell -ExecutionPolicy Bypass -File tools\veroeffentlichen.ps1
# Anmeldung: nimmt die GitHub-Anmeldung, mit der auch git push läuft (Git Credential Manager).
# Der alte Release „stand“ wird jedes Mal gelöscht und neu angelegt, damit er auf den neuesten Commit zeigt.
$ErrorActionPreference = 'Stop'
$OutputEncoding = New-Object Text.UTF8Encoding $false   # sonst schickt PowerShell ein BOM an git, und git versteht die erste Zeile nicht
$repo = 'CozyIland/Souls-'
$tag = 'stand'
$root = Split-Path -Parent $PSScriptRoot
$datei = Join-Path $root 'Aschenblatt.html'
if (-not (Test-Path $datei)) { throw 'Aschenblatt.html fehlt – erst node tools/einzeldatei.mjs ausführen.' }

$frage = [IO.Path]::GetTempFileName()
[IO.File]::WriteAllText($frage, "protocol=https`nhost=github.com`n`n", (New-Object Text.UTF8Encoding $false))
$cred = cmd /c "git credential fill < `"$frage`""
Remove-Item $frage
$token = ($cred | Where-Object { $_ -like 'password=*' }) -replace '^password=', ''
if (-not $token) { throw 'Keine GitHub-Anmeldung gefunden – einmal git push ausführen und anmelden.' }
$h = @{ Authorization = "Bearer $token"; Accept = 'application/vnd.github+json'; 'X-GitHub-Api-Version' = '2022-11-28'; 'User-Agent' = 'aschenblatt-release' }
$api = "https://api.github.com/repos/$repo"

# alten Stand entfernen (Release und Tag)
try { $alt = Invoke-RestMethod -Headers $h -Uri "$api/releases/tags/$tag"; Invoke-RestMethod -Method Delete -Headers $h -Uri "$api/releases/$($alt.id)" | Out-Null } catch { }
try { Invoke-RestMethod -Method Delete -Headers $h -Uri "$api/git/refs/tags/$tag" | Out-Null } catch { }

$branch = (git -C $root rev-parse --abbrev-ref HEAD).Trim()
$commit = (git -C $root rev-parse HEAD).Trim()
$titel = (git -C $root log -1 --format=%s).Trim()
$body = @{
  tag_name = $tag; target_commitish = $commit; name = 'Aktueller Stand'; prerelease = $true
  body = "Spielbare Offline-Datei – herunterladen und im Browser öffnen.`n`nBranch: $branch`nLetzte Änderung: $titel"
} | ConvertTo-Json
$rel = Invoke-RestMethod -Method Post -Headers $h -Uri "$api/releases" -Body ([Text.Encoding]::UTF8.GetBytes($body)) -ContentType 'application/json; charset=utf-8'

$up = $rel.upload_url -replace '\{.*\}$', ''
$asset = Invoke-RestMethod -Method Post -Headers $h -Uri "$($up)?name=Aschenblatt.html" -InFile $datei -ContentType 'text/html'
Write-Output "Release:  $($rel.html_url)"
Write-Output "Download: $($asset.browser_download_url)"
