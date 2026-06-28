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
        var env = await CoreWebView2Environment.CreateAsync(
            userDataFolder: Path.Combine(Path.GetTempPath(), "TarangaPlus-WebView2"));
        await webView.EnsureCoreWebView2Async(env);
        webView.CoreWebView2.Settings.AreDevToolsEnabled = true;
        webView.CoreWebView2.AddHostObjectToScript("backend", new Backend());

        // Intercept GitHub raw channels.json → serve from local disk (0ms, no network)
        var channelsPath = Path.GetFullPath(Path.Combine(
            AppDomain.CurrentDomain.BaseDirectory, "..", "..", "..", "..", "data", "channels.json"));

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

        webView.CoreWebView2.AddWebResourceRequestedFilter(
            "https://raw.githubusercontent.com/ANALAMIN/taranga-plus/master/data/channels.json",
            CoreWebView2WebResourceContext.All);

        webView.CoreWebView2.WebResourceRequested += (s, args) =>
        {
            if (args.Request.Uri.Contains("channels.json") && File.Exists(channelsPath))
            {
                var json = File.ReadAllText(channelsPath);
                var stream = new MemoryStream(Encoding.UTF8.GetBytes(json));
                args.Response = webView.CoreWebView2.Environment.CreateWebResourceResponse(
                    stream, 200, "OK",
                    "Content-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\n");
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