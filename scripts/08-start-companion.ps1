# Start DP&U: hidden Tauri UI, optional llama.cpp, optional Discord.
# Double-click DPU.exe / DPU.bat for a chooser. Or:
#   .\scripts\08-start-companion.ps1 -Mode ui|llama|full
# Errors print a DPU_TOAST block so the exe can show a small window.

param(
    [ValidateSet("ui", "llama", "full")]
    [string]$Mode,
    [switch]$Silent
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
. (Join-Path $root "config.ps1")

$llamaPort = $DefaultPort
$FetchUtsuwa = ".\scripts\00-fetch-utsuwa.ps1"
$BuildLlama = ".\scripts\01-build-llama.ps1"
$DownloadGguf = ".\scripts\02-download-gguf.ps1"

function Write-DpuToast([string]$Title, [string]$Command) {
    [Console]::Error.WriteLine("DPU_TOAST")
    [Console]::Error.WriteLine($Title)
    [Console]::Error.WriteLine($Command)
}

function Show-DpuToast([string]$Title, [string]$Command) {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    $form = New-Object System.Windows.Forms.Form
    $form.Text = "DP&U"
    $form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::FixedDialog
    $form.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
    $form.ClientSize = New-Object System.Drawing.Size(420, 160)
    $form.MaximizeBox = $false
    $form.MinimizeBox = $false
    $form.TopMost = $true
    $box = New-Object System.Windows.Forms.TextBox
    $box.Multiline = $true
    $box.ReadOnly = $true
    $box.BorderStyle = [System.Windows.Forms.BorderStyle]::None
    $box.Location = New-Object System.Drawing.Point(16, 16)
    $box.Size = New-Object System.Drawing.Size(388, 90)
    $box.Text = "$Title`r`n`r`nRun this command at the repo root to fetch:`r`n$Command"
    $box.BackColor = [System.Drawing.SystemColors]::Window
    $box.Add_KeyDown({
        param($sender, $e)
        if ($e.Control -and $e.KeyCode -eq [System.Windows.Forms.Keys]::A) {
            $sender.SelectAll()
            $e.SuppressKeyPress = $true
        }
    })
    $ok = New-Object System.Windows.Forms.Button
    $ok.Text = "OK"
    $ok.Location = New-Object System.Drawing.Point(300, 114)
    $ok.Size = New-Object System.Drawing.Size(100, 28)
    $ok.Add_Click({ $form.Close() })
    $form.AcceptButton = $ok
    $form.Controls.AddRange(@($box, $ok))
    $form.Add_Shown({
        $box.SelectAll()
        $box.Focus()
    })
    [void]$form.ShowDialog()
}

function Fail-Need([string]$Title, [string]$Command) {
    Write-DpuToast $Title $Command
    if (-not $Silent) { Show-DpuToast $Title $Command }
    exit 2
}

function Test-LocalPort([int]$Port) {
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $client.Connect("127.0.0.1", $Port)
        $client.Close()
        return $true
    } catch {
        return $false
    }
}

function Wait-LocalPort([int]$Port, [int]$TimeoutSec, [string]$Label) {
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        if (Test-LocalPort $Port) { return }
        Start-Sleep -Seconds 1
    }
    throw "$Label did not open port $Port within ${TimeoutSec}s"
}

