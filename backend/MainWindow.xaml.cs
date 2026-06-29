using System.IO;
using System.Text;
using System.Windows;
using Microsoft.Web.WebView2.Core;

namespace TarangaPlus;

public partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
        Loaded += OnLoaded;
    }

    private async void OnLoaded(object sender, RoutedEventArgs e)
    {
        // --autoplay-policy=no-user-gesture-required: prevents WebView2's
        // Chromium engine from silently blocking video.play() calls.
        // --disable-web-security: completely bypasses CORS restrictions.
        // This is REQUIRED because most third-party IPTV servers do not send
        // Access-Control-Allow-Origin headers, which would cause Shaka Player
        // (running in a browser context) to fail with "Channel Unavailable".
        var options = new CoreWebView2EnvironmentOptions(
            "--autoplay-policy=no-user-gesture-required --disable-web-security");
        var env = await CoreWebView2Environment.CreateAsync(
            userDataFolder: Path.Combine(Path.GetTempPath(), "TarangaPlus-WebView2"),
            options: options);
        await webView.EnsureCoreWebView2Async(env);
        webView.CoreWebView2.Settings.AreDevToolsEnabled = true;
        webView.CoreWebView2.AddHostObjectToScript("backend", new Backend());

        // Removed GitHub raw URL interception.
        // The app will now fetch the live, validated channels.json directly from GitHub
        // instead of forcing the local file. This ensures the 30-minute GitHub Action updates are received.

        // Handle HTML5 fullscreen (Shaka Player fullscreen button)
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

#if DEBUG
        webView.CoreWebView2.Navigate("http://localhost:1420");
#else
        var path = Path.GetFullPath(Path.Combine(
            AppDomain.CurrentDomain.BaseDirectory, "..", "..", "..", "..", "frontend", "dist", "index.html"));
        webView.CoreWebView2.Navigate($"file:///{path.Replace('\\', '/')}");
#endif
    }
}