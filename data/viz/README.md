# Datos del gráfico "Explore"

Copia aquí los 7 CSV que la web carga desde
`https://knowledge-for-policy.ec.europa.eu/sites/default/files/`:

- `topics_0.csv`
- `kc_0.csv`
- `plc_0.csv`
- `topic-kc_0.csv`
- `kc-plc_0.csv`
- `plc-plc_0.csv`
- `plc-briefme_0.csv`

y vuelve a ejecutar `tools/build_clone.py`: se incrustan en `site/assets/viz-data.js`
para que el gráfico funcione al abrir `site/index.html` con doble clic.
Si falta alguno, el gráfico intenta cargarlo de la web real.
