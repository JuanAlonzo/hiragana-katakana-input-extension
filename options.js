document.addEventListener("DOMContentLoaded", () => {
  const versionEl = document.getElementById("appVersion");
  if (versionEl && chrome.runtime && chrome.runtime.getManifest) {
    versionEl.textContent = `v${chrome.runtime.getManifest().version}`;
  }

  cargarPalabras();
  cargarAjustes();
  chequearParamsURL();
  const params = new URLSearchParams(window.location.search);
  if (params.get("onboarding")) {
    alert(
      "¡Bienvenido a WanaInput! 🌸\n\n1. Usa 'Alt + K' para activar en cualquier web.\n2. Escribe en Romaji para ver Hiragana.\n3. Presiona ENTER (o tu tecla elegida) para convertir a Kanji.\n\n¡Configura aquí tus propias palabras!"
    );
    window.history.replaceState({}, document.title, "options.html");
  }
});

// Navegación de pestañas
document.querySelectorAll(".nav-item").forEach((el) => {
  el.addEventListener("click", () => {
    if (el.classList.contains("disabled")) return;
    cambiarPestana(el.dataset.tab);
  });
});

function cambiarPestana(idTab) {
  document.querySelectorAll(".nav-item").forEach((el) => {
    el.classList.toggle("active", el.dataset.tab === idTab);
  });

  const vistas = {
    diccionario: document.getElementById("vista-diccionario"),
    estadisticas: document.getElementById("vista-estadisticas"),
    ajustes: document.getElementById("vista-ajustes"),
  };

  Object.entries(vistas).forEach(([key, el]) => {
    if (el) el.style.display = key === idTab ? "flex" : "none";
  });

  if (idTab === "estadisticas") {
    cargarEstadisticas();
  } else if (idTab === "diccionario") {
    cargarPalabras();
  } else if (idTab === "ajustes") {
    cargarAjustes();
  }
}

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
document
  .getElementById("filtroCategoria")
  .addEventListener("change", filtrarLista);

// Configuración / Ajustes
document
  .getElementById("selectTeclaConversion")
  .addEventListener("change", guardarAjustes);
document
  .getElementById("checkMostrarToast")
  .addEventListener("change", guardarAjustes);
document
  .getElementById("checkMostrarBotonFlotante")
  .addEventListener("change", guardarAjustes);

// Botones de copias locales / backups
document
  .getElementById("btnHistorialBackups")
  .addEventListener("click", abrirModalBackups);
document
  .getElementById("btnCerrarModal")
  .addEventListener("click", cerrarModalBackups);
document
  .getElementById("btnCrearBackupManual")
  .addEventListener("click", crearSnapshotManual);
document
  .getElementById("btnReiniciarStats")
  .addEventListener("click", reiniciarEstadisticas);

// Cerrar modal al hacer clic en el backdrop oscuro
document.getElementById("modalBackups").addEventListener("click", (e) => {
  if (e.target.id === "modalBackups") cerrarModalBackups();
});

const inputClave = document.getElementById("inputClave");
wanakana.bind(inputClave, { IMEMode: true });

const inputBuscador = document.getElementById("inputBuscador");
wanakana.bind(inputBuscador, { IMEMode: true });

let cacheDiccionarioVisual = [];
let timerNotificacion = null;

function mostrarNotificacion(mensaje, tipo = "success") {
  let toast = document.getElementById("options-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "options-toast";
    toast.className = "options-toast";
    document.body.appendChild(toast);
  }

  toast.className = `options-toast ${tipo}`;
  toast.textContent = mensaje;

  void toast.offsetWidth;
  toast.classList.add("show");

  clearTimeout(timerNotificacion);
  timerNotificacion = setTimeout(() => {
    toast.classList.remove("show");
  }, 2600);
}

// Helpers de almacenamiento (combinando local + sync para evitar límite de 8KB de sync)
function obtenerDiccionarioGuardado(callback) {
  chrome.storage.local.get(["diccionarioCloud"], (resLocal) => {
    chrome.storage.sync.get(["diccionarioCloud"], (resSync) => {
      const syncData = (resSync && resSync.diccionarioCloud) || {};
      const localData = (resLocal && resLocal.diccionarioCloud) || {};

      const unificado = {
        sustantivos: {
          ...(syncData.sustantivos || {}),
          ...(localData.sustantivos || {}),
        },
        raicesVerbos: {
          ...(syncData.raicesVerbos || {}),
          ...(localData.raicesVerbos || {}),
        },
        categorias: {
          ...(syncData.categorias || {}),
          ...(localData.categorias || {}),
        },
      };
      callback(unificado);
    });
  });
}

