using System.Runtime.InteropServices;
using LibVLCSharp.Shared;

namespace TarangaPlus;

[ComVisible(true)]
public class NativeVideoPlayer
{
    private LibVLC? _libVlc;
    private MediaPlayer? _mediaPlayer;
    private readonly Lock _lock = new();

    public event Action<string>? OnPlaying;
    public event Action? OnStopped;
    public event Action? OnPaused;
    public event Action<int>? OnBuffering;

    public NativeVideoPlayer()
    {
        try
        {
            LibVLCSharp.Shared.Core.Initialize();
            _libVlc = new LibVLC("--no-video-title-show", "--network-caching=300",
                "--live-caching=300", "--no-osd", "--file-caching=300",
                "--avcodec-hw=any");
            _mediaPlayer = new MediaPlayer(_libVlc);
            _mediaPlayer.Stopped += (_, _) => OnStopped?.Invoke();
            _mediaPlayer.Paused += (_, _) => OnPaused?.Invoke();
            _mediaPlayer.Buffering += (_, args) => OnBuffering?.Invoke((int)args.Cache);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[NativeVideoPlayer] Init failed: {ex.Message}");
        }
    }

    public bool IsAvailable => _mediaPlayer != null;
    public bool IsPlaying => _mediaPlayer?.IsPlaying ?? false;

    public void Attach(LibVLCSharp.WPF.VideoView view)
    {
        if (_mediaPlayer != null)
            view.MediaPlayer = _mediaPlayer;
    }

    public void PlayStream(string url, string? referer = null, string? userAgent = null)
    {
        if (_mediaPlayer == null || _libVlc == null) return;

        lock (_lock)
        {
            _mediaPlayer.Stop();

            using var media = new Media(_libVlc, url);
            media.AddOption(":network-caching=300");
            media.AddOption(":live-caching=300");
            if (!string.IsNullOrEmpty(referer))
                media.AddOption($":http-referrer={referer}");
            if (!string.IsNullOrEmpty(userAgent))
                media.AddOption($":http-user-agent={userAgent}");
            media.AddOption(":http-reconnect");

            _mediaPlayer.Play(media);
            OnPlaying?.Invoke(url);
        }
    }

    public void Stop()
    {
        _mediaPlayer?.Stop();
        OnStopped?.Invoke();
    }

    public void Pause()
    {
        if (_mediaPlayer?.IsPlaying == true)
            _mediaPlayer.Pause();
    }

    public void Resume()
    {
        if (_mediaPlayer?.IsPlaying == false)
            _mediaPlayer.Play();
    }

    public void SetVolume(int volume)
    {
        if (_mediaPlayer != null)
            _mediaPlayer.Volume = Math.Clamp(volume, 0, 200);
    }

    public int GetVolume()
    {
        return _mediaPlayer?.Volume ?? 100;
    }

    public void ToggleMute()
    {
        if (_mediaPlayer != null)
            _mediaPlayer.Mute = !_mediaPlayer.Mute;
    }

    public bool IsMuted => _mediaPlayer?.Mute ?? false;

    public long Time => _mediaPlayer?.Time ?? 0;
    public long Length => _mediaPlayer?.Length ?? 0;

    public void Dispose()
    {
        _mediaPlayer?.Stop();
        _mediaPlayer?.Dispose();
        _libVlc?.Dispose();
    }
}
