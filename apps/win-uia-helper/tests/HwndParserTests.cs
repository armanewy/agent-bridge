using AgentBridge.WinUiaHelper;
using Xunit;

namespace AgentBridge.WinUiaHelper.Tests;

public sealed class HwndParserTests
{
    [Fact]
    public void ParsesDecimalHandles()
    {
        Assert.Equal(new IntPtr(255), HwndParser.Parse("255"));
    }

    [Fact]
    public void ParsesHexHandles()
    {
        Assert.Equal(new IntPtr(255), HwndParser.Parse("0xFF"));
    }

    [Fact]
    public void FormatsHandlesAsHex()
    {
        Assert.Equal("0xFF", HwndParser.Format(new IntPtr(255)));
    }
}
