if (typeof window.wanakanaExtensionInyectado === "undefined") {
  window.wanakanaExtensionInyectado = true;

  // Variables globales
  let wanakanaActivo = false;
  let observador = null;
  let diccionarioUnificado = {
    sustantivos: {},
    raicesVerbos: {},
  };
  let clavesRaicesOrdenadas = [];
  let sugerenciaBox = null;
  let inputConSugerencia = null;
  let ultimoMatch = null;
  let indiceAlternativa = 0;
  let ignorarEventoSintetico = false;
  let tragarProximoEnterKeyUp = false;
  let bloquearEnvioFormularioTemporal = false;

  let configuracion = {
    conversionKey: "Enter",
    mostrarToast: true,
    mostrarBotonFlotante: true,
  };

  let scratchpadHost = null;
  let scratchpadShadow = null;
  let scratchpadOverlay = null;
  let scratchpadTextarea = null;
  let scratchpadFab = null;
  let scratchpadContador = null;
  let scratchpadSugerenciaBox = null;
  let scratchpadAbierto = false;

  const listenersPorInput = new WeakMap();

  const SELECTOR_INPUTS =
    'input:not([type]), input[type="text"], input[type="search"], input[type="url"], input[type="tel"], textarea';

  const TIPOS_INPUT_EXCLUIDOS = new Set([
    "password",
    "email",
    "hidden",
    "number",
    "date",
    "datetime-local",
    "month",
    "week",
    "time",
    "checkbox",
    "radio",
    "file",
    "submit",
    "button",
    "reset",
    "range",
    "color",
    "image",
  ]);

  // Gestion de datos del diccionario unificado (Local base + Storage Local/Sync)
  function actualizarDiccionarioUnificado() {
    const localBase = window.diccionarioPersonal || {
      sustantivos: {},
      raicesVerbos: {},
    };

    chrome.storage.local.get(["diccionarioCloud"], (resLocal) => {
      chrome.storage.sync.get(["diccionarioCloud"], (resSync) => {
        const nubeSync = (resSync && resSync.diccionarioCloud) || {
          sustantivos: {},
          raicesVerbos: {},
        };
        const nubeLocal = (resLocal && resLocal.diccionarioCloud) || {
          sustantivos: {},
          raicesVerbos: {},
        };

        diccionarioUnificado = {
          sustantivos: {
            ...localBase.sustantivos,
            ...nubeSync.sustantivos,
            ...nubeLocal.sustantivos,
          },
          raicesVerbos: {
            ...localBase.raicesVerbos,
            ...nubeSync.raicesVerbos,
            ...nubeLocal.raicesVerbos,
          },
        };

        // Precalcular raíces ordenadas de mayor a menor longitud para evitar ordenar en cada tecla
        clavesRaicesOrdenadas = Object.keys(
          diccionarioUnificado.raicesVerbos
        )
          .filter(Boolean)
          .sort((a, b) => b.length - a.length);
      });
    });
  }

  function actualizarConfiguracion() {
    chrome.storage.local.get(["configuracion"], (resLocal) => {
      chrome.storage.sync.get(["configuracion"], (resSync) => {
        const syncConfig = (resSync && resSync.configuracion) || {};
        const localConfig = (resLocal && resLocal.configuracion) || {};
        configuracion = {
          ...configuracion,
          ...localConfig,
          ...syncConfig,
        };
        actualizarVisibilidadFab();
      });
    });
  }

  function registrarEstadisticaConversion(palabraConvertida, lecturaOriginal) {
    try {
      chrome.storage.local.get(["estadisticasUso"], (res) => {
        const stats = (res && res.estadisticasUso) || {
          totalConversiones: 0,
          palabras: {},
          primeraConversion: Date.now(),
          ultimaConversion: Date.now(),
        };

        stats.totalConversiones = (stats.totalConversiones || 0) + 1;
        stats.ultimaConversion = Date.now();
        if (!stats.primeraConversion) stats.primeraConversion = Date.now();

        if (!stats.palabras) stats.palabras = {};
        const reg = stats.palabras[palabraConvertida] || {
          count: 0,
          lectura: lecturaOriginal,
        };
        reg.count = (reg.count || 0) + 1;
        reg.lectura = lecturaOriginal || reg.lectura;
        reg.ultimaVez = Date.now();

        stats.palabras[palabraConvertida] = reg;

        chrome.storage.local.set({ estadisticasUso: stats });
      });
    } catch (e) {
      // Ignorar ante contextos no disponibles
    }
  }

  // Extraemos esto para usarlo tanto al escribir como al dar espacio
  function buscarCandidato(texto, cursor) {
    if (typeof cursor !== "number" || cursor <= 0) return null;

    const sustantivos = diccionarioUnificado.sustantivos || {};
    const raicesVerbos = diccionarioUnificado.raicesVerbos || {};

    // 1. Obtener texto hasta el cursor
    const textoHastaCursor = texto.slice(0, cursor);

    // 2. DETECCIÓN: Buscamos la última racha continua de Kanas
    // Incluimos [nN]? opcional al final para soportar IMEMode cuando 'n' aún no se convirtió en 'ん' (ej: "にほn")
    const matchKana = textoHastaCursor.match(
      /[\u3040-\u309f\u30a0-\u30ff\u30fc]+[nN]?$/
    );

    if (matchKana) {
      const rachaCompleta = matchKana[0]; // Ej: "はにほん" o "はにほn"
      const inicioRacha = matchKana.index; // Dónde empieza la 'は'

      // Partículas gramaticales de 1 mora que colisionan con kanjis de 1 mora (ej: は, が, に, で, を, の, か, ね, よ, た, と, も, し, へ)
      // Si el candidato es de 1 mora y viene después de otros kanas o kanji (no es inicio ni viene tras espacio/puntuación),
      // lo ignoramos para evitar falsos positivos como "わたしは" -> "わたし歯" o "日本に" -> "日本二".
      const PARTICULAS_UNA_MORA = new Set([
        "は", "が", "に", "で", "を", "の", "か", "ね", "よ", "た", "と", "も", "し", "へ"
      ]);

      // 3. ESTRATEGIA DE SUFIJOS:
      // Probamos desde la frase más larga hasta la más corta.
      for (let i = 0; i < rachaCompleta.length; i++) {
        const candidatoRaw = rachaCompleta.slice(i);
        // Normalizamos 'n' final pendiente de IMEMode a 'ん'
        const candidato = candidatoRaw.replace(/[nN]$/, "ん");

        // Protección contra colisión gramatical de partículas de 1 mora
        if (candidato.length === 1 && PARTICULAS_UNA_MORA.has(candidato)) {
          const posAbsoluta = inicioRacha + i;
          if (posAbsoluta > 0) {
            const charAnterior = textoHastaCursor[posAbsoluta - 1];
            if (!/[\s\p{P}]/u.test(charAnterior)) {
              continue;
            }
          }
        }

        const alternativas = [];
        let matchTipo = null;

        // A. Exacto (Sustantivos) - soporte para string único o array de homófonos
        if (sustantivos[candidato]) {
          const vals = Array.isArray(sustantivos[candidato])
            ? sustantivos[candidato]
            : [sustantivos[candidato]];
          for (const v of vals) {
            if (!alternativas.includes(v)) {
              alternativas.push(v);
            }
          }
          matchTipo = "exacto";
        }

        // B. Raíz (Verbos y adjetivos conjugables)
        for (const raiz of clavesRaicesOrdenadas) {
          if (raiz && candidato.startsWith(raiz)) {
            const kanji = raicesVerbos[raiz];
            const resto = candidato.slice(raiz.length);
            const convertidaRaiz = kanji + resto;
            if (!alternativas.includes(convertidaRaiz)) {
              alternativas.push(convertidaRaiz);
            }
            if (!matchTipo) matchTipo = "raiz";
            break;
          }
        }

        // Si encontramos algo, RETORNAMOS INMEDIATAMENTE
        // Esto asegura que "Yamaguchi" gane a "Yama" (porque probamos el largo primero)
        if (alternativas.length > 0) {
          return {
            original: candidato,
            convertida: alternativas[0],
            alternativas,
            inicio: inicioRacha + i,
            fin: cursor,
            tipo: matchTipo,
          };
        }
      }
    } else {
      // Fallback: Si no hay kana (ej: números romaji o inglés), usamos la lógica de espacios
      const ultimoEspacio = textoHastaCursor.lastIndexOf(" ");
      const palabraOriginal = textoHastaCursor.slice(ultimoEspacio + 1);

      if (palabraOriginal && sustantivos[palabraOriginal]) {
        const vals = Array.isArray(sustantivos[palabraOriginal])
          ? sustantivos[palabraOriginal]
          : [sustantivos[palabraOriginal]];
        return {
          original: palabraOriginal,
          convertida: vals[0],
          alternativas: vals,
          inicio: ultimoEspacio + 1,
          fin: cursor,
          tipo: "exacto",
        };
      }
    }
    return null;
  }

  // Interfaz visual fantasma
  function crearSugerenciaBox() {
    if (!document.body) return;
    const existente = document.getElementById("wanakana-suggestion-box");
    if (existente) {
      sugerenciaBox = existente;
      return;
    }

    sugerenciaBox = document.createElement("div");
    sugerenciaBox.id = "wanakana-suggestion-box";
    document.body.appendChild(sugerenciaBox);
  }

  function posicionarSugerencia(input) {
    if (!sugerenciaBox || !input) return;
    const rect = input.getBoundingClientRect();
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;

    const left = Math.max(
      8,
      Math.min(rect.left + scrollX, window.innerWidth + scrollX - 220)
    );
    const top = rect.bottom + scrollY + 5;

    sugerenciaBox.style.left = `${left}px`;
    sugerenciaBox.style.top = `${top}px`;
  }

  // Construye elemento visual con furigana (<ruby><rt>) para el kanji manteniendo prefijos/sufijos intactos
  function crearNodoFurigana(lectura, kanjiTexto) {
    if (!kanjiTexto || lectura === kanjiTexto) {
      const span = document.createElement("span");
      span.textContent = kanjiTexto || lectura;
      return span;
    }

    // Prefijo común (ej: 'お' en 'おとうさん' / 'お父さん')
    let prefixLen = 0;
    while (
      prefixLen < lectura.length &&
      prefixLen < kanjiTexto.length &&
      lectura[prefixLen] === kanjiTexto[prefixLen]
    ) {
      prefixLen++;
    }

    // Sufijo común (ej: 'さん' en 'おとうさん' / 'お父さん' o 'べ' en 'たべ' / '食べ')
    let suffixLen = 0;
    while (
      suffixLen < lectura.length - prefixLen &&
      suffixLen < kanjiTexto.length - prefixLen &&
      lectura[lectura.length - 1 - suffixLen] ===
        kanjiTexto[kanjiTexto.length - 1 - suffixLen]
    ) {
      suffixLen++;
    }

    const prefijo = kanjiTexto.slice(0, prefixLen);
    const parteKanji = kanjiTexto.slice(
      prefixLen,
      kanjiTexto.length - suffixLen
    );
    const lecturaKanji = lectura.slice(
      prefixLen,
      lectura.length - suffixLen
    );
    const sufijo = kanjiTexto.slice(kanjiTexto.length - suffixLen);

    const cont = document.createElement("span");

    if (prefijo) {
      cont.appendChild(document.createTextNode(prefijo));
    }

    if (parteKanji) {
      const ruby = document.createElement("ruby");
      ruby.appendChild(document.createTextNode(parteKanji));
      const rt = document.createElement("rt");
      rt.textContent = lecturaKanji;
      ruby.appendChild(rt);
      cont.appendChild(ruby);
    }

    if (sufijo) {
      cont.appendChild(document.createTextNode(sufijo));
    }

    return cont;
  }

  let timerOcultarSugerencia = null;

  function poblarElementosSugerencia(contenedor, candidato, idxAlt) {
    contenedor.textContent = "";

    const spanOriginal = document.createElement("span");
    spanOriginal.style.color = "#888";
    spanOriginal.style.fontSize = "0.9em";
    spanOriginal.textContent = candidato.original;

    const spanFlecha = document.createElement("span");
    spanFlecha.style.margin = "0 5px";
    spanFlecha.style.color = "#ff69b4";
    spanFlecha.textContent = "»";

    const strongConvertida = document.createElement("strong");
    strongConvertida.style.fontSize = "1.15em";
    const opcionElegida =
      candidato.alternativas && candidato.alternativas[idxAlt]
        ? candidato.alternativas[idxAlt]
        : candidato.convertida;

    // Renderizar Kanji con Furigana encima
    const nodoFurigana = crearNodoFurigana(candidato.original, opcionElegida);
    strongConvertida.appendChild(nodoFurigana);

    const teclaConv = configuracion.conversionKey || "Enter";
    const etiquetaTecla =
      teclaConv === "Space" ? "Space" : teclaConv === "Tab" ? "Tab" : "Enter";

    const spanAtajo = document.createElement("span");
    spanAtajo.style.fontSize = "0.75em";
    spanAtajo.style.color = "#999";
    spanAtajo.style.marginLeft = "8px";
    const tieneVarias =
      candidato.alternativas && candidato.alternativas.length > 1;
    spanAtajo.textContent = tieneVarias
      ? `[${etiquetaTecla}] (${idxAlt + 1}/${candidato.alternativas.length} Tab)`
      : `[${etiquetaTecla}]`;

    contenedor.appendChild(spanOriginal);
    contenedor.appendChild(spanFlecha);
    contenedor.appendChild(strongConvertida);
    contenedor.appendChild(spanAtajo);
  }

  function mostrarSugerencia(input, candidato, idxAlt = 0) {
    inputConSugerencia = input;

    // Si el input activo es el textarea del Scratchpad modal en Shadow DOM
    if (input === scratchpadTextarea) {
      if (!scratchpadSugerenciaBox) return;
      poblarElementosSugerencia(scratchpadSugerenciaBox, candidato, idxAlt);
      scratchpadSugerenciaBox.classList.add("visible");
      return;
    }

    if (!sugerenciaBox) crearSugerenciaBox();
    if (!sugerenciaBox) return;

    poblarElementosSugerencia(sugerenciaBox, candidato, idxAlt);
    posicionarSugerencia(input);

    clearTimeout(timerOcultarSugerencia);
    if (sugerenciaBox.style.display !== "block") {
      sugerenciaBox.style.display = "block";
      void sugerenciaBox.offsetWidth; // Forzar reflujo para disparar la animación de entrada
    }
    sugerenciaBox.classList.add("wanakana-visible");
  }

  function ocultarSugerencia() {
    if (scratchpadSugerenciaBox) {
      scratchpadSugerenciaBox.classList.remove("visible");
    }
    if (sugerenciaBox) {
      sugerenciaBox.classList.remove("wanakana-visible");
      clearTimeout(timerOcultarSugerencia);
      timerOcultarSugerencia = setTimeout(() => {
        if (
          sugerenciaBox &&
          !sugerenciaBox.classList.contains("wanakana-visible")
        ) {
          sugerenciaBox.style.display = "none";
        }
      }, 160);
    }
    inputConSugerencia = null;
    ultimoMatch = null;
    indiceAlternativa = 0;
  }

  // Actualizar valor de forma compatible con React, Vue y Angular
  function actualizarValorReactivo(input, nuevoTexto, nuevaPosicion) {
    ignorarEventoSintetico = true;
    try {
      const prototipo =
        input.nodeName === "TEXTAREA"
          ? window.HTMLTextAreaElement.prototype
          : window.HTMLInputElement.prototype;
      const descriptor = Object.getOwnPropertyDescriptor(prototipo, "value");
      if (descriptor && descriptor.set) {
        descriptor.set.call(input, nuevoTexto);
      } else {
        input.value = nuevoTexto;
      }

      input.setSelectionRange(nuevaPosicion, nuevaPosicion);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    } finally {
      ignorarEventoSintetico = false;
    }
  }

  // EVENT HANDLERS

  function manejarInput(e, input) {
    if (ignorarEventoSintetico) return;
    if (!wanakanaActivo && input !== scratchpadTextarea) return;
    const match = buscarCandidato(input.value, input.selectionStart);
    if (match) {
      ultimoMatch = match;
      indiceAlternativa = 0;
      mostrarSugerencia(input, match, indiceAlternativa);
    } else {
      ocultarSugerencia();
    }
  }

  function manejarKeydown(e, input) {
    if (!wanakanaActivo && input !== scratchpadTextarea) return;

    const teclaConv = configuracion.conversionKey || "Enter";
    const sugerenciaVisible =
      (sugerenciaBox && sugerenciaBox.classList.contains("wanakana-visible")) ||
      (scratchpadSugerenciaBox &&
        scratchpadSugerenciaBox.classList.contains("visible") &&
        input === scratchpadTextarea);

    // 1. Alternar entre candidatos homófonos con Tab (si Tab no es la tecla de conversión)
    if (
      e.key === "Tab" &&
      teclaConv !== "Tab" &&
      ultimoMatch &&
      ultimoMatch.alternativas &&
      ultimoMatch.alternativas.length > 1 &&
      sugerenciaVisible
    ) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      indiceAlternativa =
        (indiceAlternativa + 1) % ultimoMatch.alternativas.length;
      mostrarSugerencia(input, ultimoMatch, indiceAlternativa);
      return;
    }

    // 2. Comprobar si se pulsó la tecla de conversión configurada
    const esTeclaConversion =
      (teclaConv === "Enter" && e.key === "Enter") ||
      (teclaConv === "Space" && e.code === "Space") ||
      (teclaConv === "Tab" && e.key === "Tab");

    if (esTeclaConversion) {
      // Si no hay ninguna sugerencia activa visible, la tecla de conversión
      // debe comportarse normalmente (Enter: salto de línea/envío, Space: espacio, Tab: navegación)
      if (!sugerenciaVisible) {
        return;
      }

      const match =
        ultimoMatch || buscarCandidato(input.value, input.selectionStart);
      if (match) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        // Si se convirtió con Enter, tragar keypress/keyup y bloquear el submit para que no envíe el formulario
        if (e.key === "Enter") {
          tragarProximoEnterKeyUp = true;
          bloquearEnvioFormularioTemporal = true;
          setTimeout(() => {
            bloquearEnvioFormularioTemporal = false;
          }, 150);
        }

        const palabraElegida =
          match.alternativas && match.alternativas[indiceAlternativa]
            ? match.alternativas[indiceAlternativa]
            : match.convertida;

        const texto = input.value;
        const nuevoTexto =
          texto.slice(0, match.inicio) +
          palabraElegida +
          texto.slice(match.fin);

        const nuevaPosicion = match.inicio + palabraElegida.length;
        actualizarValorReactivo(input, nuevoTexto, nuevaPosicion);

        if (input === scratchpadTextarea) {
          actualizarContadorScratchpad();
        }

        registrarEstadisticaConversion(palabraElegida, match.original);
        ocultarSugerencia();
        return;
      }
    }

    // 3. Comportamiento de otras teclas cuando no son la tecla de conversión:
    if (teclaConv !== "Space" && e.code === "Space") {
      // En modo Enter o Tab, presionar Space oculta la sugerencia y deja el espacio libre
      ocultarSugerencia();
    } else if (e.code === "Escape") {
      if (sugerenciaVisible) {
        ocultarSugerencia();
      } else if (scratchpadAbierto && input === scratchpadTextarea) {
        toggleScratchpad(false);
      }
    } else if (e.key === "Enter" && teclaConv === "Space") {
      // En modo clásico Space, Enter confirma Hiragana (kakutei) sin convertir y sin enviar formulario
      if (sugerenciaVisible) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        tragarProximoEnterKeyUp = true;
        bloquearEnvioFormularioTemporal = true;
        setTimeout(() => {
          bloquearEnvioFormularioTemporal = false;
        }, 150);
      }
      ocultarSugerencia();
    }
  }

  // CORE
  function esInputCompatible(input) {
    if (!input || input.nodeType !== 1) return false;
    if (input.disabled || input.readOnly) return false;
    if (input.nodeName === "TEXTAREA") return true;
    if (input.nodeName === "INPUT") {
      const tipo = (input.type || "text").toLowerCase();
      return !TIPOS_INPUT_EXCLUIDOS.has(tipo);
    }
    return false;
  }

  function bindInput(input) {
    if (!esInputCompatible(input)) return;
    if (input.dataset.wanakanaBound === "true") return;

    try {
      wanakana.bind(input, { IMEMode: true });
      input.dataset.wanakanaBound = "true";
      input.classList.add("wanakana-active");

      const onInput = (e) => manejarInput(e, input);
      const onKeydown = (e) => manejarKeydown(e, input);
      const onBlur = () => ocultarSugerencia();

      listenersPorInput.set(input, { onInput, onKeydown, onBlur });

      input.addEventListener("input", onInput);
      input.addEventListener("keydown", onKeydown, true);
      input.addEventListener("blur", onBlur);
    } catch (e) {
      console.log("Error binding:", e);
    }
  }

  function unbindInput(input) {
    if (input.dataset.wanakanaBound !== "true") return;

    try {
      wanakana.unbind(input);
    } catch (e) {
      // Ignorar si wanakana ya no tenía registrado el elemento
    }

    const listeners = listenersPorInput.get(input);
    if (listeners) {
      input.removeEventListener("input", listeners.onInput);
      input.removeEventListener("keydown", listeners.onKeydown, true);
      input.removeEventListener("blur", listeners.onBlur);
      listenersPorInput.delete(input);
    }

    delete input.dataset.wanakanaBound;
    input.classList.remove("wanakana-active");
  }

  function aplicarWanakanaDeTodos() {
    const inputs = document.querySelectorAll(SELECTOR_INPUTS);
    inputs.forEach(bindInput);
  }

  function removerWanakanaDeTodos() {
    ocultarSugerencia();
    const inputs = document.querySelectorAll('[data-wanakana-bound="true"]');
    inputs.forEach(unbindInput);
  }

  function inyectarEstilos() {
    if (!document.head || document.getElementById("wanakana-style")) return;
    const estilo = document.createElement("style");
    estilo.id = "wanakana-style";
    estilo.textContent = `
        .wanakana-active {
            box-shadow: 0 4px 2px -2px rgba(255, 105, 180, 0.3) !important;
            border-bottom: 3px solid #ff69b4 !important;
            background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><text x="50%" y="60%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="16" fill="%23ff69b4">あ</text></svg>') !important;
            background-repeat: no-repeat !important;
            background-position: right 10px center !important;
            background-size: 24px !important;
            transition: all 0.3s ease;
        }

        #wanakana-suggestion-box {
            position: absolute !important;
            background: rgba(255, 255, 255, 0.98) !important;
            border: 1px solid rgba(255, 105, 180, 0.45) !important;
            border-left: 4px solid #ff69b4 !important;
            padding: 5px 12px !important;
            border-radius: 6px !important;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16), 0 2px 6px rgba(0, 0, 0, 0.08) !important;
            font-size: 14px !important;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
            color: #333 !important;
            z-index: 2147483647 !important;
            pointer-events: none !important;
            white-space: nowrap !important;
            backdrop-filter: blur(8px) !important;
            -webkit-backdrop-filter: blur(8px) !important;
            opacity: 0 !important;
            transform: translateY(-6px) scale(0.96) !important;
            transition: opacity 0.16s cubic-bezier(0.16, 1, 0.3, 1), transform 0.16s cubic-bezier(0.16, 1, 0.3, 1) !important;
            display: none;
            line-height: 1.3 !important;
        }

        #wanakana-suggestion-box.wanakana-visible {
            opacity: 1 !important;
            transform: translateY(0) scale(1) !important;
        }

        #wanakana-suggestion-box ruby {
            ruby-position: over !important;
        }

        #wanakana-suggestion-box rt {
            font-size: 0.6em !important;
            color: #ff69b4 !important;
            font-weight: 700 !important;
            line-height: 1 !important;
            text-align: center !important;
        }
    `;
    document.head.appendChild(estilo);
  }

  function iniciarVigilante() {
    if (observador || !document.body) return;
    observador = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) {
            if (esInputCompatible(node)) {
              bindInput(node);
            } else if (node.querySelectorAll) {
              const inputsInternos = node.querySelectorAll(SELECTOR_INPUTS);
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

  // Reposicionar sugerencia al hacer scroll o redimensionar la ventana
  window.addEventListener(
    "scroll",
    () => {
      if (
        inputConSugerencia &&
        sugerenciaBox &&
        sugerenciaBox.style.display === "block"
      ) {
        posicionarSugerencia(inputConSugerencia);
      }
    },
    { passive: true, capture: true }
  );

  window.addEventListener(
    "resize",
    () => {
      if (
        inputConSugerencia &&
        sugerenciaBox &&
        sugerenciaBox.style.display === "block"
      ) {
        posicionarSugerencia(inputConSugerencia);
      }
    },
    { passive: true }
  );

  let ultimoToggleTiempo = 0;

  function alternarEstadoConDebounce() {
    const ahora = Date.now();
    if (ahora - ultimoToggleTiempo < 400) return;
    ultimoToggleTiempo = ahora;
    wanakanaActivo = !wanakanaActivo;
    gestionarEstado();
    try {
      chrome.runtime
        .sendMessage({
          action: "estadoCambiado",
          status: wanakanaActivo,
        })
        .catch(() => {});
    } catch (e) {
      // Ignorar si el contexto de la extensión se reinició
    }
  }

  // Atajo Alt + K directo en la página para respuesta instantánea sin depender exclusivamente del registro de comandos
  window.addEventListener(
    "keydown",
    (e) => {
      if (
        e.altKey &&
        !e.ctrlKey &&
        !e.metaKey &&
        (e.code === "KeyK" || e.key === "k" || e.key === "K")
      ) {
        e.preventDefault();
        e.stopPropagation();
        alternarEstadoConDebounce();
      } else if (
        e.altKey &&
        !e.ctrlKey &&
        !e.metaKey &&
        (e.code === "KeyJ" || e.key === "j" || e.key === "J")
      ) {
        e.preventDefault();
        e.stopPropagation();
        toggleScratchpad();
      }
    },
    true
  );

  chrome.runtime.onMessage.addListener((req, s, resp) => {
    if (req.action === "toggle") {
      alternarEstadoConDebounce();
    } else if (req.action === "init") {
      wanakanaActivo = true;
      gestionarEstado();
    } else if (req.action === "toggleScratchpad") {
      toggleScratchpad();
    }
    resp({ status: wanakanaActivo });
  });

  function gestionarEstado() {
    if (wanakanaActivo) {
      inyectarEstilos();
      crearSugerenciaBox();
      aplicarWanakanaDeTodos();
      iniciarVigilante();
      if (configuracion.mostrarToast) {
        mostrarToast("Wanakana Activado 🇯🇵");
      }
    } else {
      removerWanakanaDeTodos();
      detenerVigilante();
      if (configuracion.mostrarToast) {
        mostrarToast("Wanakana Desactivado 🇯🇵");
      }
    }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" || area === "local") {
      if (changes.diccionarioCloud) {
        actualizarDiccionarioUnificado();
      }
      if (changes.configuracion) {
        actualizarConfiguracion();
      }
    }
  });

  actualizarDiccionarioUnificado();
  actualizarConfiguracion();

  // Supresión global en fase de captura para que el Enter de conversión nunca filtre envíos a la web
  window.addEventListener(
    "keyup",
    (e) => {
      if (tragarProximoEnterKeyUp && e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        tragarProximoEnterKeyUp = false;
      }
    },
    true
  );

  window.addEventListener(
    "keypress",
    (e) => {
      if (tragarProximoEnterKeyUp && e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    },
    true
  );

  window.addEventListener(
    "submit",
    (e) => {
      if (bloquearEnvioFormularioTemporal) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        bloquearEnvioFormularioTemporal = false;
      }
    },
    true
  );

  // Funcion visual inicial
  function mostrarToast(mensaje) {
    if (!document.body) return;
    const existingToast = document.getElementById("wanakana-toast");
    if (existingToast) existingToast.remove();

    const toast = document.createElement("div");
    toast.id = "wanakana-toast";
    toast.textContent = mensaje;
    Object.assign(toast.style, {
      position: "fixed",
      top: "20px",
      right: "20px",
      padding: "10px 20px",
      backgroundColor: "#333",
      color: "#fff",
      borderRadius: "8px",
      zIndex: "2147483647",
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

  // ----------------------------------------------------
  // BARRA FLOTANTE Y MODAL DE ESCRITURA LIBRE (SCRATCHPAD)
  // Encapsulado en Shadow DOM para aislar estilos CSS completamente
  // ----------------------------------------------------

  function asegurarScratchpad() {
    if (!document.body && !document.documentElement) return;
    if (scratchpadHost && document.contains(scratchpadHost)) return;

    scratchpadHost = document.createElement("div");
    scratchpadHost.id = "wanakana-scratchpad-host";
    scratchpadHost.style.position = "static";

    scratchpadShadow = scratchpadHost.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = `
      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Hiragino Sans", "Meiryo", sans-serif;
      }

      /* Botón Flotante (FAB) */
      .wanakana-fab {
        position: fixed;
        bottom: 24px;
        right: 24px;
        width: 50px;
        height: 50px;
        border-radius: 50%;
        background: linear-gradient(135deg, #ff69b4, #e0559e);
        color: #ffffff;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        z-index: 2147483640;
        box-shadow: 0 4px 16px rgba(255, 105, 180, 0.45);
        border: 2px solid #ffffff;
        transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease;
        user-select: none;
        -webkit-user-select: none;
      }

      .wanakana-fab:hover {
        transform: scale(1.08);
        box-shadow: 0 6px 22px rgba(255, 105, 180, 0.65);
      }

      .wanakana-fab:active {
        transform: scale(0.95);
      }

      .wanakana-fab-icon {
        font-size: 24px;
        font-weight: 700;
        line-height: 1;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
      }

      /* Overlay Backdrop */
      .wanakana-overlay {
        position: fixed;
        inset: 0;
        background: rgba(15, 23, 42, 0.6);
        backdrop-filter: blur(5px);
        -webkit-backdrop-filter: blur(5px);
        display: flex;
        align-items: flex-start;
        justify-content: center;
        z-index: 2147483645;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        padding: 48px 16px 16px;
        overflow-y: auto;
      }

      .wanakana-overlay.visible {
        opacity: 1;
        pointer-events: auto;
      }

      /* Modal Card */
      .wanakana-card {
        background: #ffffff;
        color: #1e293b;
        width: 580px;
        max-width: 100%;
        border-radius: 16px;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05);
        overflow: hidden;
        display: flex;
        flex-direction: column;
        transform: translateY(-14px) scale(0.96);
        transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
      }

      .wanakana-overlay.visible .wanakana-card {
        transform: translateY(0) scale(1);
      }

      /* Header */
      .wanakana-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 20px;
        background: #fdf2f8;
        border-bottom: 1px solid #fce7f3;
      }

      .wanakana-title-group {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .wanakana-title {
        font-size: 16px;
        font-weight: 700;
        color: #831843;
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .wanakana-badge {
        background: #fbcfe8;
        color: #9d174d;
        font-size: 11px;
        font-weight: 600;
        padding: 2px 7px;
        border-radius: 6px;
        letter-spacing: 0.5px;
      }

      .wanakana-close-btn {
        background: transparent;
        border: none;
        color: #9d174d;
        font-size: 20px;
        cursor: pointer;
        width: 32px;
        height: 32px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.15s ease;
        line-height: 1;
      }

      .wanakana-close-btn:hover {
        background: #fce7f3;
      }

      /* Body */
      .wanakana-body {
        padding: 18px 20px 14px 20px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .wanakana-textarea {
        width: 100%;
        height: 150px;
        min-height: 100px;
        max-height: 360px;
        resize: vertical;
        padding: 12px 14px;
        font-size: 16px;
        line-height: 1.6;
        border: 1.5px solid #e2e8f0;
        border-radius: 10px;
        outline: none;
        color: #0f172a;
        background: #f8fafc;
        transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
      }

      .wanakana-textarea:focus {
        background: #ffffff;
        border-color: #ff69b4;
        box-shadow: 0 0 0 3px rgba(255, 105, 180, 0.2);
      }

      .wanakana-meta {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 12px;
        color: #64748b;
        padding: 0 2px;
      }

      .wanakana-tip {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      /* Footer */
      .wanakana-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 20px;
        background: #f8fafc;
        border-top: 1px solid #f1f5f9;
      }

      .wanakana-actions-right {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .wanakana-btn {
        padding: 8px 14px;
        font-size: 13px;
        font-weight: 600;
        border-radius: 8px;
        cursor: pointer;
        border: 1px solid transparent;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        transition: all 0.15s ease;
        user-select: none;
      }

      .wanakana-btn-secondary {
        background: #ffffff;
        border-color: #cbd5e1;
        color: #475569;
      }

      .wanakana-btn-secondary:hover {
        background: #f1f5f9;
        border-color: #94a3b8;
      }

      .wanakana-btn-primary {
        background: linear-gradient(135deg, #ff69b4, #e0559e);
        color: #ffffff;
        box-shadow: 0 2px 6px rgba(255, 105, 180, 0.3);
      }

      .wanakana-btn-primary:hover {
        filter: brightness(1.05);
        box-shadow: 0 4px 10px rgba(255, 105, 180, 0.4);
      }

      .wanakana-btn-primary.copiado {
        background: #10b981 !important;
        box-shadow: 0 2px 6px rgba(16, 185, 129, 0.3) !important;
      }

      /* Sugerencia Box en Modal (Shadow DOM) */
      .wanakana-modal-suggestion {
        display: none;
        align-items: center;
        background: rgba(255, 255, 255, 0.98);
        border: 1px solid rgba(255, 105, 180, 0.45);
        border-left: 4px solid #ff69b4;
        padding: 5px 12px;
        border-radius: 6px;
        box-shadow: 0 4px 14px rgba(255, 105, 180, 0.18), 0 2px 6px rgba(0, 0, 0, 0.06);
        font-size: 14px;
        color: #333333;
        width: fit-content;
        line-height: 1.3;
        margin-top: 2px;
      }

      .wanakana-modal-suggestion.visible {
        display: inline-flex;
      }

      .wanakana-modal-suggestion ruby {
        ruby-position: over;
      }

      .wanakana-modal-suggestion rt {
        font-size: 0.6em;
        color: #ff69b4;
        font-weight: 700;
        line-height: 1;
        text-align: center;
      }
    `;

    scratchpadShadow.appendChild(style);

    // 1. Botón Flotante (FAB)
    scratchpadFab = document.createElement("div");
    scratchpadFab.className = "wanakana-fab";
    scratchpadFab.title = "WanaInput - Área de Escritura Libre (Alt + J)";
    const fabIcon = document.createElement("span");
    fabIcon.className = "wanakana-fab-icon";
    fabIcon.textContent = "あ";
    scratchpadFab.appendChild(fabIcon);
    scratchpadFab.addEventListener("click", () => toggleScratchpad());
    scratchpadShadow.appendChild(scratchpadFab);

    // 2. Overlay y Modal
    scratchpadOverlay = document.createElement("div");
    scratchpadOverlay.className = "wanakana-overlay";

    const card = document.createElement("div");
    card.className = "wanakana-card";

    // Header
    const header = document.createElement("div");
    header.className = "wanakana-header";

    const titleGroup = document.createElement("div");
    titleGroup.className = "wanakana-title-group";

    const title = document.createElement("div");
    title.className = "wanakana-title";
    title.textContent = "🌸 WanaInput Escritura Libre";

    const badge = document.createElement("span");
    badge.className = "wanakana-badge";
    badge.textContent = "Alt + J";

    titleGroup.appendChild(title);
    titleGroup.appendChild(badge);

    const closeBtn = document.createElement("button");
    closeBtn.className = "wanakana-close-btn";
    closeBtn.textContent = "✕";
    closeBtn.title = "Cerrar (Esc)";
    closeBtn.addEventListener("click", () => toggleScratchpad(false));

    header.appendChild(titleGroup);
    header.appendChild(closeBtn);

    // Body
    const body = document.createElement("div");
    body.className = "wanakana-body";

    scratchpadTextarea = document.createElement("textarea");
    scratchpadTextarea.className = "wanakana-textarea";
    scratchpadTextarea.placeholder =
      "Escribe en Romaji directamente (ej: nihon -> 日本, tokyo -> 東京, tabemashita -> 食べました)...";

    scratchpadSugerenciaBox = document.createElement("div");
    scratchpadSugerenciaBox.className = "wanakana-modal-suggestion";

    const meta = document.createElement("div");
    meta.className = "wanakana-meta";

    scratchpadContador = document.createElement("div");
    scratchpadContador.textContent = "0 caracteres · 0 palabras";

    const tip = document.createElement("div");
    tip.className = "wanakana-tip";
    tip.textContent = "Enter/Space: Kanji · Tab: Homófonos · Esc: Cerrar";

    meta.appendChild(scratchpadContador);
    meta.appendChild(tip);

    body.appendChild(scratchpadTextarea);
    body.appendChild(scratchpadSugerenciaBox);
    body.appendChild(meta);

    // Footer
    const footer = document.createElement("div");
    footer.className = "wanakana-footer";

    const btnLimpiar = document.createElement("button");
    btnLimpiar.className = "wanakana-btn wanakana-btn-secondary";
    btnLimpiar.textContent = "🧹 Limpiar";
    btnLimpiar.addEventListener("click", () => {
      if (scratchpadTextarea) {
        scratchpadTextarea.value = "";
        actualizarContadorScratchpad();
        ocultarSugerencia();
        scratchpadTextarea.focus();
      }
    });

    const actionsRight = document.createElement("div");
    actionsRight.className = "wanakana-actions-right";

    const btnCerrar = document.createElement("button");
    btnCerrar.className = "wanakana-btn wanakana-btn-secondary";
    btnCerrar.textContent = "Cerrar";
    btnCerrar.addEventListener("click", () => toggleScratchpad(false));

    const btnCopiar = document.createElement("button");
    btnCopiar.className = "wanakana-btn wanakana-btn-primary";
    btnCopiar.textContent = "📋 Copiar texto";
    btnCopiar.addEventListener("click", async () => {
      if (!scratchpadTextarea) return;
      const texto = scratchpadTextarea.value;
      if (!texto) {
        if (configuracion.mostrarToast) mostrarToast("Área de texto vacía 📝");
        return;
      }
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(texto);
        } else {
          scratchpadTextarea.select();
          document.execCommand("copy");
        }
      } catch (e) {
        scratchpadTextarea.select();
        document.execCommand("copy");
      }
      btnCopiar.textContent = "✓ ¡Copiado!";
      btnCopiar.classList.add("copiado");
      setTimeout(() => {
        btnCopiar.textContent = "📋 Copiar texto";
        btnCopiar.classList.remove("copiado");
      }, 1800);
    });

    actionsRight.appendChild(btnCerrar);
    actionsRight.appendChild(btnCopiar);

    footer.appendChild(btnLimpiar);
    footer.appendChild(actionsRight);

    card.appendChild(header);
    card.appendChild(body);
    card.appendChild(footer);

    scratchpadOverlay.appendChild(card);

    scratchpadOverlay.addEventListener("click", (e) => {
      if (e.target === scratchpadOverlay) {
        toggleScratchpad(false);
      }
    });

    scratchpadShadow.appendChild(scratchpadOverlay);

    // Enlazar WanaKana y eventos del textarea
    bindInput(scratchpadTextarea);
    scratchpadTextarea.addEventListener("input", actualizarContadorScratchpad);

    // Aislar eventos de teclado dentro del modal para evitar que atajos del sitio host (ej. 's' para buscar en GitHub/Notion/YouTube)
    // intercepten las teclas debido al retargeting de eventos de Shadow DOM
    scratchpadTextarea.addEventListener("keydown", (e) => {
      // Atajo Alt+J para cerrar el modal desde dentro
      if (
        e.altKey &&
        !e.ctrlKey &&
        !e.metaKey &&
        (e.code === "KeyJ" || e.key === "j" || e.key === "J")
      ) {
        e.preventDefault();
        e.stopPropagation();
        toggleScratchpad(false);
        return;
      }
      // Detener propagación a window para que la página host no intercepte teclas como 's'
      e.stopPropagation();
    });

    scratchpadTextarea.addEventListener("keyup", (e) => {
      e.stopPropagation();
    });

    scratchpadTextarea.addEventListener("keypress", (e) => {
      e.stopPropagation();
    });

    // Permitir clic directo en la sugerencia para convertir
    scratchpadSugerenciaBox.addEventListener("click", () => {
      if (ultimoMatch && scratchpadTextarea) {
        const palabraElegida =
          ultimoMatch.alternativas && ultimoMatch.alternativas[indiceAlternativa]
            ? ultimoMatch.alternativas[indiceAlternativa]
            : ultimoMatch.convertida;

        const texto = scratchpadTextarea.value;
        const nuevoTexto =
          texto.slice(0, ultimoMatch.inicio) +
          palabraElegida +
          texto.slice(ultimoMatch.fin);

        const nuevaPosicion = ultimoMatch.inicio + palabraElegida.length;
        actualizarValorReactivo(scratchpadTextarea, nuevoTexto, nuevaPosicion);
        actualizarContadorScratchpad();
        registrarEstadisticaConversion(palabraElegida, ultimoMatch.original);
        ocultarSugerencia();
        scratchpadTextarea.focus();
      }
    });

    card.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    const mountTarget = document.body || document.documentElement;
    mountTarget.appendChild(scratchpadHost);

    actualizarVisibilidadFab();
  }

  function actualizarContadorScratchpad() {
    if (!scratchpadContador || !scratchpadTextarea) return;
    const txt = scratchpadTextarea.value;
    const chars = txt.length;
    const palabras = txt.trim() ? txt.trim().split(/\s+/).length : 0;
    scratchpadContador.textContent = `${chars} caracteres · ${palabras} ${
      palabras === 1 ? "palabra" : "palabras"
    }`;
  }

  function actualizarVisibilidadFab() {
    if (!scratchpadFab) return;
    const visible = configuracion.mostrarBotonFlotante !== false;
    scratchpadFab.style.display = visible ? "flex" : "none";
  }

  function toggleScratchpad(forzar) {
    asegurarScratchpad();
    if (!scratchpadOverlay) return;

    const debeAbrir = typeof forzar === "boolean" ? forzar : !scratchpadAbierto;
    scratchpadAbierto = debeAbrir;

    if (debeAbrir) {
      scratchpadOverlay.classList.add("visible");
      setTimeout(() => {
        if (scratchpadTextarea) {
          scratchpadTextarea.focus();
        }
      }, 50);
    } else {
      scratchpadOverlay.classList.remove("visible");
      ocultarSugerencia();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      inyectarEstilos();
      crearSugerenciaBox();
      asegurarScratchpad();
    });
  } else {
    inyectarEstilos();
    crearSugerenciaBox();
    asegurarScratchpad();
  }
} else {
  console.log("🇯🇵 Script ya cargado.");
}
