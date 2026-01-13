document.addEventListener("DOMContentLoaded", cargarPalabras);
document.getElementById("btnGuardar").addEventListener("click", guardarPalabra);

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
