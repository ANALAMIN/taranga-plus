using System.IO;
using System.Runtime.InteropServices;
using System.Windows;

namespace TarangaPlus;

[ComVisible(true)]
public class Backend
{
    private readonly NativeVideoPlayer _nativePlayer;

    public Backend(NativeVideoPlayer nativePlayer)
    {
        _nativePlayer = nativePlayer;
    }

    public string FetchChannels()
    {
        var path = Path.GetFullPath(Path.Combine(
            AppDomain.CurrentDomain.BaseDirectory, "..", "..", "..", "..", "data", "channels.json"));
        return File.ReadAllText(path);
    }

    public bool IsNativeAvailable()
    {
        return _nativePlayer.IsAvailable;
    }

    public bool IsNativePlaying()
    {
        return _nativePlayer.IsPlaying;
    }

    public void PlayNative(string url, string? referer, string? userAgent)
    {
        _nativePlayer.PlayStream(url, referer, userAgent);
        SetNativeMode(true);
    }

    public void StopNative()
    {
        _nativePlayer.Stop();
        SetNativeMode(false);
    }

    public void PauseNative()
    {
        _nativePlayer.Pause();
    }

    public void ResumeNative()
    {
        _nativePlayer.Resume();
    }

    public void SetNativeVolume(int volume)
    {
        _nativePlayer.SetVolume(volume);
    }

    public int GetNativeVolume()
    {
        return _nativePlayer.GetVolume();
    }

    public void ToggleNativeMute()
    {
        _nativePlayer.ToggleMute();
    }

    public bool IsNativeMuted()
    {
        return _nativePlayer.IsMuted;
    }

    private void SetNativeMode(bool enabled)
    {
        Application.Current.Dispatcher.Invoke(() =>
        {
            if (Application.Current.MainWindow is MainWindow main)
                main.SetNativeMode(enabled);
        });
    }
}