function guardarDiccionarioGuardado(dic, callback) {
  chrome.storage.local.set({ diccionarioCloud: dic }, () => {
    if (chrome.runtime.lastError) {
      alert(
        "Error al guardar en almacenamiento local: " +
          chrome.runtime.lastError.message
      );
      return;
    }
    // Intentar sincronizar en la nube si cabe dentro de la cuota de 8KB de Chrome Sync
    chrome.storage.sync.set({ diccionarioCloud: dic }, () => {
      void chrome.runtime.lastError;
      if (callback) callback();
    });
  });
}

// ----------------------------------------------------
// SISTEMA DE BACKUPS AUTOMÁTICOS Y HISTORIAL LOCAL
// ----------------------------------------------------

function guardarSnapshotAutomatico(motivo, datos, callback) {
  if (!datos) return;
  chrome.storage.local.get(["historialBackups"], (res) => {
    const backups = Array.isArray(res.historialBackups)
      ? res.historialBackups
      : [];
    const conteo =
      Object.keys(datos.sustantivos || {}).length +
      Object.keys(datos.raicesVerbos || {}).length;

    const nuevoBackup = {
      id: "backup_" + Date.now(),
      fecha: new Date().toISOString(),
      motivo: motivo || "Automático",
      conteo,
      datos: JSON.parse(JSON.stringify(datos)),
    };

    // Mantener hasta las últimas 15 instantáneas (más reciente al frente)
    const listaActualizada = [nuevoBackup, ...backups].slice(0, 15);
    chrome.storage.local.set({ historialBackups: listaActualizada }, () => {
      if (callback) callback(nuevoBackup);
    });
  });
}

function verificarBackupDiario(datosActuales) {
  chrome.storage.local.get(["historialBackups"], (res) => {
    const backups = Array.isArray(res.historialBackups)
      ? res.historialBackups
      : [];
    const ultimo = backups[0];
    const ahora = Date.now();
    const UN_DIA_MS = 24 * 60 * 60 * 1000;

    if (!ultimo || ahora - new Date(ultimo.fecha).getTime() > UN_DIA_MS) {
      guardarSnapshotAutomatico("Snapshot diario de seguridad", datosActuales);
    }
  });
}

function abrirModalBackups() {
  const modal = document.getElementById("modalBackups");
  if (!modal) return;
  modal.style.display = "flex";
  cargarListaBackups();
}

function cerrarModalBackups() {
  const modal = document.getElementById("modalBackups");
  if (!modal) return;
  modal.style.display = "none";
}

function crearSnapshotManual() {
  obtenerDiccionarioGuardado((dic) => {
    guardarSnapshotAutomatico("Copia manual del usuario", dic, () => {
      cargarListaBackups();
      mostrarNotificacion("✓ Copia de seguridad guardada localmente", "success");
    });
  });
}

function cargarListaBackups() {
  const contenedor = document.getElementById("listaBackups");
  if (!contenedor) return;
  contenedor.textContent = "";

  chrome.storage.local.get(["historialBackups"], (res) => {
    const backups = Array.isArray(res.historialBackups)
      ? res.historialBackups
      : [];

    if (backups.length === 0) {
      const vacio = document.createElement("div");
      vacio.style.padding = "30px 20px";
      vacio.style.textAlign = "center";
      vacio.style.color = "var(--text-secondary)";
      vacio.style.fontSize = "0.9rem";
      vacio.textContent =
        "Aún no hay copias de seguridad guardadas. Se generarán automáticamente al añadir o editar palabras.";
      contenedor.appendChild(vacio);
      return;
    }

    backups.forEach((b) => {
      const item = document.createElement("div");
      item.className = "backup-item";

      const info = document.createElement("div");
      info.className = "backup-info";

      const titulo = document.createElement("div");
      titulo.className = "backup-title";
      const fechaLocal = new Date(b.fecha).toLocaleString();
      titulo.textContent = `${fechaLocal} • ${b.motivo}`;

      const sub = document.createElement("div");
      sub.className = "backup-sub";
      sub.textContent = `${b.conteo} palabras en el diccionario`;

      info.appendChild(titulo);
      info.appendChild(sub);

      const actions = document.createElement("div");
      actions.className = "backup-actions";

      const btnRestaurar = document.createElement("button");
      btnRestaurar.className = "btn btn-secondary";
      btnRestaurar.style.fontSize = "0.8rem";
      btnRestaurar.style.padding = "6px 12px";
      btnRestaurar.textContent = "Restaurar";
      btnRestaurar.onclick = () => restaurarSnapshot(b);

      actions.appendChild(btnRestaurar);

      item.appendChild(info);
      item.appendChild(actions);
      contenedor.appendChild(item);
    });
  });
}

