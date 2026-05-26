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
        "listChatGptWindows" => new HelperResponse(true, [], Windows: ListTopLevelWindows().Where(IsChatGptDesktopWindow).ToArray()),
        "inspectChatGptWindow" => InspectChatGptWindow(payload),
        "captureChatGptSelectedText" => CaptureChatGptSelectedText(payload),
        "captureChatGptVisibleMessages" => CaptureChatGptVisibleMessages(payload),
        "getChatGptActiveConversationCandidate" => GetChatGptActiveConversationCandidate(),
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

    if (strategy == "clipboardPasteApproved")
    {
        return new HelperResponse(false, ["Clipboard fallback is intentionally separate and is implemented in a later delivery-hardening wave."], Window: metadata, StrategyUsed: strategy);
    }

    return new HelperResponse(false, [$"Unsupported delivery strategy: {strategy}"], Window: metadata, StrategyUsed: strategy);
}

static HelperResponse InspectChatGptWindow(JsonElement payload)
{
    var hwnd = ReadHwnd(payload);
    var metadata = GetWindowMetadata(hwnd);
    if (metadata is null)
    {
        return new HelperResponse(false, ["Window not found."]);
    }

    var report = BuildChatGptProbeReport(metadata);
    return new HelperResponse(report.SupportsWindowDetection, report.Errors, Window: metadata, ChatGptProbe: report);
}

static HelperResponse CaptureChatGptSelectedText(JsonElement payload)
{
    var hwnd = ReadHwnd(payload);
    var metadata = GetWindowMetadata(hwnd);
    if (metadata is null)
    {
        return new HelperResponse(false, ["Window not found."]);
    }
    if (!IsChatGptDesktopWindow(metadata))
    {
        return new HelperResponse(false, ["The selected window does not look like ChatGPT Desktop."], Window: metadata);
    }

    var selectedText = TryGetSelectedText(hwnd);
    if (string.IsNullOrWhiteSpace(selectedText))
    {
        return new HelperResponse(false, ["No selected text is exposed through Windows UI Automation for this ChatGPT window."], Window: metadata);
    }

    return new HelperResponse(true, [], Window: metadata, CapturedText: selectedText);
}

static HelperResponse CaptureChatGptVisibleMessages(JsonElement payload)
{
    var hwnd = ReadHwnd(payload);
    var metadata = GetWindowMetadata(hwnd);
    if (metadata is null)
    {
        return new HelperResponse(false, ["Window not found."]);
    }
    if (!IsChatGptDesktopWindow(metadata))
    {
        return new HelperResponse(false, ["The selected window does not look like ChatGPT Desktop."], Window: metadata);
    }

    var messages = CaptureVisibleText(hwnd)
        .Select((text, index) => new ChatGptVisibleMessage(index, text, null, null, null))
        .ToArray();

    if (messages.Length == 0)
    {
        return new HelperResponse(false, ["No visible ChatGPT message text is exposed through Windows UI Automation."], Window: metadata, VisibleMessages: messages);
    }

    return new HelperResponse(true, [], Window: metadata, VisibleMessages: messages);
}

