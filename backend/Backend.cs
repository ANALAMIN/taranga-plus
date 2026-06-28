using System.IO;
using System.Runtime.InteropServices;

namespace TarangaPlus;

[ComVisible(true)]
public class Backend
{
    public string FetchChannels()
    {
        var path = Path.GetFullPath(Path.Combine(
            AppDomain.CurrentDomain.BaseDirectory, "..", "..", "..", "..", "data", "channels.json"));
        return File.ReadAllText(path);
    }
}