function restaurarSnapshot(snapshot) {
  if (!snapshot || !snapshot.datos) return;
  const fechaStr = new Date(snapshot.fecha).toLocaleString();
  if (
    !confirm(
      `¿Restaurar la copia del ${fechaStr} (${snapshot.conteo} palabras)?\nSe guardará un respaldo de tu estado actual antes de aplicar la restauración.`
    )
  ) {
    return;
  }

  obtenerDiccionarioGuardado((actual) => {
    // Guardar respaldo del estado inmediatamente anterior
    guardarSnapshotAutomatico("Antes de restaurar snapshot", actual, () => {
      guardarDiccionarioGuardado(snapshot.datos, () => {
        cargarPalabras();
        cerrarModalBackups();
        mostrarNotificacion(
          `✓ Diccionario restaurado al estado del ${fechaStr}`,
          "success"
        );
      });
    });
  });
}

// ----------------------------------------------------
// EXPORTACIÓN E IMPORTACIÓN MANUAL JSON
// ----------------------------------------------------

function chequearParamsURL() {
  const params = new URLSearchParams(window.location.search);
  const kanji = params.get("kanji");
  if (kanji) {
    document.getElementById("inputValor").value = kanji;
    document.getElementById("inputClave").focus();
    window.history.replaceState({}, document.title, "options.html");
  }
}

function exportarJSON() {
  obtenerDiccionarioGuardado((diccionario) => {
    const datosExportar = {
      sustantivos: diccionario.sustantivos || {},
      raicesVerbos: diccionario.raicesVerbos || {},
      categorias: diccionario.categorias || {},
    };
    const dataStr =
      "data:text/json;charset=utf-8," +
      encodeURIComponent(JSON.stringify(datosExportar, null, 2));
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
      if (
        !contenido ||
        typeof contenido !== "object" ||
        (!contenido.sustantivos && !contenido.raicesVerbos)
      ) {
        throw new Error("JSON inválido");
      }
      if (confirm("¿Fusionar backup con tu diccionario actual?")) {
        obtenerDiccionarioGuardado((actual) => {
          guardarSnapshotAutomatico("Antes de importar archivo externo", actual);
          const nuevo = {
            sustantivos: {
              ...(actual.sustantivos || {}),
              ...(contenido.sustantivos || {}),
            },
            raicesVerbos: {
              ...(actual.raicesVerbos || {}),
              ...(contenido.raicesVerbos || {}),
            },
            categorias: {
              ...(actual.categorias || {}),
              ...(contenido.categorias || {}),
            },
          };
          guardarDiccionarioGuardado(nuevo, () => {
            mostrarNotificacion("✓ Archivo de respaldo importado con éxito", "success");
            cargarPalabras();
          });
        });
      }
    } catch (error) {
      alert("Error: " + error.message);
    } finally {
      event.target.value = "";
    }
  };
  reader.readAsText(file);
}

// ----------------------------------------------------
// GESTIÓN DE PALABRAS Y CATEGORÍAS
// ----------------------------------------------------

function cargarPalabras() {
  const local = window.diccionarioPersonal || {
    sustantivos: {},
    raicesVerbos: {},
    categorias: {},
  };

  obtenerDiccionarioGuardado((cloud) => {
    verificarBackupDiario(cloud);
    cacheDiccionarioVisual = [];

    // Procesar Cloud primero
    procesarEntradas(
      cloud.sustantivos,
      "sustantivos",
      "cloud",
      local.sustantivos,
      cloud.categorias,
      local.categorias
    );
    procesarEntradas(
      cloud.raicesVerbos,
      "raicesVerbos",
      "cloud",
      local.raicesVerbos,
      cloud.categorias,
      local.categorias
    );

    // Procesar Locales (omitiendo las sobrescritas)
    procesarEntradas(
      local.sustantivos,
      "sustantivos",
      "local",
      cloud.sustantivos,
      cloud.categorias,
      local.categorias
    );
    procesarEntradas(
      local.raicesVerbos,
      "raicesVerbos",
      "local",
      cloud.raicesVerbos,
      cloud.categorias,
      local.categorias
    );

    filtrarLista();
  });
}

