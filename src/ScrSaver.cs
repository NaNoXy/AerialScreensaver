using System;
using System.IO;
using System.Drawing;
using System.Windows.Forms;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Collections.Generic;
using System.Linq;
using System.Web.Script.Serialization;

class AerialScreensaverScr
{
    [DllImport("kernel32.dll")] static extern IntPtr CreateJobObject(IntPtr a, string n);
    [DllImport("kernel32.dll")] static extern bool SetInformationJobObject(IntPtr h, int i, IntPtr p, uint s);
    [DllImport("kernel32.dll")] static extern bool AssignProcessToJobObject(IntPtr h, IntPtr p);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
    [DllImport("user32.dll")] static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);
    [DllImport("user32.dll")] static extern bool LockWorkStation();

    struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }

    const int JobObjectExtendedLimitInformation = 9;
    const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000;

    [StructLayout(LayoutKind.Sequential)]
    struct JOBOBJECT_BASIC_LIMIT_INFORMATION
    {
        public long PerProcessUserTimeLimit;
        public long PerJobUserTimeLimit;
        public uint LimitFlags;
        public IntPtr MinimumWorkingSetSize;
        public IntPtr MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public IntPtr Affinity;
        public uint PriorityClass;
        public uint SchedulingClass;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION
    {
        public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
        public long IoInfo1, IoInfo2, IoInfo3, IoInfo4, IoInfo5, IoInfo6;
        public ulong ProcessMemoryLimit;
        public ulong JobMemoryLimit;
        public ulong PeakProcessMemoryUsed;
        public ulong PeakJobMemoryUsed;
    }

    [STAThread]
    static void Main(string[] args)
    {
        bool start = false, lockOnExit = false;
        foreach (string arg in args)
        {
            string a = arg.ToLowerInvariant();
            if (a == "/s" || a == "-s") start = true;
            if (a == "/lock" || a == "-lock") lockOnExit = true;
        }
        if (start) StartScreensaver(lockOnExit);
    }

    static Dictionary<string, object> ReadConfig(string path)
    {
        if (!File.Exists(path)) return null;
        try
        {
            string json = File.ReadAllText(path);
            return new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(json);
        }
        catch { return null; }
    }

    static void WriteConfig(string path, Dictionary<string, object> root)
    {
        try
        {
            string json = new JavaScriptSerializer().Serialize(root);
            File.WriteAllText(path, json);
        }
        catch { }
    }

    static string FindMpv()
    {
        string dir = Path.GetDirectoryName(typeof(AerialScreensaverScr).Assembly.Location);
        string[] tryPaths = {
            Path.Combine(dir, "bin", "mpv.exe"),
            Path.Combine(dir, "..", "bin", "mpv.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Aerial Screensaver", "bin", "mpv.exe"),
        };
        foreach (string p in tryPaths)
        {
            if (File.Exists(p)) return p;
        }
        return null;
    }

    static string BuildMpvArgs(string videoPath, Dictionary<string, object> config)
    {
        List<string> a = new List<string>();
        a.Add("--fullscreen");
            a.Add("--stop-screensaver=no");
            a.Add("--cursor-autohide=0");
        a.Add("--no-osc --no-osd-bar --really-quiet --hwdec=auto");

        object temp;
        bool disableHdr = false;
        if (config != null && config.TryGetValue("disableHdr", out temp) && temp is bool)
            disableHdr = (bool)temp;

        if (disableHdr)
            a.Add("--vo=gpu");
        else
            a.Add("--vo=gpu-next --target-colorspace-hint=yes --hdr-compute-peak=yes --target-peak=auto");

        string toneMapping = "auto";
        if (config != null && config.TryGetValue("toneMapping", out temp))
        { string s = temp as string; if (s != null) toneMapping = s; }
        a.Add("--tone-mapping=" + toneMapping);

        bool fillScreen = false;
        if (config != null && config.TryGetValue("fillScreen", out temp) && temp is bool)
            fillScreen = (bool)temp;
        a.Add(fillScreen ? "--panscan=1.0" : "--keepaspect=yes");

        a.Add('"' + videoPath + '"');
        return string.Join(" ", a);
    }

    static string PickLeastPlayed(HashSet<string> videoIds, Dictionary<string, int> playCounts)
    {
        int minCount = int.MaxValue;
        foreach (string id in videoIds)
        {
            int c;
            playCounts.TryGetValue(id, out c);
            if (c < minCount) minCount = c;
        }
        List<string> candidates = new List<string>();
        foreach (string id in videoIds)
        {
            int c;
            playCounts.TryGetValue(id, out c);
            if (c == minCount) candidates.Add(id);
        }
        if (candidates.Count == 0) return null;
        return candidates[new Random().Next(candidates.Count)];
    }

    static void StartScreensaver(bool lockOnExit)
    {
        string configPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "aerial-screensaver", "aerial-screensaver-config.json");

        Dictionary<string, object> config = ReadConfig(configPath);
        if (config == null) return;

        Dictionary<string, string> videoMap = new Dictionary<string, string>();
        Dictionary<string, int> playCounts = new Dictionary<string, int>();

        object temp;
        if (config.TryGetValue("downloads", out temp))
        {
            Dictionary<string, object> dl = temp as Dictionary<string, object>;
            if (dl != null)
            {
                foreach (var kvp in dl)
                {
                    Dictionary<string, object> e = kvp.Value as Dictionary<string, object>;
                    if (e != null && e.TryGetValue("path", out temp))
                    {
                        string ps = temp as string;
                        if (!string.IsNullOrEmpty(ps) && File.Exists(ps))
                            videoMap[kvp.Key] = ps;
                    }
                }
            }
        }

        if (videoMap.Count == 0) return;

        if (config.TryGetValue("playCounts", out temp))
        {
            Dictionary<string, object> pc = temp as Dictionary<string, object>;
            if (pc != null)
            {
                foreach (var kvp in pc)
                {
                    if (kvp.Value is int) playCounts[kvp.Key] = (int)kvp.Value;
                    else if (kvp.Value is long) playCounts[kvp.Key] = (int)(long)kvp.Value;
                }
            }
        }

        string mpvExe = FindMpv();
        if (mpvExe == null) return;

        Rectangle r = new Rectangle();
        foreach (Screen s in Screen.AllScreens) r = Rectangle.Union(r, s.Bounds);

        Form f = new Form();
        f.BackColor = Color.Black;
        f.FormBorderStyle = FormBorderStyle.None;
        f.StartPosition = FormStartPosition.Manual;
        f.ShowInTaskbar = false;
        f.Bounds = r;
        f.Show();
        f.Refresh();

        IntPtr job = CreateJobObject(IntPtr.Zero, null);
        if (job != IntPtr.Zero)
        {
            JOBOBJECT_EXTENDED_LIMIT_INFORMATION info = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            int sz = Marshal.SizeOf(info);
            IntPtr ptr = Marshal.AllocHGlobal(sz);
            Marshal.StructureToPtr(info, ptr, false);
            SetInformationJobObject(job, JobObjectExtendedLimitInformation, ptr, (uint)sz);
            Marshal.FreeHGlobal(ptr);
        }

        LASTINPUTINFO lii = new LASTINPUTINFO();
        lii.cbSize = (uint)Marshal.SizeOf(lii);
        GetLastInputInfo(ref lii);
        uint startTick = lii.dwTime;

        Process mpv = null;
        string currentId = null;
        bool exiting = false;
        bool needNext = true;

        HashSet<string> videoIds = new HashSet<string>(videoMap.Keys);

        Timer inputTimer = new Timer();
        inputTimer.Interval = 100;
        inputTimer.Tick += (s, e) =>
        {
            if (exiting) return;

            LASTINPUTINFO li = new LASTINPUTINFO();
            li.cbSize = (uint)Marshal.SizeOf(li);
            GetLastInputInfo(ref li);

            if (li.dwTime != startTick)
            {
                exiting = true;
                inputTimer.Stop();
                if (currentId != null)
                {
                    int cur;
                    playCounts.TryGetValue(currentId, out cur);
                    playCounts[currentId] = cur + 1;
                }
                config["playCounts"] = playCounts;
                WriteConfig(configPath, config);
                if (mpv != null && !mpv.HasExited) try { mpv.Kill(); } catch { }
                if (lockOnExit) try { LockWorkStation(); } catch { }
                Application.Exit();
                return;
            }

            if (needNext)
            {
                currentId = PickLeastPlayed(videoIds, playCounts);
                if (currentId == null || !videoMap.ContainsKey(currentId))
                {
                    exiting = true;
                    Application.Exit();
                    return;
                }
                string path = videoMap[currentId];
                mpv = new Process();
                mpv.StartInfo.FileName = mpvExe;
                mpv.StartInfo.Arguments = BuildMpvArgs(path, config);
                mpv.StartInfo.UseShellExecute = false;
                mpv.StartInfo.CreateNoWindow = true;
                mpv.Start();
                if (job != IntPtr.Zero) AssignProcessToJobObject(job, mpv.Handle);
                needNext = false;
            }
            else if (mpv != null && mpv.HasExited)
            {
                int cur;
                playCounts.TryGetValue(currentId, out cur);
                playCounts[currentId] = cur + 1;
                config["playCounts"] = playCounts;
                WriteConfig(configPath, config);
                needNext = true;
            }
        };
        inputTimer.Start();

        f.FormClosing += (s, e) => {
            if (!exiting)
            {
                exiting = true;
                if (mpv != null && !mpv.HasExited) try { mpv.Kill(); } catch { }
            }
        };

        Application.Run();
        inputTimer.Stop();
        if (job != IntPtr.Zero) CloseHandle(job);
    }
}
