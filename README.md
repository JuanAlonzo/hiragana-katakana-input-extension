# WanaInput

Extensión para Chrome (Manifest V3) que convierte romaji a japonés (hiragana, katakana y kanji) directamente en cualquier página web mediante WanaKana.

## Qué hace

- **Escritura directa en la página:** Convierte lo que escribes en campos de texto (`input` y `textarea`) en tiempo real.
- **Sugerencias con furigana y homófonos:** Muestra el kanji sugerido junto con su lectura y permite alternar entre opciones cuando existen varios significados.
- **Modal de escritura libre:** Permite redactar japonés en una ventana flotante aislada de la página (útil en sitios donde los campos no son estándar o tienen atajos propios) y copiar el resultado.
- **Diccionario y preferencias:** Desde la página de opciones puedes ajustar la tecla de confirmación, activar o ocultar el botón flotante, consultar estadísticas de uso y gestionar tus propias palabras.

## Atajos principales

- `Alt + K`: Activa o desactiva WanaInput en la pestaña actual.
- `Alt + J`: Abre o cierra el modal flotante de escritura libre.
- `Enter` o `Space`: Aplica el kanji sugerido (configurable en opciones).
- `Tab`: Cambia al siguiente kanji disponible cuando hay homófonos.
- `Esc`: Cierra el modal flotante.

## Estructura del proyecto

- `manifest.json`: Configuración de la extensión, permisos y atajos.
- `content.js`: Lógica del IME en página, caja de sugerencias y modal flotante con Shadow DOM.
- `background.js`: Manejo de comandos globales, estado por pestaña e insignia del icono.
- `vocabulario.js`: Diccionario base de lecturas, verbos y homófonos.
- `wanakana.js`: Librería de conversión romaji-kana.
- `options.html` / `options.js` / `options.css`: Panel de configuración, estadísticas y gestión de vocabulario.
- `icons/`: Iconos de la extensión.

## Instalación local

1. Abre `chrome://extensions/` en Chrome.
2. Activa el **Modo de desarrollador**.
3. Haz clic en **Cargar descomprimida** y selecciona la carpeta del proyecto.
