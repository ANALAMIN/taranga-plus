using System.IO;
using System.Text;
using System.Text.Json;
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

        // Handle fullscreen via JS→C# messaging (more reliable than ContainsFullScreenElementChanged)
        webView.CoreWebView2.WebMessageReceived += (s, args) =>
        {
            try
            {
                using var doc = JsonDocument.Parse(args.WebMessageAsJson);
                var root = doc.RootElement;
                if (root.TryGetProperty("type", out var type) && type.GetString() == "fullscreen")
                {
                    bool isFS = root.GetProperty("value").GetBoolean();
                    Dispatcher.Invoke(() =>
                    {
                        if (isFS)
                        {
                            WindowStyle = WindowStyle.None;
                            ResizeMode = ResizeMode.NoResize;
                            WindowState = WindowState.Normal;
                            WindowState = WindowState.Maximized;
                        }
                        else
                        {
                            WindowStyle = WindowStyle.SingleBorderWindow;
                            ResizeMode = ResizeMode.CanResize;
                            WindowState = WindowState.Normal;
                        }
                    });
                }
            }
            catch { }
        };

        await webView.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(@"
// Override requestFullscreen to notify C# regardless of WebView2 fullscreen support
const origRequestFS = Element.prototype.requestFullscreen;
Element.prototype.requestFullscreen = function (opts) {
  window.chrome.webview.postMessage({ type: 'fullscreen', value: true });
  try { return origRequestFS.call(this, opts); } catch (e) { /* WPF may not support it */ }
};
const origExitFS = Document.prototype.exitFullscreen;
Document.prototype.exitFullscreen = function () {
  window.chrome.webview.postMessage({ type: 'fullscreen', value: false });
  try { return origExitFS.call(this); } catch (e) {} };
// Also listen for native fullscreenchange as fallback
document.addEventListener('fullscreenchange', () => {
  window.chrome.webview.postMessage({ type: 'fullscreen', value: !!document.fullscreenElement });
});
");

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
            AppDomain.CurrentDomain.BaseDirectory, "..", "..", "..", "dist", "index.html"));
        webView.CoreWebView2.Navigate($"file:///{path.Replace('\\', '/')}");
#endif
    }
}