chrome.action.onClicked.addListener(async (tab) => {
  // Ignoramos URLs (chrome://, file://, etc.)
  if (!tab.url.includes("http")) return;

  try {
    const response = await chrome.tabs.sendMessage(tab.id, {
      action: "toggle",
    });
    actualizarIcono(response.status, tab.id);
  } catch (error) {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["wanakana.js", "vocabulario.js", "content.js"],
    });

    chrome.tabs.sendMessage(tab.id, { action: "init" });
    actualizarIcono(true, tab.id);
  }
});

function actualizarIcono(encendido, tabId) {
  if (encendido) {
    chrome.action.setBadgeText({ text: "ON", tabId: tabId });
    chrome.action.setBadgeBackgroundColor({ color: "#4CAF50" });
  } else {
    chrome.action.setBadgeText({ text: "", tabId: tabId });
  }
}
