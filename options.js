document.addEventListener("DOMContentLoaded", () => {
  cargarPalabras();
  chequearParamsURL();
});

document.getElementById("btnGuardar").addEventListener("click", guardarPalabra);
document.getElementById("btnExportar").addEventListener("click", exportarJSON);
document
  .getElementById("btnImportar")
  .addEventListener("click", () =>
    document.getElementById("fileInput").click()
  );
document.getElementById("fileInput").addEventListener("change", importarJSON);

function chequearParamsURL() {
  const params = new URLSearchParams(window.location.search);
  const kanji = params.get("kanji");
  if (kanji) {
    document.getElementById("inputValor").value = kanji;
    document.getElementById("inputClave").focus();
    // Limpieza
    window.history.replaceState({}, document.title, "options.html");
  }
}

// Exportar e Importar JSON
function exportarJSON() {
  chrome.storage.sync.get(["diccionarioCloud"], (result) => {
    const dataStr =
      "data:text/json;charset=utf-8," +
      encodeURIComponent(JSON.stringify(result.diccionarioCloud));
    const downloadAnchorNode = document.createElement("a");
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute(
      "download",
      "wanakana_backup_" + new Date().toISOString().slice(0, 10) + ".json"
    );
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  });
}

function importarJSON(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const contenido = JSON.parse(e.target.result);
      if (!contenido.sustantivos || !contenido.raicesVerbos)
        throw new Error("Formato inválido");

      if (
        confirm(
          "¿Quieres fusionar este backup con tu diccionario actual? (Las palabras repetidas se actualizarán)"
        )
      ) {
        chrome.storage.sync.get(["diccionarioCloud"], (result) => {
          const actual = result.diccionarioCloud || {
            sustantivos: {},
            raicesVerbos: {},
          };

          // Fusión (Merge)
          const nuevoDic = {
            sustantivos: { ...actual.sustantivos, ...contenido.sustantivos },
            raicesVerbos: { ...actual.raicesVerbos, ...contenido.raicesVerbos },
          };

          chrome.storage.sync.set({ diccionarioCloud: nuevoDic }, () => {
            alert("¡Importación exitosa!");
            cargarPalabras();
          });
        });
      }
    } catch (error) {
      alert("Error al leer el archivo JSON: " + error.message);
    }
  };
  reader.readAsText(file);
}

function cargarPalabras() {
  chrome.storage.sync.get(["diccionarioCloud"], (result) => {
    const dic = result.diccionarioCloud || {
      sustantivos: {},
      raicesVerbos: {},
    };
    if (!dic.sustantivos) dic.sustantivos = {};
    if (!dic.raicesVerbos) dic.raicesVerbos = {};

    renderizarLista(dic);
  });
}

function guardarPalabra() {
  const clave = document.getElementById("inputClave").value.trim();
  const valor = document.getElementById("inputValor").value.trim();
  const tipo = document.getElementById("tipoEntrada").value;

  if (!clave || !valor) return alert("Por favor, completa ambos campos.");

  chrome.storage.sync.get(["diccionarioCloud"], (result) => {
    const dic = result.diccionarioCloud || {
      sustantivos: {},
      raicesVerbos: {},
    };

    // BLINDAJE
    if (!dic[tipo]) dic[tipo] = {};

    dic[tipo][clave] = valor;

    chrome.storage.sync.set({ diccionarioCloud: dic }, () => {
      document.getElementById("inputClave").value = "";
      document.getElementById("inputValor").value = "";
      renderizarLista(dic);
      console.log("Guardado:", clave, "->", valor);
    });
  });
}

function borrarPalabra(tipo, clave) {
  chrome.storage.sync.get(["diccionarioCloud"], (result) => {
    const dic = result.diccionarioCloud;
    if (dic && dic[tipo]) {
      delete dic[tipo][clave];
      chrome.storage.sync.set({ diccionarioCloud: dic }, () =>
        renderizarLista(dic)
      );
    }
  });
}

function renderizarLista(dic) {
  const contenedor = document.getElementById("listaPalabras");
  contenedor.innerHTML = "";

  const sustantivos = dic.sustantivos || {};
  const raices = dic.raicesVerbos || {};

  // Renderizar sustantivos
  for (const [key, value] of Object.entries(sustantivos)) {
    crearElementoLista(key, value, "sustantivos", contenedor);
  }
  // Renderizar raíces verbales
  for (const [key, value] of Object.entries(raices)) {
    crearElementoLista(key, value, "raicesVerbos", contenedor);
  }
}

function crearElementoLista(key, value, tipo, contenedor) {
  const div = document.createElement("div");
  div.className = "word-item";
  div.innerHTML = `
    <span style="font-size: 14px;">
        <strong style="color: #e91e63;">${key}</strong> 
        <span style="color: #666;">➡</span> 
        <strong>${value}</strong> 
        <small style="color: #999; margin-left: 5px;">(${
          tipo === "sustantivos" ? "Exacto" : "Raíz"
        })</small>
    </span>
    <button class="delete-btn" style="margin-left: 10px;">X</button>
  `;
  const btn = div.querySelector(".delete-btn");
  btn.onclick = () => borrarPalabra(tipo, key);

  contenedor.appendChild(div);
}
