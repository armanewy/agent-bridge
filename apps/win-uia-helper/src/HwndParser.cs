namespace AgentBridge.WinUiaHelper;

public static class HwndParser
{
    public static nint Parse(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new ArgumentException("hwnd is required.", nameof(value));
        }

        var trimmed = value.Trim();
        if (trimmed.StartsWith("0x", StringComparison.OrdinalIgnoreCase))
        {
            return new IntPtr(Convert.ToInt64(trimmed[2..], 16));
        }

        return new IntPtr(Convert.ToInt64(trimmed));
    }

    public static string Format(nint hwnd) => $"0x{hwnd.ToInt64():X}";
}
