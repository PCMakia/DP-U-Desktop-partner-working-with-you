# Shared paths for the ALICE companion stack (Eclipse 12B + character card).
# Dot-source from the numbered scripts. Do not run this file by itself.

$ErrorActionPreference = "Stop"

$Root = $PSScriptRoot
$VendorDir = Join-Path $Root "vendor"
$LlamaDir = Join-Path $VendorDir "llama.cpp"
$BuildDir = Join-Path $LlamaDir "build"
$BinDir = Join-Path $BuildDir "bin\Release"
$ModelDir = Join-Path $Root "models"
$CharacterDir = Join-Path $Root "characters"
$CudaRoot = if ($env:CUDA_PATH) { $env:CUDA_PATH } else { "C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.8" }
$Nvcc = Join-Path $CudaRoot "bin\nvcc.exe"
$Vswhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
$DefaultPort = 8081
$DefaultCtx = 8192
$DefaultCharacter = "character"

$ModelProfiles = @{
    eclipse = @{
        Repo     = "mradermacher/KansenSakura-Eclipse-RP-12b-GGUF"
        Filename = "KansenSakura-Eclipse-RP-12b.Q4_K_M.gguf"
        Subdir   = "eclipse-12b"
        Notes    = "Mistral 12B RP, ChatML. Q4_K_M ~7.0 GiB. Close GPU-heavy apps; keep context at 8k."
    }
}

$DefaultProfile = "eclipse"

function Get-LlamaExe {
    param([Parameter(Mandatory)][string]$Name)
    $candidates = @(
        (Join-Path $BinDir $Name)
        (Join-Path $BuildDir "bin\$Name")
        (Join-Path $BuildDir "Release\$Name")
    )
    foreach ($path in $candidates) {
        if (Test-Path $path) { return $path }
    }
    throw "Missing $Name under $BuildDir. Run scripts\01-build-llama.ps1 first."
}

function Get-ModelPath {
    param([string]$Profile = $DefaultProfile)
    if (-not $ModelProfiles.ContainsKey($Profile)) {
        throw "Unknown profile '$Profile'. Use: $($ModelProfiles.Keys -join ', ')"
    }
    $spec = $ModelProfiles[$Profile]
    return Join-Path $ModelDir (Join-Path $spec.Subdir $spec.Filename)
}

function Get-CharacterJsonPath {
    param([string]$Name = $DefaultCharacter)
    $path = Join-Path $CharacterDir "$Name.json"
    if (-not (Test-Path $path)) {
        throw "Character card missing: $path"
    }
    return $path
}

function Enter-VsDev {
    if (-not (Test-Path $Vswhere)) {
        throw "Visual Studio 2022 vswhere.exe not found. Install VS 2022 Desktop development with C++."
    }
    $vs = & $Vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
    if (-not $vs) {
        throw "VS 2022 with C++ tools not found."
    }
    $dll = Join-Path $vs "Common7\Tools\Microsoft.VisualStudio.DevShell.dll"
    if (Test-Path $dll) {
        Import-Module $dll
        Enter-VsDevShell -VsInstallPath $vs -SkipAutomaticLocation -DevCmdArguments "-arch=x64 -host_arch=x64" | Out-Null
        return
    }
    $vcvars = Join-Path $vs "VC\Auxiliary\Build\vcvars64.bat"
    cmd.exe /c "`"$vcvars`" && set" | ForEach-Object {
        if ($_ -match "^(.*?)=(.*)$") {
            [System.Environment]::SetEnvironmentVariable($matches[1], $matches[2], "Process")
        }
    }
}

function Set-LlamaRuntimeEnv {
    $env:CUDA_PATH = $CudaRoot
    $env:CUDA_PATH_V12_8 = $CudaRoot
    $env:CUDA_VISIBLE_DEVICES = "0"
    $env:CUDA_MODULE_LOADING = "LAZY"
    $env:HF_HUB_OFFLINE = "1"
    $env:TRANSFORMERS_OFFLINE = "1"
    $cudaBin = Join-Path $CudaRoot "bin"
    if (-not (($env:PATH -split ";") -contains $cudaBin)) {
        $env:PATH = "$cudaBin;$env:PATH"
    }
}

function Set-HighPerformanceGpu {
    param([Parameter(Mandatory)][string]$ExePath)
    $key = "HKCU:\Software\Microsoft\DirectX\UserGpuPreferences"
    if (-not (Test-Path $key)) {
        New-Item -Path $key -Force | Out-Null
    }
    Set-ItemProperty -Path $key -Name $ExePath -Value "GpuPreference=2;"
}

function Assert-CudaToolkit {
    if (-not (Test-Path $Nvcc)) {
        throw "nvcc not found at $Nvcc"
    }
}

function New-Dir {
    param([Parameter(Mandatory)][string]$Path)
    if (-not (Test-Path $Path)) {
        New-Item -ItemType Directory -Path $Path | Out-Null
    }
}

function Get-RpSamplerArgs {
    # Eclipse is Mistral RP + ChatML, not a Qwen thinking model.
    return @(
        "--jinja"
        "--temp", "0.9"
        "--top-p", "0.95"
        "--top-k", "80"
        "--min-p", "0.05"
        "--repeat-penalty", "1.08"
        "-fa", "on"
        "-ngl", "99"
        "--cache-type-k", "q8_0"
        "--cache-type-v", "q8_0"
        "--no-context-shift"
    )
}
