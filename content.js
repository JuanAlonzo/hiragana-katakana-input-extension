if (typeof window.wanakanaExtensionInyectado === "undefined") {
  window.wanakanaExtensionInyectado = true;

  // Variables globales
  let wanakanaActivo = false;
  let observador = null;
  let diccionarioUnificado = {
    sustantivos: {},
    raicesVerbos: {},
  };
  let sugerenciaBox = null;

  // Gestion de datos del diccionario unificado
  function actualizarDiccionarioUnificado() {
    const local = window.diccionarioPersonal || {
      sustantivos: {},
      raicesVerbos: {},
    };
    chrome.storage.sync.get(["diccionarioCloud"], (result) => {
      const nube = result.diccionarioCloud || {
        sustantivos: {},
        raicesVerbos: {},
      };
      diccionarioUnificado = {
        sustantivos: { ...local.sustantivos, ...nube.sustantivos },
        raicesVerbos: { ...local.raicesVerbos, ...nube.raicesVerbos },
      };
      console.log("☁️ Diccionario actualizado:", diccionarioUnificado);
    });
  }

  // Extraemos esto para usarlo tanto al escribir como al dar espacio
  function buscarCandidato(texto, cursor) {
    const sustantivos = diccionarioUnificado.sustantivos || {};
    const raicesVerbos = diccionarioUnificado.raicesVerbos || {};
    // Aislando la palabra actual
    const textoHastaCursor = texto.slice(0, cursor);
    const ultimoEspacio = textoHastaCursor.lastIndexOf(" ");
    const palabraOriginal = textoHastaCursor.slice(ultimoEspacio + 1);

    if (!palabraOriginal) return null;

    // Buscar match
    let palabraConvertida = null;
    let matchTipo = null;

    // Nivel 1: Exacto
    if (sustantivos[palabraOriginal]) {
      palabraConvertida = sustantivos[palabraOriginal];
      matchTipo = "exacto";
    }
    // Nivel 2: Raíz
    else {
      const clavesRaices = Object.keys(raicesVerbos).sort(
        (a, b) => b.length - a.length
      );
      for (const raiz of clavesRaices) {
        if (palabraOriginal.startsWith(raiz)) {
          const kanji = raicesVerbos[raiz];
          const resto = palabraOriginal.slice(raiz.length);
          palabraConvertida = kanji + resto; // Kanji + Okurigana
          matchTipo = "raiz";
          break;
        }
      }
    }

    if (palabraConvertida) {
      return {
        original: palabraOriginal,
        convertida: palabraConvertida,
        inicio: ultimoEspacio + 1,
        fin: cursor,
        tipo: matchTipo,
      };
    }
    return null;
  }

  // Interfaz visual fantasma
  function crearSugerenciaBox() {
    if (document.getElementById("wanakana-suggestion-box")) return;

    sugerenciaBox = document.createElement("div");
    sugerenciaBox.id = "wanakana-suggestion-box";

    // Estilos "Google IME" flotante
    Object.assign(sugerenciaBox.style, {
      position: "absolute",
      display: "none",
      background: "rgba(255, 255, 255, 0.95)",
      border: "1px solid #ff69b4",
      borderLeft: "4px solid #ff69b4",
      padding: "4px 8px",
      borderRadius: "4px",
      boxShadow: "0 4px 10px rgba(0,0,0,0.1)",
      fontSize: "14px",
      fontFamily: "sans-serif",
      color: "#333",
      zIndex: "999999",
      pointerEvents: "none", // Para no bloquear clics
      whiteSpace: "nowrap",
    });

    document.body.appendChild(sugerenciaBox);
  }

  function mostrarSugerencia(input, candidato) {
    if (!sugerenciaBox) crearSugerenciaBox();

    sugerenciaBox.innerHTML = `
      <span style="color:#888; font-size:0.9em">${candidato.original}</span>
      <span style="margin:0 4px; color:#ff69b4">»</span>
      <strong style="font-size:1.1em">${candidato.convertida}</strong>
      <span style="font-size:0.7em; color:#ccc; margin-left:4px">[Space]</span>
    `;

    const rect = input.getBoundingClientRect();
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;

    // Posicionar debajo del input, ajustando si es necesario
    sugerenciaBox.style.left = `${rect.left + scrollX}px`;
    sugerenciaBox.style.top = `${rect.bottom + scrollY + 5}px`;
    sugerenciaBox.style.display = "block";
  }

  function ocultarSugerencia() {
    if (sugerenciaBox) sugerenciaBox.style.display = "none";
  }

  // EVENT HANDLERS

  function manejarInput(e, input) {
    const match = buscarCandidato(input.value, input.selectionStart);
    if (match) {
      mostrarSugerencia(input, match);
    } else {
      ocultarSugerencia();
    }
  }

  function manejarKeydown(e, input) {
    // Al presionar espacio
    if (e.code === "Space") {
      const match = buscarCandidato(input.value, input.selectionStart);
      if (match) {
        e.preventDefault();
        const texto = input.value;
        const nuevoTexto =
          texto.slice(0, match.inicio) +
          match.convertida +
          texto.slice(match.fin);
        input.value = nuevoTexto;

        // Ajustar cursor
        const nuevaPosicion = match.inicio + match.convertida.length;
        input.setSelectionRange(nuevaPosicion, nuevaPosicion);
        ocultarSugerencia();
      }
    } else if (e.code === "Escape" || e.key === "Enter") {
      ocultarSugerencia();
    }
  }

  // CORE
  function bindInput(input) {
    if (input.dataset.wanakanaBound) return;
    if (["password", "email", "hidden"].includes(input.type)) return;

    try {
      wanakana.bind(input, { IMEMode: true });
      input.dataset.wanakanaBound = "true";
      input.classList.add("wanakana-active");
      // Para detectar match al escribir
      input.addEventListener("input", (e) => manejarInput(e, input));
      // Para manejar espacio y selección
      input.addEventListener("keydown", (e) => manejarKeydown(e, input));
      // Limpieza al perder foco
      input.addEventListener("blur", ocultarSugerencia);
    } catch (e) {
      console.log("Error binding:", e);
    }
  }

  function aplicarWanakanaDeTodos() {
    const inputs = document.querySelectorAll(
      "input[type='text'], input[type='search'],  textarea"
    );
    inputs.forEach(bindInput);
  }

  function removerWanakanaDeTodos() {
    const inputs = document.querySelectorAll(
      'input[type="text"], input[type="search"], textarea'
    );
    inputs.forEach((input) => {
      if (input.dataset.wanakanaBound) {
        wanakana.unbind(input);
        delete input.dataset.wanakanaBound;
        input.classList.remove("wanakana-active");
      }
    });
  }

  function inyectarEstilos() {
    const estilo = document.createElement("style");
    estilo.id = "wanakana-style";
    estilo.innerHTML = `
        .wanakana-active {
            box-shadow: 0 4px 2px -2px rgba(255, 105, 180, 0.3) !important;
            border-bottom: 3px solid #ff69b4 !important;
            background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><text x="50%" y="60%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="16" fill="%23ff69b4">あ</text></svg>') !important;
            background-repeat: no-repeat !important;
            background-position: right 10px center !important;
            background-size: 24px !important;
            transition: all 0.3s ease;
        }
    `;
    document.head.appendChild(estilo);
  }

  function iniciarVigilante() {
    if (observador) return;
    observador = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) {
            if (node.nodeName === "INPUT" || node.nodeName === "TEXTAREA") {
              bindInput(node);
            } else {
              const inputsInternos = node.querySelectorAll(
                'input[type="text"], input[type="search"], textarea'
              );
              inputsInternos.forEach(bindInput);
            }
          }
        });
      });
    });
    observador.observe(document.body, { childList: true, subtree: true });
  }

  function detenerVigilante() {
    if (observador) {
      observador.disconnect();
      observador = null;
    }
  }

  chrome.runtime.onMessage.addListener((req, s, resp) => {
    if (req.action === "toggle") {
      wanakanaActivo = !wanakanaActivo;
      gestionarEstado();
    } else if (req.action === "init") {
      wanakanaActivo = true;
      gestionarEstado();
    }
    resp({ status: wanakanaActivo });
  });

  function gestionarEstado() {
    if (wanakanaActivo) {
      console.log("🇯🇵 ON");
      aplicarWanakanaDeTodos();
      iniciarVigilante();
      mostrarToast("Wanakana Activado 🇯🇵");
    } else {
      console.log("🇯🇵 OFF");
      removerWanakanaDeTodos();
      detenerVigilante();
      mostrarToast("Wanakana Desactivado 🇯🇵");
    }
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes.diccionarioCloud)
      actualizarDiccionarioUnificado();
  });

  actualizarDiccionarioUnificado();
  if (!document.getElementById("wanakana-style")) {
    inyectarEstilos();
  }
  crearSugerenciaBox();

  // Funcion visual inicial
  function mostrarToast(mensaje) {
    const existingToast = document.getElementById("wanakana-toast");
    if (existingToast) existingToast.remove();

    const toast = document.createElement("div");
    toast.id = "wanakana-toast";
    toast.innerText = mensaje;
    Object.assign(toast.style, {
      position: "fixed",
      top: "20px",
      right: "20px",
      padding: "10px 20px",
      backgroundColor: "#333",
      color: "#fff",
      borderRadius: "8px",
      zIndex: "1000000",
      boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
      fontFamily: "sans-serif",
      fontSize: "14px",
      opacity: "0",
      transition: "opacity 0.3s ease",
      pointerEvents: "none",
    });

    document.body.appendChild(toast);

    // Animation de entrada
    requestAnimationFrame(() => {
      toast.style.opacity = "1";
    });

    // Desaparecer despues de 2 segundos
    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }
} else {
  console.log("🇯🇵 Script ya cargado.");
}
