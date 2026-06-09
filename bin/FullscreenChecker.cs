using System;
using System.Runtime.InteropServices;
class FullscreenChecker {
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr h, uint f);
  [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr h, ref MONITORINFO i);
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int n);
  const int GWL_STYLE = -16;
  const long WS_POPUP = 0x80000000;
  const long WS_CAPTION = 0x00C00000;
  struct RECT { public int l,t,r,b; }
  struct MONITORINFO { public int s; public RECT m,w; public uint f; }
  static int Main() {
    IntPtr h = GetForegroundWindow();
    if (h == IntPtr.Zero) return 1;
    RECT app;
    GetWindowRect(h, out app);
    IntPtr mon = MonitorFromWindow(h, 2);
    MONITORINFO mi = new MONITORINFO();
    mi.s = Marshal.SizeOf(mi);
    GetMonitorInfo(mon, ref mi);
    if (app.l <= mi.m.l && app.t <= mi.m.t && app.r >= mi.m.r && app.b >= mi.m.b) {
      int style = GetWindowLong(h, GWL_STYLE);
      if ((style & WS_POPUP) != 0 && (style & WS_CAPTION) == 0) return 0;
    }
    return 1;
  }
}
