# K4P – clon local de la portada

Copia local de https://knowledge-for-policy.ec.europa.eu/home_en (solo la portada)
para trabajar propuestas de cambio.

## Estructura

- `site/index.html` – el clon. Ábrelo directamente en el navegador.
- `site/assets/k4p-clone.css` – se carga después de los estilos originales; aquí van las propuestas de estilo.
- `site/assets/explore.js` – script del gráfico "Explore", con el rediseño (vistas en columna, listas por comunidad).
- `site/assets/k4p/` – CSS, imágenes, ECL 5.0.1 y d3 tal como los sirve la web original.
- `site/assets/fonts/` – fuente Inter (de `@ecl/preset-ec`, EUPL-1.2), que el CSS de ECL busca en `../fonts`.
- `original/home_en.saved.html` – la página tal cual se guardó desde el navegador.
- `tools/build_clone.py` – regenera `site/` a partir del HTML guardado y su carpeta `_files`:
  `python3 tools/build_clone.py original/home_en.saved.html "<carpeta Knowledge for policy_files>" <carpeta fonts de @ecl/preset-ec>`

## Limitaciones

- Solo se cargan los scripts de ECL y d3; los de Drupal (jQuery, colorbox, acordeones…) no,
  así que algún comportamiento dinámico puede diferir de la web real.
- El gráfico "Explore" se muestra tal como estaba al guardar; sus datos (CSV) están en el sitio real.
- Enlaces, buscador, login y menús apuntan al sitio real; no se ha clonado ninguna otra página.
- Se han quitado analítica, banner de cookies y scripts de webtools.

Contenido © Unión Europea, reutilizado según la Decisión 2011/833/UE.