function Show-DpuChooser {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing

    $form = New-Object System.Windows.Forms.Form
    $form.Text = "DP&U"
    $form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::FixedDialog
    $form.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
    $form.ClientSize = New-Object System.Drawing.Size(380, 248)
    $form.MaximizeBox = $false
    $form.MinimizeBox = $false

    $hint = New-Object System.Windows.Forms.Label
    $hint.Location = New-Object System.Drawing.Point(16, 18)
    $hint.Size = New-Object System.Drawing.Size(348, 36)
    $hint.Text = "Desktop partner working with you"

    $uiOnly = New-Object System.Windows.Forms.RadioButton
    $uiOnly.AutoSize = $true
    $uiOnly.Location = New-Object System.Drawing.Point(20, 76)
    $uiOnly.Text = "UI only (no llama)"

    $uiLlama = New-Object System.Windows.Forms.RadioButton
    $uiLlama.AutoSize = $true
    $uiLlama.Checked = $true
    $uiLlama.Location = New-Object System.Drawing.Point(20, 104)
    $uiLlama.Text = "UI and llama"

    $full = New-Object System.Windows.Forms.RadioButton
    $full.AutoSize = $true
    $full.Location = New-Object System.Drawing.Point(20, 132)
    $full.Text = "Full (UI, llama, and Discord)"

    $start = New-Object System.Windows.Forms.Button
    $start.Text = "Start"
    $start.Location = New-Object System.Drawing.Point(20, 192)
    $start.Size = New-Object System.Drawing.Size(340, 36)
    $chosen = @{ Mode = $null }
    $start.Tag = @{ UiOnly = $uiOnly; Full = $full; Form = $form; Chosen = $chosen }
    $start.Add_Click({
        $t = $this.Tag
        if ($t.UiOnly.Checked) { $t.Chosen.Mode = "ui" }
        elseif ($t.Full.Checked) { $t.Chosen.Mode = "full" }
        else { $t.Chosen.Mode = "llama" }
        $t.Form.DialogResult = [System.Windows.Forms.DialogResult]::OK
        $t.Form.Close()
    })
    $form.AcceptButton = $start

    $form.Controls.AddRange(@($hint, $uiOnly, $uiLlama, $full, $start))
    [void]$form.ShowDialog()
    return $chosen.Mode
}

function Start-HiddenScript {
    param(
        [Parameter(Mandatory)][string]$ScriptName,
        [string[]]$ScriptArgs = @()
    )
    $file = Join-Path $PSScriptRoot $ScriptName
    $argList = @(
        "-ExecutionPolicy", "Bypass",
        "-NoProfile",
        "-WindowStyle", "Hidden",
        "-File", $file
    ) + $ScriptArgs
    Start-Process -FilePath "powershell.exe" -WorkingDirectory $root -WindowStyle Hidden -ArgumentList $argList | Out-Null
}

if (-not $Mode) {
    $Mode = Show-DpuChooser
    if (-not $Mode) { exit 0 }
}

$wantLlama = $Mode -ne "ui"
$wantDiscord = $Mode -eq "full"
$utsuwaPkg = Join-Path $root "vendor\utsuwa\package.json"

try {
    if (-not (Test-Path $utsuwaPkg)) {
        Fail-Need "Utsuwa not fetched." $FetchUtsuwa
    }

    if ($wantLlama) {
        try {
            $null = Get-LlamaExe "llama-server.exe"
        } catch {
            Fail-Need "llama.cpp is not built." $BuildLlama
        }
        $gguf = Get-ModelPath
        if (-not (Test-Path $gguf)) {
            Fail-Need "Eclipse GGUF is not downloaded." $DownloadGguf
        }
        if (-not (Test-LocalPort $llamaPort)) {
            Start-HiddenScript -ScriptName "04-serve.ps1" -ScriptArgs @("-NoSystemPrompt")
        }
    }

    Start-HiddenScript -ScriptName "13-utsuwa-desktop.ps1"

    if ($wantLlama) {
        try {
            Wait-LocalPort -Port $llamaPort -TimeoutSec 180 -Label "llama.cpp"
        } catch {
            Fail-Need "llama.cpp did not start." $BuildLlama
        }
    }

    if ($wantDiscord) {
        $envFile = Join-Path $root ".env"
        if (-not (Test-Path $envFile)) {
            Fail-Need "Discord .env is missing." "copy .env.example .env"
        }
        Start-HiddenScript -ScriptName "10-discord.ps1"
    }
} catch {
    $text = [string]$_
    if ($text -notmatch "DPU_TOAST") {
        Write-DpuToast $text.Trim() $FetchUtsuwa
        if (-not $Silent) { Show-DpuToast $text.Trim() $FetchUtsuwa }
    }
    exit 1
}

exit 0
