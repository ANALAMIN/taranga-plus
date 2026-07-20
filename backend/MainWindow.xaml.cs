using System.IO;
using System.Windows;
using Microsoft.Web.WebView2.Core;

namespace TarangaPlus;

public partial class MainWindow : Window
{
    public NativeVideoPlayer NativePlayer { get; } = new();

    public MainWindow()
    {
        InitializeComponent();
        Loaded += OnLoaded;
        Closing += (_, _) => NativePlayer.Dispose();
    }

    private async void OnLoaded(object sender, RoutedEventArgs e)
    {
        var options = new CoreWebView2EnvironmentOptions(
            "--autoplay-policy=no-user-gesture-required --disable-web-security " +
            "--disable-sync --disable-component-update " +
            "--disable-features=TranslateUI,ChromeWhatsNewUI,ChromeLabs,MediaRouter");
        var env = await CoreWebView2Environment.CreateAsync(
            userDataFolder: Path.Combine(Path.GetTempPath(), "TarangaPlus-WebView2"),
            options: options);
        await webView.EnsureCoreWebView2Async(env);
        webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
#if !DEBUG
        webView.CoreWebView2.Settings.AreDevToolsEnabled = false;
#endif

        webView.DefaultBackgroundColor = System.Drawing.Color.FromArgb(0, 0, 0, 0);

        var backend = new Backend(NativePlayer);
        NativePlayer.Attach(vlcPlayer);
        webView.CoreWebView2.AddHostObjectToScript("backend", backend);
        webView.CoreWebView2.AddHostObjectToScript("nativePlayer", NativePlayer);

        webView.CoreWebView2.ContainsFullScreenElementChanged += (s, args) =>
        {
            if (webView.CoreWebView2.ContainsFullScreenElement)
            {
                WindowStyle = WindowStyle.None;
                WindowState = WindowState.Maximized;
                ResizeMode = ResizeMode.NoResize;
            }
            else
            {
                WindowStyle = WindowStyle.SingleBorderWindow;
                WindowState = WindowState.Normal;
                ResizeMode = ResizeMode.CanResize;
            }
        };

        this.StateChanged += (_, _) =>
        {
            if (WindowState == WindowState.Minimized)
                webView.CoreWebView2.MemoryUsageTargetLevel = CoreWebView2MemoryUsageTargetLevel.Low;
            else
                webView.CoreWebView2.MemoryUsageTargetLevel = CoreWebView2MemoryUsageTargetLevel.Normal;
        };

#if DEBUG
        webView.CoreWebView2.Navigate("http://localhost:1420");
#else
        var path = Path.GetFullPath(Path.Combine(
            AppDomain.CurrentDomain.BaseDirectory, "..", "..", "..", "..", "frontend", "dist", "index.html"));
        webView.CoreWebView2.Navigate($"file:///{path.Replace('\\', '/')}");
#endif
    }

    public void SetNativeMode(bool enabled)
    {
        Dispatcher.Invoke(() =>
        {
            vlcPlayer.Visibility = enabled ? Visibility.Visible : Visibility.Collapsed;
            webView.DefaultBackgroundColor = enabled
                ? System.Drawing.Color.FromArgb(0, 0, 0, 0)
                : System.Drawing.Color.FromArgb(255, 0, 0, 0);
        });
    }
}
