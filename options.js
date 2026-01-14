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
document
  .getElementById("inputBuscador")
  .addEventListener("input", () => setTimeout(filtrarLista, 0));

const inputClave = document.getElementById("inputClave");
wanakana.bind(inputClave, { IMEMode: true });

const inputBuscador = document.getElementById("inputBuscador");
wanakana.bind(inputBuscador, { IMEMode: true });

let cacheDiccionarioVisual = null;

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
    const a = document.createElement("a");
    a.href = dataStr;
    a.download =
      "wanakana_backup_" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
  });
}

function importarJSON(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const contenido = JSON.parse(e.target.result);
      if (!contenido.sustantivos && !contenido.raicesVerbos)
        throw new Error("JSON inválido");
      if (confirm("¿Fusionar backup?")) {
        chrome.storage.sync.get(["diccionarioCloud"], (result) => {
          const actual = result.diccionarioCloud || {
            sustantivos: {},
            raicesVerbos: {},
          };
          const nuevo = {
            sustantivos: { ...actual.sustantivos, ...contenido.sustantivos },
            raicesVerbos: { ...actual.raicesVerbos, ...contenido.raicesVerbos },
          };
          chrome.storage.sync.set({ diccionarioCloud: nuevo }, () => {
            alert("Importado con éxito");
            cargarPalabras();
          });
        });
      }
    } catch (error) {
      alert("Error: " + error.message);
    }
  };
  reader.readAsText(file);
}

function cargarPalabras() {
  // Obtener Local
  const local = window.diccionarioPersonal || {
    sustantivos: {},
    raicesVerbos: {},
  };

  // Obtener Cloud
  chrome.storage.sync.get(["diccionarioCloud"], (result) => {
    const cloud = result.diccionarioCloud || {
      sustantivos: {},
      raicesVerbos: {},
    };

    // Preparar datos para renderizar
    cacheDiccionarioVisual = [];

    // Procesar Locales
    procesarEntradas(local.sustantivos, "sustantivos", "local");
    procesarEntradas(local.raicesVerbos, "raicesVerbos", "local");

    // Procesar Cloud
    procesarEntradas(cloud.sustantivos, "sustantivos", "cloud");
    procesarEntradas(cloud.raicesVerbos, "raicesVerbos", "cloud");

    // Renderizar
    renderizarLista(cacheDiccionarioVisual);
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
      cargarPalabras();
    });
  });
}

function borrarPalabra(tipo, clave) {
  if (!confirm(`¿Seguro que quieres borrar la palabra "${clave}"?`)) return;
  chrome.storage.sync.get(["diccionarioCloud"], (result) => {
    const dic = result.diccionarioCloud;
    if (dic && dic[tipo]) {
      delete dic[tipo][clave];
      chrome.storage.sync.set({ diccionarioCloud: dic }, () =>
        cargarPalabras()
      );
    }
  });
}

function procesarEntradas(objeto, tipo, fuente) {
  if (!objeto) return;
  for (const [clave, valor] of Object.entries(objeto)) {
    cacheDiccionarioVisual.push({
      clave,
      valor,
      tipo, // sustantivos o raicesVerbos
      fuente, // local o cloud
    });
  }
}

function renderizarLista(items) {
  const contenedor = document.getElementById("listaPalabras");
  contenedor.innerHTML = "";

  // Ordenar: Primero Cloud (lo nuevo), luego Local
  // Y alfabéticamente dentro de cada grupo
  items.sort((a, b) => {
    if (a.fuente !== b.fuente) return a.fuente === "cloud" ? -1 : 1;
    return a.clave.localeCompare(b.clave);
  });

  if (items.length === 0) {
    contenedor.innerHTML = `<div style="text-align:center; color:#999; padding:20px;">No se encontraron palabras</div>`;
    return;
  }

  items.forEach((item) => {
    const div = document.createElement("div");
    div.className = "word-item";

    const esLocal = item.fuente === "local";
    const etiquetaFuente = esLocal
      ? `<span class="tag tag-local">🔒 Local</span>`
      : `<span class="tag tag-cloud">☁️ Cloud</span>`;

    const etiquetaTipo = item.tipo === "sustantivos" ? "Exacto" : "Raíz";

    div.innerHTML = `
      <div class="word-content">
        <div class="word-main">
           <strong style="color: #e91e63;">${item.clave}</strong> 
           <span style="color: #ccc; margin:0 5px;">➔</span> 
           <strong>${item.valor}</strong>
        </div>
        <div class="word-meta">
           ${etiquetaFuente}
           <span>• ${etiquetaTipo}</span>
        </div>
      </div>
      <button class="delete-btn" title="${
        esLocal ? "No se puede borrar el diccionario base" : "Borrar"
      }">
        ${esLocal ? "🔒" : "✕"}
      </button>
    `;

    const btn = div.querySelector(".delete-btn");
    if (esLocal) {
      btn.disabled = true; // Desactivar botón para locales
    } else {
      btn.onclick = () => borrarPalabra(item.tipo, item.clave);
    }

    contenedor.appendChild(div);
  });
}

// Buscador
function filtrarLista() {
  const texto = document.getElementById("inputBuscador").value.toLowerCase();
  const filtrados = cacheDiccionarioVisual.filter(
    (item) =>
      item.clave.toLowerCase().includes(texto) ||
      item.valor.toLowerCase().includes(texto)
  );
  renderizarLista(filtrados);
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
