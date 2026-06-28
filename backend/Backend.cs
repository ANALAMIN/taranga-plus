using System.Net.Http;
using System.Runtime.InteropServices;

namespace TarangaPlus;

[ComVisible(true)]
public class Backend
{
    private static readonly HttpClient _http = new()
    {
        Timeout = TimeSpan.FromSeconds(5)
    };

    public async Task<string> FetchChannels()
    {
        var resp = await _http.GetAsync(
            "https://raw.githubusercontent.com/ANALAMIN/taranga-plus/master/data/channels.json");
        resp.EnsureSuccessStatusCode();
        return await resp.Content.ReadAsStringAsync();
    }
}