# K4P – clon local de la portada

Copia local de https://knowledge-for-policy.ec.europa.eu/home_en (solo la portada)
para trabajar propuestas de cambio.

## Estructura

- `site/index.html` – el clon. Ábrelo directamente en el navegador.
- `site/assets/k4p-clone.css` – ajustes propios; aquí van las propuestas de estilo.
- `site/assets/ecl/` – Europa Component Library v5.3.2 (`@ecl/preset-ec`, EUPL-1.2).
- `site/assets/vendor/d3.min.js` – d3 v7.9.0 (gráfico "Explore").
- `original/home_en.saved.html` – la página tal cual se guardó desde el navegador.
- `tools/build_clone.py` – regenera `site/index.html` a partir del HTML guardado.

## Limitaciones

- No se guardaron los CSS propios de K4P/Drupal (`k4p.css`, `k4p_layout.css`…):
  la maquetación sale de ECL más los ajustes de `k4p-clone.css`.
- Las fotos no venían en el guardado: hay marcadores (`assets/img/ph-*.svg`)
  con el nombre del archivo original en `data-original-src`.
- Enlaces, buscador, login y menús apuntan al sitio real; no se ha clonado ninguna otra página.
- Se han quitado analítica, banner de cookies y scripts de webtools.

Contenido © Unión Europea, reutilizado según la Decisión 2011/833/UE.
