using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Text;
using System.Windows.Forms;

public static class Branding
{
    public static Icon Icon;
    public static Image Logo;

    public static void Load(string root)
    {
        var icoPath = Path.Combine(root, "logo.ico");
        var jpgPath = Path.Combine(root, "logo.jpg");
        try
        {
            if (File.Exists(icoPath)) Icon = new Icon(icoPath);
        }
        catch { }
        try
        {
            if (File.Exists(jpgPath))
            {
                Logo = Image.FromFile(jpgPath);
                if (Icon == null)
                {
                    using (var bmp = new Bitmap(Logo, 32, 32))
                    {
                        Icon = Icon.FromHandle(bmp.GetHicon());
                    }
                }
            }
        }
        catch { }
    }
}

public class ChooserForm : Form
{
    readonly RadioButton uiOnly;
    readonly RadioButton uiLlama;
    readonly RadioButton full;

    public string SelectedMode { get; private set; }

    public ChooserForm()
    {
        Text = "DP&&U";
        FormBorderStyle = FormBorderStyle.FixedDialog;
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(360, 210);
        MaximizeBox = false;
        MinimizeBox = false;
        ShowInTaskbar = true;
        if (Branding.Icon != null) Icon = Branding.Icon;

        var hintLeft = 16;
        if (Branding.Logo != null)
        {
            var pic = new PictureBox
            {
                Location = new Point(16, 10),
                Size = new Size(48, 48),
                SizeMode = PictureBoxSizeMode.Zoom,
                Image = Branding.Logo
            };
            Controls.Add(pic);
            hintLeft = 72;
        }

        var hint = new Label
        {
            AutoSize = false,
            Location = new Point(hintLeft, 12),
            Size = new Size(360 - hintLeft - 16, 32),
            Text = "Desktop partner working with you"
        };

        uiOnly = new RadioButton
        {
            AutoSize = true,
            Location = new Point(20, 52),
            Text = "UI only (no llama)"
        };
        uiLlama = new RadioButton
        {
            AutoSize = true,
            Checked = true,
            Location = new Point(20, 80),
            Text = "UI and llama"
        };
        full = new RadioButton
        {
            AutoSize = true,
            Location = new Point(20, 108),
            Text = "Full (UI, llama, and Discord)"
        };

        var start = new Button
        {
            Text = "Start",
            Location = new Point(20, 154),
            Size = new Size(320, 36)
        };
        start.Click += delegate
        {
            if (uiOnly.Checked) SelectedMode = "ui";
            else if (full.Checked) SelectedMode = "full";
            else SelectedMode = "llama";
            DialogResult = DialogResult.OK;
            Close();
        };
        AcceptButton = start;

        Controls.Add(hint);
        Controls.Add(uiOnly);
        Controls.Add(uiLlama);
        Controls.Add(full);
        Controls.Add(start);
    }
}

public class ToastForm : Form
{
    public ToastForm(string title, string command)
    {
        Text = "DP&&U";
        FormBorderStyle = FormBorderStyle.FixedDialog;
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(440, 170);
        MaximizeBox = false;
        MinimizeBox = false;
        TopMost = true;
        ShowInTaskbar = true;
        if (Branding.Icon != null) Icon = Branding.Icon;

        var body = title + "\r\n\r\nRun this command at the repo root to fetch:\r\n" + command;
        var box = new TextBox
        {
            Multiline = true,
            ReadOnly = true,
            BorderStyle = BorderStyle.None,
            Location = new Point(16, 16),
            Size = new Size(408, 100),
            Text = body,
            BackColor = SystemColors.Window,
            TabStop = true
        };
        var ok = new Button
        {
            Text = "OK",
            Location = new Point(324, 124),
            Size = new Size(100, 28)
        };
        ok.Click += delegate { Close(); };
        AcceptButton = ok;
        Controls.Add(box);
        Controls.Add(ok);
        Load += delegate
        {
            box.SelectAll();
            box.Focus();
        };
        box.KeyDown += delegate(object sender, KeyEventArgs e)
        {
            if (e.Control && e.KeyCode == Keys.A)
            {
                box.SelectAll();
                e.SuppressKeyPress = true;
            }
        };
    }
}

public static class Program
{
    static void ShowToast(string title, string command)
    {
        using (var toast = new ToastForm(title, command))
        {
            toast.ShowDialog();
        }
    }

    static void ParseToast(string stderr, out string title, out string command)
    {
        title = "Something went wrong.";
        command = ".\\scripts\\00-fetch-utsuwa.ps1";
        if (string.IsNullOrEmpty(stderr)) return;
        var lines = stderr.Replace("\r\n", "\n").Split('\n');
        for (var i = 0; i < lines.Length; i++)
        {
            if (lines[i].Trim() != "DPU_TOAST") continue;
            if (i + 1 < lines.Length && lines[i + 1].Trim().Length > 0)
                title = lines[i + 1].Trim();
            if (i + 2 < lines.Length && lines[i + 2].Trim().Length > 0)
                command = lines[i + 2].Trim();
            return;
        }
        var trimmed = stderr.Trim();
        if (trimmed.Length > 0) title = trimmed;
    }

    [STAThread]
    public static int Main()
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        try
        {
            var exeDir = Path.GetDirectoryName(Application.ExecutablePath);
            var root = Directory.Exists(Path.Combine(exeDir, "scripts"))
                ? exeDir
                : Path.GetFullPath(Path.Combine(exeDir, ".."));
            Branding.Load(root);
            var script = Path.Combine(root, "scripts", "08-start-companion.ps1");
            if (!File.Exists(script))
            {
                ShowToast(
                    "Could not find scripts\\08-start-companion.ps1.",
                    "Put DPU.exe in the DP&U folder.");
                return 1;
            }

            string mode;
            using (var chooser = new ChooserForm())
            {
                if (chooser.ShowDialog() != DialogResult.OK || string.IsNullOrEmpty(chooser.SelectedMode))
                {
                    return 0;
                }
                mode = chooser.SelectedMode;
            }

            var psi = new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \""
                    + script + "\" -Mode " + mode + " -Silent",
                WorkingDirectory = root,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardError = true,
                RedirectStandardOutput = true,
                StandardErrorEncoding = Encoding.UTF8,
                StandardOutputEncoding = Encoding.UTF8
            };

            using (var proc = Process.Start(psi))
            {
                if (proc == null)
                {
                    ShowToast("Could not start DP&U.", ".\\DPU.bat");
                    return 1;
                }
                var err = proc.StandardError.ReadToEnd();
                proc.WaitForExit();
                if (proc.ExitCode != 0)
                {
                    string title, command;
                    ParseToast(err, out title, out command);
                    ShowToast(title, command);
                    return proc.ExitCode;
                }
            }
            return 0;
        }
        catch (Exception ex)
        {
            ShowToast(ex.Message, ".\\scripts\\00-fetch-utsuwa.ps1");
            return 1;
        }
    }
}
