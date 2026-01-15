async function toggleExtension(tab) {
  if (!tab.url || !tab.url.includes("http")) return;
  try {
    const response = await chrome.tabs.sendMessage(tab.id, {
      action: "toggle",
    });
    actualizarIcono(response.status, tab.id);
  } catch (error) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["wanakana.js", "vocabulario.js", "content.js"],
      });

      chrome.tabs.sendMessage(tab.id, { action: "init" });
      actualizarIcono(true, tab.id);
    } catch (e) {
      console.log("No se pudo inyectar en esta pestaña...");
    }
  }
}

function actualizarIcono(encendido, tabId) {
  if (encendido) {
    chrome.action.setBadgeText({ text: "ON", tabId: tabId });
    chrome.action.setBadgeBackgroundColor({ color: "#4CAF50" });
  } else {
    chrome.action.setBadgeText({ text: "", tabId: tabId });
  }
}

// Clic en el icono de la extensión
chrome.action.onClicked.addListener(toggleExtension);

// Atajo de teclado para activar/desactivar la extensión
chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-wanakana") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) toggleExtension(tabs[0]);
    });
  }
});

// Menú contextual
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "agregar-diccionario",
    title: "Agregar '%s' a WanaInput Diccionario",
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "agregar-diccionario") {
    const palabraSeleccionada = encodeURIComponent(info.selectionText);
    const targetUrl = chrome.runtime.getURL(
      `options.html?kanji=${palabraSeleccionada}`
    );
    const baseUrl = chrome.runtime.getURL("options.html");

    chrome.tabs.query({}, (tabs) => {
      const existingTab = tabs.find((t) => t.url && t.url.startsWith(baseUrl));
      if (existingTab) {
        chrome.tabs.update(existingTab.id, { active: true, url: targetUrl });
        chrome.windows.update(existingTab.windowId, { focused: true });
      } else {
        chrome.tabs.create({ url: targetUrl });
      }
    });
  }
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.tabs.create({ url: "options.html?onboarding=true" });
  }
});
