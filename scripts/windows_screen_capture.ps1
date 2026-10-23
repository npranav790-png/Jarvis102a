param(
    [Parameter(Mandatory=$true)]
    [string]$OutPath,
    [string]$Format = "png"
)

$code = @"
using System;
using System.Runtime.InteropServices;
using System.Drawing;
using System.Drawing.Imaging;
using System.Threading;

public class DesktopRetinaCapture {
    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr OpenDesktop(string lpszDesktop, int dwFlags, bool fInherit, uint dwDesiredAccess);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool SetThreadDesktop(IntPtr hDesktop);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool CloseDesktop(IntPtr hDesktop);

    public static string Capture(string outPath, bool isJpeg) {
        IntPtr hDesk = OpenDesktop("Default", 0, false, 0x01FF);
        string res = "";

        if (hDesk != IntPtr.Zero) {
            Thread t = new Thread(() => {
                try {
                    SetThreadDesktop(hDesk);
                    int w = System.Windows.Forms.Screen.PrimaryScreen.Bounds.Width;
                    int h = System.Windows.Forms.Screen.PrimaryScreen.Bounds.Height;
                    using (Bitmap bmp = new Bitmap(w, h)) {
                        using (Graphics g = Graphics.FromImage(bmp)) {
                            g.CopyFromScreen(0, 0, 0, 0, new Size(w, h));
                        }
                        bmp.Save(outPath, isJpeg ? ImageFormat.Jpeg : ImageFormat.Png);
                    }
                    res = w + "x" + h;
                } catch (Exception ex) {
                    res = "ERR:" + ex.Message;
                }
            });
            t.SetApartmentState(ApartmentState.STA);
            t.Start();
            t.Join(8000);
            CloseDesktop(hDesk);
            if (!string.IsNullOrEmpty(res) && !res.StartsWith("ERR:")) {
                return res;
            }
        }

        // Direct Fallback
        int sw = System.Windows.Forms.Screen.PrimaryScreen.Bounds.Width;
        int sh = System.Windows.Forms.Screen.PrimaryScreen.Bounds.Height;
        using (Bitmap bmp = new Bitmap(sw, sh)) {
            using (Graphics g = Graphics.FromImage(bmp)) {
                g.CopyFromScreen(0, 0, 0, 0, new Size(sw, sh));
            }
            bmp.Save(outPath, isJpeg ? ImageFormat.Jpeg : ImageFormat.Png);
        }
        return sw + "x" + sh;
    }
}
"@

Add-Type -TypeDefinition $code -ReferencedAssemblies System.Drawing, System.Windows.Forms
$isJpeg = ($Format -eq "jpeg" -or $Format -eq "jpg")
$dim = [DesktopRetinaCapture]::Capture($OutPath, $isJpeg)
Write-Output $dim
