# Compiles DPU.exe next to DPU.bat (repo root), with logo.ico as the Windows icon.
# Filename is DPU (no &) because Windows treats & as a command separator.

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$srcPath = Join-Path $PSScriptRoot "DpuLauncher.cs"
$jpg = Join-Path $root "logo.jpg"
$ico = Join-Path $root "logo.ico"
$out = Join-Path $root "DPU.exe"

if (-not (Test-Path -LiteralPath $jpg)) {
    throw "Missing logo.jpg at $jpg"
}

Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @"
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
public static class DpuIco {
    public static void FromJpeg(string jpeg, string icoPath) {
        using (var src = Image.FromFile(jpeg))
        using (var bmp = new Bitmap(256, 256, PixelFormat.Format32bppArgb))
        using (var g = Graphics.FromImage(bmp)) {
            g.Clear(Color.Transparent);
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.PixelOffsetMode = PixelOffsetMode.HighQuality;
            g.DrawImage(src, 0, 0, 256, 256);
            using (var ms = new MemoryStream()) {
                bmp.Save(ms, ImageFormat.Png);
                var png = ms.ToArray();
                using (var fs = File.Create(icoPath))
                using (var bw = new BinaryWriter(fs)) {
                    bw.Write((short)0);
                    bw.Write((short)1);
                    bw.Write((short)1);
                    bw.Write((byte)0);
                    bw.Write((byte)0);
                    bw.Write((byte)0);
                    bw.Write((byte)0);
                    bw.Write((short)1);
                    bw.Write((short)32);
                    bw.Write(png.Length);
                    bw.Write(22);
                    bw.Write(png);
                }
            }
        }
    }
}
"@
[DpuIco]::FromJpeg($jpg, $ico)

$csc = Join-Path $env:WINDIR "Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path $csc)) {
    $csc = Join-Path $env:WINDIR "Microsoft.NET\Framework\v4.0.30319\csc.exe"
}
if (-not (Test-Path $csc)) {
    throw "csc.exe not found. Install .NET Framework 4.x developer pack / Windows."
}

$refs = @(
    "/reference:System.Windows.Forms.dll"
    "/reference:System.Drawing.dll"
)
& $csc /nologo /target:winexe /platform:x64 /out:$out /win32icon:$ico @refs $srcPath
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $out)) {
    throw "Failed to write $out"
}

$old = Join-Path $root "Start-DPU.exe"
if (Test-Path $old) { Remove-Item -Force $old }
Write-Host "Wrote $out"
Write-Host "Icon: $ico"
