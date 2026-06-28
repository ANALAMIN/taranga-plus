using System;
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
        webView.CoreWebView2.AddHostObjectToScript("backend", new Backend(this));

#if DEBUG
        webView.CoreWebView2.Navigate("http://localhost:1420");
#else
        var path = Path.GetFullPath(Path.Combine(
            AppDomain.CurrentDomain.BaseDirectory, "..", "..", "..", "dist", "index.html"));
        webView.CoreWebView2.Navigate($"file:///{path.Replace('\\', '/')}");
#endif
    }

    private void OnBackClicked(object sender, RoutedEventArgs e)
    {
        StopPlayback();
    }

    public void PlayStream(string url)
    {
        mediaElement.Source = new Uri(url);
        mediaElement.Play();
        mediaElement.Visibility = Visibility.Visible;
        backBtnBorder.Visibility = Visibility.Visible;
    }

    public void StopPlayback()
    {
        mediaElement.Stop();
        mediaElement.Source = null;
        mediaElement.Visibility = Visibility.Collapsed;
        backBtnBorder.Visibility = Visibility.Collapsed;
    }

    public void PausePlayback()
    {
        mediaElement.Pause();
    }

    public void ResumePlayback()
    {
        mediaElement.Play();
    }

    public void SetVolume(double level)
    {
        mediaElement.Volume = Math.Clamp(level, 0, 1);
    }
}
