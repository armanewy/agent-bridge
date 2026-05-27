using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Windows.Automation;
using AgentBridge.WinUiaHelper;

var options = new JsonSerializerOptions
{
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    PropertyNameCaseInsensitive = true
};

while (await Console.In.ReadLineAsync() is { } line)
{
    if (string.IsNullOrWhiteSpace(line))
    {
        continue;
    }

    object response;
    try
    {
        using var document = JsonDocument.Parse(line);
        response = HandleCommand(document.RootElement);
    }
    catch (Exception ex)
    {
        response = new HelperResponse(false, ["Unhandled helper error."], Error: ex.Message);
    }

    Console.Out.WriteLine(JsonSerializer.Serialize(response, options));
    await Console.Out.FlushAsync();
}

static object HandleCommand(JsonElement root)
{
    var command = root.GetProperty("command").GetString();
    var payload = root.TryGetProperty("payload", out var payloadElement) ? payloadElement : default;

    return command switch
    {
        "healthCheck" => new HelperResponse(true, [], Message: "ok"),
        "listTopLevelWindows" => new HelperResponse(true, [], Windows: ListTopLevelWindows()),
        "getForegroundWindow" => new HelperResponse(true, [], Window: GetWindowMetadata(NativeMethods.GetForegroundWindow())),
        "inspectWindow" => InspectWindow(payload),
        "findEditableTargets" => FindEditableTargets(payload),
        "deliverText" => DeliverText(payload),
        _ => new HelperResponse(false, [$"Unsupported command: {command ?? "(missing)"}"])
    };
}

static HelperResponse InspectWindow(JsonElement payload)
{
    var hwnd = ReadHwnd(payload);
    var metadata = GetWindowMetadata(hwnd);
    if (metadata is null)
    {
        return new HelperResponse(false, ["Window not found."]);
    }

    return new HelperResponse(true, [], Window: metadata);
}

static HelperResponse FindEditableTargets(JsonElement payload)
{
    var hwnd = ReadHwnd(payload);
    var metadata = GetWindowMetadata(hwnd);
    if (metadata is null)
    {
        return new HelperResponse(false, ["Window not found."]);
    }

    return new HelperResponse(true, [], Window: metadata, CandidateControls: FindEditableControls(hwnd));
}

static HelperResponse DeliverText(JsonElement payload)
{
    var hwnd = ReadHwnd(payload);
    var text = payload.GetProperty("text").GetString() ?? "";
    var strategy = payload.TryGetProperty("strategy", out var strategyElement)
        ? strategyElement.GetString() ?? "dryRun"
        : "dryRun";

    var metadata = GetWindowMetadata(hwnd);
    if (metadata is null)
    {
        return new HelperResponse(false, ["Window not found."], StrategyUsed: strategy);
    }

    if (string.IsNullOrWhiteSpace(text))
    {
        return new HelperResponse(false, ["Text cannot be empty."], Window: metadata, StrategyUsed: strategy);
    }

    if (strategy == "dryRun")
    {
        return new HelperResponse(true, [], Window: metadata, StrategyUsed: strategy, Message: "dry-run only");
    }

    if (strategy is "valuePattern" or "autoUiaOnly")
    {
        var result = TrySetValue(hwnd, text);
        return new HelperResponse(result.Success, result.Errors, Window: metadata, CandidateControls: result.Candidates, StrategyUsed: strategy, Message: result.Message);
    }

    return new HelperResponse(false, [$"Unsupported delivery strategy: {strategy}"], Window: metadata, StrategyUsed: strategy);
}

static nint ReadHwnd(JsonElement payload)
{
    if (payload.TryGetProperty("hwnd", out var hwndElement))
    {
        if (hwndElement.ValueKind == JsonValueKind.String)
        {
            return HwndParser.Parse(hwndElement.GetString() ?? "");
        }

        if (hwndElement.ValueKind == JsonValueKind.Number && hwndElement.TryGetInt64(out var numericHwnd))
        {
            return new IntPtr(numericHwnd);
        }
    }

    throw new ArgumentException("payload.hwnd is required.");
}

static IReadOnlyList<WindowMetadata> ListTopLevelWindows()
{
    var windows = new List<WindowMetadata>();
    NativeMethods.EnumWindows((hwnd, _) =>
    {
        var metadata = GetWindowMetadata(hwnd);
        if (metadata is not null && metadata.Visible && !string.IsNullOrWhiteSpace(metadata.Title))
        {
            windows.Add(metadata);
        }
        return true;
    }, IntPtr.Zero);

    return windows;
}

