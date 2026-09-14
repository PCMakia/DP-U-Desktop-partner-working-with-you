# Confirm llama.cpp CUDA sees the NVIDIA GPU you intend to use.

. (Join-Path $PSScriptRoot "..\config.ps1")
Set-LlamaRuntimeEnv

$cli = Get-LlamaExe "llama-cli.exe"
Set-HighPerformanceGpu $cli

Write-Host "CUDA_VISIBLE_DEVICES=$env:CUDA_VISIBLE_DEVICES"
Write-Host "llama.cpp tree: $LlamaDir"
Write-Host "--- nvidia-smi ---"
nvidia-smi --query-gpu=name,compute_cap,memory.total,memory.free --format=csv
Write-Host "--- llama.cpp devices ---"
& $cli --list-devices
if ($LASTEXITCODE -ne 0) { throw "llama-cli --list-devices failed" }
Write-Host "Expect: your NVIDIA CUDA GPU in the llama.cpp device list"
Write-Host "Eclipse Q4 is ~7 GiB. If free VRAM is under ~8 GB, close browsers before chat."