function guardarPalabra() {
  const claveRaw = document.getElementById("inputClave").value.trim();
  const clave = claveRaw.replace(/[nN]$/, "ん");
  const valor = document.getElementById("inputValor").value.trim();
  const tipo = document.getElementById("tipoEntrada").value;
  const categoria =
    document.getElementById("selectCategoria").value || "General";

  if (!clave || !valor) return alert("Por favor, completa ambos campos.");

  obtenerDiccionarioGuardado((dic) => {
    if (!dic[tipo]) dic[tipo] = {};
    if (!dic.categorias) dic.categorias = {};

    dic[tipo][clave] = valor;
    dic.categorias[clave] = categoria;

    guardarSnapshotAutomatico(`Guardado de "${clave}"`, dic);
    guardarDiccionarioGuardado(dic, () => {
      document.getElementById("inputClave").value = "";
      document.getElementById("inputValor").value = "";
      cargarPalabras();
      mostrarNotificacion(
        `✓ Guardado con éxito: "${clave}" ➔ "${valor}" (${categoria})`,
        "success"
      );
    });
  });
}

function borrarPalabra(tipo, clave) {
  if (!confirm(`¿Seguro que quieres borrar la palabra "${clave}"?`)) return;
  obtenerDiccionarioGuardado((dic) => {
    if (dic && dic[tipo]) {
      guardarSnapshotAutomatico(`Antes de borrar "${clave}"`, dic);
      delete dic[tipo][clave];
      if (dic.categorias) delete dic.categorias[clave];
      guardarDiccionarioGuardado(dic, () => {
        cargarPalabras();
        mostrarNotificacion(`🗑️ Palabra eliminada: "${clave}"`, "info");
      });
    }
  });
}

function procesarEntradas(
  objeto,
  tipo,
  fuente,
  contraparte,
  mapaCategorias,
  localCategorias
) {
  if (!objeto) return;
  for (const [clave, valor] of Object.entries(objeto)) {
    const existeEnContraparte = Boolean(
      contraparte && Object.prototype.hasOwnProperty.call(contraparte, clave)
    );
    if (fuente === "local" && existeEnContraparte) continue;

    const categoria =
      (mapaCategorias && mapaCategorias[clave]) ||
      (localCategorias && localCategorias[clave]) ||
      "General";

    cacheDiccionarioVisual.push({
      clave,
      valor,
      tipo,
      fuente,
      categoria,
      sobrescribeLocal: fuente === "cloud" && existeEnContraparte,
    });
  }
}