static HelperResponse GetChatGptActiveConversationCandidate()
{
    var foreground = GetWindowMetadata(NativeMethods.GetForegroundWindow());
    var metadata = foreground is not null && IsChatGptDesktopWindow(foreground)
        ? foreground
        : ListTopLevelWindows().FirstOrDefault(IsChatGptDesktopWindow);

    if (metadata is null)
    {
        return new HelperResponse(false, ["No ChatGPT Desktop window was found."]);
    }

    var report = BuildChatGptProbeReportForHwnd(HwndParser.Parse(metadata.Hwnd), metadata);
    return new HelperResponse(report.SupportsWindowDetection, report.Errors, Window: metadata, ChatGptProbe: report);
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

static bool IsChatGptDesktopWindow(WindowMetadata metadata)
{
    var executable = metadata.ExecutablePath?.ToLowerInvariant() ?? "";
    if (executable.Contains("chrome.exe") || executable.Contains("msedge.exe") || executable.Contains("firefox.exe"))
    {
        return false;
    }

    var haystack = $"{metadata.Title} {metadata.ExecutablePath} {metadata.ClassName}".ToLowerInvariant();
    return haystack.Contains("chatgpt");
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

static ChatGptProbeReport BuildChatGptProbeReport(WindowMetadata metadata)
{
    return BuildChatGptProbeReportForHwnd(HwndParser.Parse(metadata.Hwnd), metadata);
}

static ChatGptProbeReport BuildChatGptProbeReportForHwnd(nint hwnd, WindowMetadata metadata)
{
    var errors = new List<string>();
    var isChatGpt = IsChatGptDesktopWindow(metadata);
    if (!isChatGpt)
    {
        errors.Add("The selected window does not look like ChatGPT Desktop.");
    }

    var hasTextPattern = false;
    var rawExcerpt = new List<string>();
    var visibleText = Array.Empty<string>();
    try
    {
        var root = AutomationElement.FromHandle(hwnd);
        if (root is null)
        {
            errors.Add("Window automation element not found.");
        }
        else
        {
            hasTextPattern = HasTextPattern(root);
            rawExcerpt.AddRange(BuildRawUiaExcerpt(root));
            visibleText = CaptureVisibleTextFromRoot(root).ToArray();
        }
    }
    catch (Exception ex)
    {
        errors.Add($"UI Automation probe failed: {ex.Message}");
    }

    var supportsLatestMessage = visibleText.Length > 0;
    var supportsSelectedText = hasTextPattern;
    var confidence = !isChatGpt
        ? "low"
        : supportsSelectedText && supportsLatestMessage
            ? "medium"
            : "low";

    return new ChatGptProbeReport(
        SupportsWindowDetection: isChatGpt,
        SupportsSessionList: false,
        SupportsSelectedText: supportsSelectedText,
        SupportsLatestMessage: supportsLatestMessage,
        Confidence: confidence,
        ActiveConversationTitle: metadata.Title,
        RawUiaExcerpt: rawExcerpt.Take(40).ToArray(),
        Errors: errors.ToArray());
}

static bool HasTextPattern(AutomationElement root)
{
    if (root.TryGetCurrentPattern(TextPattern.Pattern, out _))
    {
        return true;
    }

    foreach (AutomationElement element in root.FindAll(TreeScope.Descendants, Condition.TrueCondition))
    {
        if (element.TryGetCurrentPattern(TextPattern.Pattern, out _))
        {
            return true;
        }
    }

    return false;
}

static string? TryGetSelectedText(nint hwnd)
{
    var root = AutomationElement.FromHandle(hwnd);
    if (root is null)
    {
        return null;
    }

    foreach (var element in EnumerateWithRoot(root))
    {
        try
        {
            if (!element.TryGetCurrentPattern(TextPattern.Pattern, out var pattern) || pattern is not TextPattern textPattern)
            {
                continue;
            }

            foreach (var range in textPattern.GetSelection())
            {
                var text = range.GetText(8000)?.Trim();
                if (!string.IsNullOrWhiteSpace(text))
                {
                    return text;
                }
            }
        }
        catch
        {
            continue;
        }
    }

    return null;
}

static IReadOnlyList<string> CaptureVisibleText(nint hwnd)
{
    var root = AutomationElement.FromHandle(hwnd);
    return root is null ? [] : CaptureVisibleTextFromRoot(root);
}

static IReadOnlyList<string> CaptureVisibleTextFromRoot(AutomationElement root)
{
    var values = new List<string>();
    foreach (var element in EnumerateWithRoot(root))
    {
        if (values.Count >= 80)
        {
            break;
        }

        var text = TryGetElementText(element);
        if (!string.IsNullOrWhiteSpace(text) && text.Length > 2 && !values.Contains(text))
        {
            values.Add(text);
        }
    }

    return values;
}

static IReadOnlyList<string> BuildRawUiaExcerpt(AutomationElement root)
{
    var values = new List<string>();
    foreach (var element in EnumerateWithRoot(root))
    {
        if (values.Count >= 60)
        {
            break;
        }

        try
        {
            var name = element.Current.Name;
            var controlType = element.Current.ControlType.ProgrammaticName;
            var automationId = element.Current.AutomationId;
            if (!string.IsNullOrWhiteSpace(name) || !string.IsNullOrWhiteSpace(automationId))
            {
                values.Add($"{controlType} | {automationId} | {name}".Trim());
            }
        }
        catch
        {
            continue;
        }
    }

    return values;
}

static IEnumerable<AutomationElement> EnumerateWithRoot(AutomationElement root)
{
    yield return root;
    foreach (AutomationElement element in root.FindAll(TreeScope.Descendants, Condition.TrueCondition))
    {
        yield return element;
    }
}

static string? TryGetElementText(AutomationElement element)
{
    try
    {
        if (element.TryGetCurrentPattern(TextPattern.Pattern, out var pattern) && pattern is TextPattern textPattern)
        {
            var text = textPattern.DocumentRange.GetText(4000)?.Trim();
            if (!string.IsNullOrWhiteSpace(text))
            {
                return CollapseWhitespace(text);
            }
        }

        var controlType = element.Current.ControlType;
        if (controlType == ControlType.Text || controlType == ControlType.Document || controlType == ControlType.Edit)
        {
            var name = element.Current.Name?.Trim();
            if (!string.IsNullOrWhiteSpace(name))
            {
                return CollapseWhitespace(name);
            }
        }
    }
    catch
    {
        return null;
    }

    return null;
}

static string CollapseWhitespace(string value)
{
    return string.Join(" ", value.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
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
    string? Error = null,
    ChatGptProbeReport? ChatGptProbe = null,
    string? CapturedText = null,
    IReadOnlyList<ChatGptVisibleMessage>? VisibleMessages = null);

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

internal sealed record ChatGptProbeReport(
    bool SupportsWindowDetection,
    bool SupportsSessionList,
    bool SupportsSelectedText,
    bool SupportsLatestMessage,
    string Confidence,
    string? ActiveConversationTitle,
    IReadOnlyList<string> RawUiaExcerpt,
    string[] Errors);

internal sealed record ChatGptVisibleMessage(
    int Index,
    string Text,
    string? ControlType,
    string? AutomationId,
    string? Name);

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
