chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "agentbridge.captureSelection") {
    return false;
  }

  sendResponse({
    ok: true,
    text: window.getSelection()?.toString() ?? ""
  });
  return true;
});