function renderizarLista(items) {
  const contenedor = document.getElementById("listaPalabras");
  contenedor.textContent = "";

  items.sort((a, b) => {
    if (a.fuente !== b.fuente) return a.fuente === "cloud" ? -1 : 1;
    return a.clave.localeCompare(b.clave);
  });

  if (items.length === 0) {
    const vacio = document.createElement("div");
    vacio.style.textAlign = "center";
    vacio.style.color = "#999";
    vacio.style.padding = "24px";
    vacio.textContent = "No se encontraron palabras";
    contenedor.appendChild(vacio);
    return;
  }

  items.forEach((item) => {
    const div = document.createElement("div");
    div.className = "word-item";

    const esLocal = item.fuente === "local";
    const etiquetaTipo = item.tipo === "sustantivos" ? "Exacto" : "Raíz";

    const wordContent = document.createElement("div");
    wordContent.className = "word-content";

    const wordMain = document.createElement("div");
    wordMain.className = "word-main";

    const strongClave = document.createElement("strong");
    strongClave.style.color = "#e91e63";
    strongClave.textContent = item.clave;

    const spanFlecha = document.createElement("span");
    spanFlecha.style.color = "#ccc";
    spanFlecha.style.margin = "0 5px";
    spanFlecha.textContent = "➔";

    const strongValor = document.createElement("strong");
    strongValor.textContent = Array.isArray(item.valor)
      ? item.valor.join(" / ")
      : item.valor;

    wordMain.appendChild(strongClave);
    wordMain.appendChild(spanFlecha);
    wordMain.appendChild(strongValor);

    const wordMeta = document.createElement("div");
    wordMeta.className = "word-meta";

    const spanTag = document.createElement("span");
    spanTag.className = esLocal ? "tag tag-local" : "tag tag-cloud";
    spanTag.textContent = esLocal
      ? "🔒 Local"
      : item.sobrescribeLocal
      ? "☁️ Cloud (Modificado)"
      : "☁️ Cloud";

    const spanCat = document.createElement("span");
    spanCat.className = "tag tag-category";
    spanCat.textContent = `📁 ${item.categoria}`;

    const spanTipo = document.createElement("span");
    spanTipo.textContent = ` • ${etiquetaTipo}`;

    wordMeta.appendChild(spanTag);
    wordMeta.appendChild(spanCat);
    wordMeta.appendChild(spanTipo);

    wordContent.appendChild(wordMain);
    wordContent.appendChild(wordMeta);

    const btn = document.createElement("button");
    btn.className = "delete-btn";
    btn.title = esLocal ? "No se puede borrar el diccionario base" : "Borrar";
    btn.textContent = esLocal ? "🔒" : "✕";

    if (esLocal) {
      btn.disabled = true;
    } else {
      btn.onclick = () => borrarPalabra(item.tipo, item.clave);
    }

    div.appendChild(wordContent);
    div.appendChild(btn);
    contenedor.appendChild(div);
  });
}

function filtrarLista() {
  const inputEl = document.getElementById("inputBuscador");
  const textoRaw = (inputEl ? inputEl.value : "").trim().toLowerCase();
  const textoNormalizado = textoRaw.replace(/[nN]$/, "ん");

  const filtroEl = document.getElementById("filtroCategoria");
  const filtroCat = filtroEl ? filtroEl.value : "todas";

  const filtrados = cacheDiccionarioVisual.filter((item) => {
    if (filtroCat && filtroCat !== "todas" && item.categoria !== filtroCat) {
      return false;
    }
    if (!textoRaw) return true;
    return (
      item.clave.toLowerCase().includes(textoRaw) ||
      item.clave.toLowerCase().includes(textoNormalizado) ||
      item.valor.toLowerCase().includes(textoRaw) ||
      item.categoria.toLowerCase().includes(textoRaw)
    );
  });
  renderizarLista(filtrados);
}

// ----------------------------------------------------
// ESTADÍSTICAS DE USO
// ----------------------------------------------------

