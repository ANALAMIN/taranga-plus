using System.IO;
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

#if DEBUG
        webView.CoreWebView2.Navigate("http://localhost:1420");
#else
        var path = Path.GetFullPath(Path.Combine(
            AppDomain.CurrentDomain.BaseDirectory, "..", "..", "..", "dist", "index.html"));
        webView.CoreWebView2.Navigate($"file:///{path.Replace('\\', '/')}");
#endif
    }
}
