async function toggleExtension(tab) {
  if (!tab || !tab.id) return;
  if (tab.url && !tab.url.startsWith("http") && !tab.url.startsWith("file")) return;
  try {
    const response = await chrome.tabs.sendMessage(tab.id, {
      action: "toggle",
    });
    if (response && typeof response.status === "boolean") {
      actualizarIcono(response.status, tab.id);
    }
  } catch (error) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["wanakana.js", "vocabulario.js", "content.js"],
      });

      const response = await chrome.tabs.sendMessage(tab.id, {
        action: "init",
      });
      actualizarIcono(response ? response.status : true, tab.id);
    } catch (e) {
      console.log("No se pudo inyectar en esta pestaña...");
    }
  }
}

function actualizarIcono(encendido, tabId) {
  if (encendido) {
    chrome.action.setBadgeText({ text: "ON", tabId: tabId });
    chrome.action.setBadgeBackgroundColor({ color: "#4CAF50", tabId: tabId });
  } else {
    chrome.action.setBadgeText({ text: "", tabId: tabId });
  }
}

// Clic en el icono de la extensión
chrome.action.onClicked.addListener(toggleExtension);

// Atajo de teclado global para activar/desactivar la extensión o abrir escritura libre
chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-wanakana") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0]) toggleExtension(tabs[0]);
    });
  } else if (command === "open-scratchpad") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0] && tabs[0].id) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "toggleScratchpad" }).catch(() => {});
      }
    });
  }
});

// Sincronizar badge cuando el content script cambia de estado (ej: atajo Alt+K en la página)
chrome.runtime.onMessage.addListener((req, sender) => {
  if (req.action === "estadoCambiado" && sender.tab && sender.tab.id) {
    actualizarIcono(req.status, sender.tab.id);
  }
});

// Menú contextual e instalación
chrome.runtime.onInstalled.addListener((details) => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "agregar-diccionario",
      title: "Agregar '%s' a WanaInput Diccionario",
      contexts: ["selection"],
    });
  });

  if (details.reason === "install") {
    chrome.tabs.create({
      url: chrome.runtime.getURL("options.html?onboarding=true"),
    });
  }
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === "agregar-diccionario" && info.selectionText) {
    const palabraSeleccionada = encodeURIComponent(info.selectionText.trim());
    const targetUrl = chrome.runtime.getURL(
      `options.html?kanji=${palabraSeleccionada}`
    );
    const baseUrl = chrome.runtime.getURL("options.html");

    chrome.tabs.query({ url: `${baseUrl}*` }, (tabs) => {
      const existingTab = tabs && tabs[0];
      if (existingTab) {
        chrome.tabs.update(existingTab.id, { active: true, url: targetUrl });
        chrome.windows.update(existingTab.windowId, { focused: true });
      } else {
        chrome.tabs.create({ url: targetUrl });
      }
    });
  }
});
