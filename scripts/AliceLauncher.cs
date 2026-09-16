using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

public static class Program
{
    [STAThread]
    public static int Main()
    {
        try
        {
            var exeDir = Path.GetDirectoryName(Application.ExecutablePath);
            var root = Directory.Exists(Path.Combine(exeDir, "scripts"))
                ? exeDir
                : Path.GetFullPath(Path.Combine(exeDir, ".."));
            var script = Path.Combine(root, "scripts", "08-start-companion.ps1");
            if (!File.Exists(script))
            {
                MessageBox.Show(
                    "Could not find scripts\\08-start-companion.ps1.\nPut Start-ALICE.exe in the ALICE folder.",
                    "ALICE",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
                return 1;
            }

            var psi = new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = "-NoProfile -ExecutionPolicy Bypass -File \"" + script + "\"",
                WorkingDirectory = root,
                UseShellExecute = true
            };
            Process.Start(psi);
            return 0;
        }
        catch (Exception ex)
        {
            MessageBox.Show(ex.Message, "ALICE", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
    }
}
