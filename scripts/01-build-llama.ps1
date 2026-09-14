# Clone ggml-org/llama.cpp and compile with CUDA (override CMAKE_CUDA_ARCHITECTURES if needed).

param(
    [switch]$Pull,
    [switch]$ForceLocal
)

. (Join-Path $PSScriptRoot "..\config.ps1")
Assert-CudaToolkit
Enter-VsDev
New-Dir $VendorDir

if ($ForceLocal) {
    $script:LlamaDir = Join-Path $VendorDir "llama.cpp"
    $script:BuildDir = Join-Path $LlamaDir "build"
    $script:BinDir = Join-Path $BuildDir "bin\Release"
}

if (-not (Test-Path (Join-Path $LlamaDir ".git"))) {
    Write-Host "Cloning llama.cpp (depth 1) into $LlamaDir ..."
    git clone --depth 1 https://github.com/ggml-org/llama.cpp $LlamaDir
} elseif ($Pull) {
    Write-Host "Updating llama.cpp in $LlamaDir ..."
    git -C $LlamaDir pull --ff-only
} else {
    Write-Host "Using $LlamaDir (pass -Pull to update)"
}

$arch = if ($env:CMAKE_CUDA_ARCHITECTURES) { $env:CMAKE_CUDA_ARCHITECTURES } else { "86;89;120" }
Write-Host "Configuring CUDA build (CMAKE_CUDA_ARCHITECTURES=$arch)..."

$cmakeArgs = @(
    "-S", $LlamaDir
    "-B", $BuildDir
    "-G", "Visual Studio 17 2022"
    "-A", "x64"
    "-DGGML_CUDA=ON"
    "-DGGML_NATIVE=OFF"
    "-DCMAKE_CUDA_ARCHITECTURES=$arch"
    "-DCMAKE_CUDA_COMPILER=$($Nvcc -replace '\\', '/')"
    "-DLLAMA_CURL=OFF"
)

& cmake @cmakeArgs
if ($LASTEXITCODE -ne 0) {
    Write-Warning "Configure failed with $arch; retrying native"
    $cmakeArgs = $cmakeArgs | ForEach-Object {
        if ($_ -like "-DCMAKE_CUDA_ARCHITECTURES=*") { "-DCMAKE_CUDA_ARCHITECTURES=native" } else { $_ }
    }
    & cmake @cmakeArgs
    if ($LASTEXITCODE -ne 0) { throw "cmake configure failed" }
}

Write-Host "Building Release targets..."
& cmake --build $BuildDir --config Release --target llama-cli llama-server llama-quantize llama-bench --parallel 12
if ($LASTEXITCODE -ne 0) { throw "cmake build failed" }

foreach ($name in @("llama-cli.exe", "llama-server.exe", "llama-quantize.exe", "llama-bench.exe")) {
    $exe = Join-Path $BinDir $name
    if (Test-Path $exe) { Set-HighPerformanceGpu $exe }
}

Write-Host "Build OK. Binaries: $BinDir"
Write-Host "Next: scripts\06-probe-gpu.ps1"