function cargarEstadisticas() {
  chrome.storage.local.get(["estadisticasUso"], (res) => {
    const stats = (res && res.estadisticasUso) || {
      totalConversiones: 0,
      palabras: {},
      primeraConversion: null,
      ultimaConversion: null,
    };

    const totalConversionesEl = document.getElementById(
      "statTotalConversiones"
    );
    const palabrasUnicasEl = document.getElementById("statPalabrasUnicas");
    const kanjiFavoritoEl = document.getElementById("statKanjiFavorito");
    const ultimaActividadEl = document.getElementById("statUltimaActividad");
    const rankingLista = document.getElementById("rankingLista");

    const palabrasArray = Object.entries(stats.palabras || {}).map(
      ([kanji, data]) => ({
        kanji,
        count: typeof data === "number" ? data : data.count || 0,
        lectura: typeof data === "object" ? data.lectura || "" : "",
        ultimaVez: typeof data === "object" ? data.ultimaVez : null,
      })
    );

    // Ordenar de mayor a menor uso
    palabrasArray.sort((a, b) => b.count - a.count);

    const totalConv = stats.totalConversiones || 0;
    const palabrasUnicas = palabrasArray.length;
    const kanjiTop = palabrasArray[0];

    if (totalConversionesEl) totalConversionesEl.textContent = totalConv;
    if (palabrasUnicasEl) palabrasUnicasEl.textContent = palabrasUnicas;
    if (kanjiFavoritoEl) {
      kanjiFavoritoEl.textContent = kanjiTop
        ? `${kanjiTop.kanji} (${kanjiTop.count})`
        : "-";
    }
    if (ultimaActividadEl) {
      if (stats.ultimaConversion) {
        ultimaActividadEl.textContent = new Date(
          stats.ultimaConversion
        ).toLocaleDateString();
      } else {
        ultimaActividadEl.textContent = "-";
      }
    }

    if (!rankingLista) return;
    rankingLista.textContent = "";

    if (palabrasArray.length === 0) {
      const vacio = document.createElement("div");
      vacio.style.textAlign = "center";
      vacio.style.color = "var(--text-secondary)";
      vacio.style.padding = "40px 20px";
      vacio.textContent =
        "Aún no se han registrado conversiones. ¡Escribe en japonés en cualquier web para ver aquí tus Kanjis más usados!";
      rankingLista.appendChild(vacio);
      return;
    }

    const maxCount = palabrasArray[0].count || 1;

    palabrasArray.slice(0, 30).forEach((item, index) => {
      const row = document.createElement("div");
      row.className = "ranking-row";

      const pos = document.createElement("div");
      pos.className = `ranking-pos top-${index + 1}`;
      pos.textContent = `#${index + 1}`;

      const word = document.createElement("div");
      word.className = "ranking-word";

      const strong = document.createElement("strong");
      strong.textContent = item.kanji;

      const spanLectura = document.createElement("span");
      spanLectura.textContent = item.lectura ? `(${item.lectura})` : "";

      word.appendChild(strong);
      if (item.lectura) word.appendChild(spanLectura);

      const barWrapper = document.createElement("div");
      barWrapper.className = "ranking-bar-wrapper";

      const barFill = document.createElement("div");
      barFill.className = "ranking-bar-fill";
      const porcentaje = Math.round((item.count / maxCount) * 100);
      barFill.style.width = `${porcentaje}%`;
      barWrapper.appendChild(barFill);

      const count = document.createElement("div");
      count.className = "ranking-count";
      count.textContent = `${item.count} ${item.count === 1 ? "vez" : "veces"}`;

      row.appendChild(pos);
      row.appendChild(word);
      row.appendChild(barWrapper);
      row.appendChild(count);

      rankingLista.appendChild(row);
    });
  });
}

function reiniciarEstadisticas() {
  if (
    !confirm(
      "¿Seguro que deseas reiniciar todas las estadísticas de conversiones a cero?"
    )
  ) {
    return;
  }

  chrome.storage.local.remove(["estadisticasUso"], () => {
    cargarEstadisticas();
    mostrarNotificacion("✓ Estadísticas reiniciadas con éxito", "info");
  });
}

// ----------------------------------------------------
// AJUSTES / CONFIGURACIÓN
// ----------------------------------------------------

function cargarAjustes() {
  chrome.storage.local.get(["configuracion"], (resLocal) => {
    chrome.storage.sync.get(["configuracion"], (resSync) => {
      const conf = {
        conversionKey: "Enter",
        mostrarToast: true,
        mostrarBotonFlotante: true,
        ...((resLocal && resLocal.configuracion) || {}),
        ...((resSync && resSync.configuracion) || {}),
      };

      const selectKey = document.getElementById("selectTeclaConversion");
      const checkToast = document.getElementById("checkMostrarToast");
      const checkFab = document.getElementById("checkMostrarBotonFlotante");

      if (selectKey) selectKey.value = conf.conversionKey || "Enter";
      if (checkToast) checkToast.checked = conf.mostrarToast !== false;
      if (checkFab) checkFab.checked = conf.mostrarBotonFlotante !== false;
    });
  });
}

function guardarAjustes() {
  const selectKey = document.getElementById("selectTeclaConversion");
  const checkToast = document.getElementById("checkMostrarToast");
  const checkFab = document.getElementById("checkMostrarBotonFlotante");

  const configuracion = {
    conversionKey: selectKey ? selectKey.value : "Enter",
    mostrarToast: checkToast ? checkToast.checked : true,
    mostrarBotonFlotante: checkFab ? checkFab.checked : true,
  };

  chrome.storage.local.set({ configuracion }, () => {
    chrome.storage.sync.set({ configuracion }, () => {
      void chrome.runtime.lastError;
      mostrarNotificacion(
        `✓ Ajustes guardados: Tecla [${configuracion.conversionKey}] | Botón Flotante [${configuracion.mostrarBotonFlotante ? "ON" : "OFF"}]`,
        "success"
      );
    });
  });
}
