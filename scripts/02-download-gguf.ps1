# One-time Eclipse 12B Q4_K_M download. Hugging Face is a file host only.

param(
    [ValidateSet("eclipse")]
    [string]$Profile = "eclipse"
)

. (Join-Path $PSScriptRoot "..\config.ps1")

# Probe/chat scripts in the same PowerShell window used to set these and
# block huggingface_hub. Download is the one step that needs the network.
Remove-Item Env:HF_HUB_OFFLINE -ErrorAction SilentlyContinue
Remove-Item Env:TRANSFORMERS_OFFLINE -ErrorAction SilentlyContinue
Remove-Item Env:HF_HUB_LOCAL_FILES_ONLY -ErrorAction SilentlyContinue

$spec = $ModelProfiles[$Profile]
$dest = Join-Path $ModelDir $spec.Subdir
New-Dir $dest

Write-Host "Profile: $Profile"
Write-Host $spec.Notes
Write-Host "Repo: $($spec.Repo)"
Write-Host "File: $($spec.Filename) (~7.0 GiB)"
Write-Host "Dest: $dest"

$py = @"
from huggingface_hub import hf_hub_download
print(hf_hub_download(
    repo_id='$($spec.Repo)',
    filename='$($spec.Filename)',
    local_dir=r'$dest',
))
"@
$py | python -

if ($LASTEXITCODE -ne 0) { throw "download failed" }

$gguf = Get-ModelPath $Profile
if (-not (Test-Path $gguf)) { throw "Expected GGUF missing: $gguf" }
Write-Host "Ready: $gguf"
Write-Host "Next: scripts\03-chat.ps1"
