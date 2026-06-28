using System;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Windows;

namespace TarangaPlus;

[ComVisible(true)]
public class Backend
{
    private static readonly HttpClient _http = new()
    {
        Timeout = TimeSpan.FromSeconds(5)
    };

    private readonly MainWindow _window;

    public Backend(MainWindow window) => _window = window;

    public async Task<string> FetchChannels()
    {
        var resp = await _http.GetAsync(
            "https://raw.githubusercontent.com/ANALAMIN/taranga-plus/master/data/channels.json");
        resp.EnsureSuccessStatusCode();
        return await resp.Content.ReadAsStringAsync();
    }

    public void PlayStream(string url)
    {
        _window.Dispatcher.Invoke(() => _window.PlayStream(url));
    }

    public void StopPlayback()
    {
        _window.Dispatcher.Invoke(() => _window.StopPlayback());
    }

    public void PausePlayback()
    {
        _window.Dispatcher.Invoke(() => _window.PausePlayback());
    }

    public void ResumePlayback()
    {
        _window.Dispatcher.Invoke(() => _window.ResumePlayback());
    }

    public void SetVolume(double level)
    {
        _window.Dispatcher.Invoke(() => _window.SetVolume(level));
    }
}