static WindowMetadata? GetWindowMetadata(nint hwnd)
{
    if (hwnd == IntPtr.Zero)
    {
        return null;
    }

    var titleLength = NativeMethods.GetWindowTextLength(hwnd);
    var titleBuilder = new StringBuilder(titleLength + 1);
    _ = NativeMethods.GetWindowText(hwnd, titleBuilder, titleBuilder.Capacity);

    var classBuilder = new StringBuilder(256);
    _ = NativeMethods.GetClassName(hwnd, classBuilder, classBuilder.Capacity);

    _ = NativeMethods.GetWindowThreadProcessId(hwnd, out var processId);
    string? executablePath = null;
    try
    {
        executablePath = Process.GetProcessById((int)processId).MainModule?.FileName;
    }
    catch
    {
        executablePath = null;
    }

    return new WindowMetadata(
        HwndParser.Format(hwnd),
        (int)processId,
        titleBuilder.ToString(),
        executablePath,
        classBuilder.ToString(),
        NativeMethods.IsWindowVisible(hwnd));
}

static IReadOnlyList<CandidateControl> FindEditableControls(nint hwnd)
{
    var candidates = new List<CandidateControl>();
    var root = AutomationElement.FromHandle(hwnd);
    if (root is null)
    {
        return candidates;
    }

    var all = root.FindAll(TreeScope.Descendants, Condition.TrueCondition);
    foreach (AutomationElement element in all)
    {
        if (candidates.Count >= 50)
        {
            break;
        }

        var candidate = ToCandidate(element);
        if (candidate is not null)
        {
            candidates.Add(candidate);
        }
    }

    return candidates;
}

static (bool Success, string[] Errors, CandidateControl[] Candidates, string? Message) TrySetValue(nint hwnd, string text)
{
    var candidates = FindEditableControls(hwnd).ToArray();
    var root = AutomationElement.FromHandle(hwnd);
    if (root is null)
    {
        return (false, ["Window automation element not found."], candidates, null);
    }

    foreach (AutomationElement element in root.FindAll(TreeScope.Descendants, Condition.TrueCondition))
    {
        if (!IsEditableCandidate(element))
        {
            continue;
        }

        if (element.TryGetCurrentPattern(ValuePattern.Pattern, out var pattern) && pattern is ValuePattern valuePattern)
        {
            if (valuePattern.Current.IsReadOnly)
            {
                continue;
            }

            element.SetFocus();
            valuePattern.SetValue(text);
            return (true, [], candidates, "Delivered using UIA ValuePattern.SetValue.");
        }
    }

    return (false, ["No writable ValuePattern candidate was found."], candidates, null);
}

static CandidateControl? ToCandidate(AutomationElement element)
{
    if (!IsEditableCandidate(element))
    {
        return null;
    }

    var patterns = new List<string>();
    if (element.TryGetCurrentPattern(ValuePattern.Pattern, out _))
    {
        patterns.Add("ValuePattern");
    }
    if (element.TryGetCurrentPattern(TextPattern.Pattern, out _))
    {
        patterns.Add("TextPattern");
    }

    return new CandidateControl(
        element.Current.AutomationId,
        element.Current.Name,
        element.Current.ControlType.ProgrammaticName,
        element.Current.IsEnabled,
        element.Current.IsKeyboardFocusable,
        patterns);
}

static bool IsEditableCandidate(AutomationElement element)
{
    var controlType = element.Current.ControlType;
    if (controlType == ControlType.Edit || controlType == ControlType.Document)
    {
        return true;
    }

    return element.TryGetCurrentPattern(ValuePattern.Pattern, out _);
}

internal sealed record HelperResponse(
    bool Success,
    string[] Errors,
    IReadOnlyList<WindowMetadata>? Windows = null,
    WindowMetadata? Window = null,
    IReadOnlyList<CandidateControl>? CandidateControls = null,
    string? StrategyUsed = null,
    string? Message = null,
    string? Error = null);

internal sealed record WindowMetadata(
    string Hwnd,
    int ProcessId,
    string Title,
    string? ExecutablePath,
    string ClassName,
    bool Visible);

internal sealed record CandidateControl(
    string AutomationId,
    string Name,
    string ControlType,
    bool IsEnabled,
    bool IsKeyboardFocusable,
    IReadOnlyList<string> SupportedPatterns);

internal static partial class NativeMethods
{
    internal delegate bool EnumWindowsProc(nint hwnd, nint lParam);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, nint lParam);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool IsWindowVisible(nint hwnd);

    [DllImport("user32.dll", EntryPoint = "GetWindowTextLengthW", CharSet = CharSet.Unicode, SetLastError = true)]
    internal static extern int GetWindowTextLength(nint hwnd);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    internal static extern int GetWindowText(nint hwnd, StringBuilder text, int maxCount);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    internal static extern int GetClassName(nint hwnd, StringBuilder className, int maxCount);

    [DllImport("user32.dll")]
    internal static extern uint GetWindowThreadProcessId(nint hwnd, out uint processId);

    [DllImport("user32.dll")]
    internal static extern nint GetForegroundWindow();
}
