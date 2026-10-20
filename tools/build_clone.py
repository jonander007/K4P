"""Turn the saved K4P homepage (browser "Save page as") into a self-contained
local clone under site/.

- ECL styles/scripts come from the open-source @ecl/preset-ec package (EUPL-1.2)
  instead of the missing "Knowledge for policy_files" folder.
- Analytics, cookie banner and webtools loaders are removed.
- Photos that were not saved are replaced with neutral local placeholders.

Usage: python3 tools/build_clone.py <saved.html> <ecl-dist-dir> <d3.min.js>
"""
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "site"
ASSETS = SITE / "assets"
PREFIX = "./Knowledge for policy_files/"

src, ecl_dist, d3_js = (Path(p) for p in sys.argv[1:4])
html = src.read_text(encoding="utf-8")

# --- vendor assets -----------------------------------------------------------
for sub in ("styles", "scripts", "fonts"):
    dest = ASSETS / "ecl" / sub
    if dest.exists():
        shutil.rmtree(dest)
    shutil.copytree(ecl_dist / sub, dest, ignore=shutil.ignore_patterns("*.map", "optional"))
(ASSETS / "img").mkdir(parents=True, exist_ok=True)
shutil.copy(ecl_dist / "images/logo/positive/logo-ec--en.svg", ASSETS / "img/logo-ec--en.svg")
shutil.copy(ecl_dist / "images/logo/negative/logo-ec--en.svg", ASSETS / "img/logo-ec--en-negative.svg")
(ASSETS / "vendor").mkdir(parents=True, exist_ok=True)
shutil.copy(d3_js, ASSETS / "vendor/d3.min.js")

# --- stylesheets ---------------------------------------------------------------
ECL_CSS = {
    "ecl-ec.css": ("screen", "assets/ecl/styles/ecl-ec.css"),
    "ecl-ec-print.css": ("print", "assets/ecl/styles/ecl-ec-print.css"),
    "ecl-ec-color-modes.css": ("screen", "assets/ecl/styles/ecl-ec-color-modes.css"),
}


def replace_link(m):
    tag = m.group(0)
    href = re.search(r'href="([^"]*)"', tag)
    name = href.group(1).rsplit("/", 1)[-1] if href else ""
    if name in ECL_CSS:
        media, path = ECL_CSS[name]
        return f'<link rel="stylesheet" media="{media}" href="{path}">'
    if href and href.group(1).startswith(PREFIX):
        return ""  # Drupal/K4P/webtools CSS that was not saved
    return tag


html = re.sub(r"<link\b[^>]*>", replace_link, html)
# Favicons point to the live site; use the local EC logo instead.
html = re.sub(r'<link rel="(?:icon|apple-touch-icon)"[^>]*>', "", html)
html = html.replace(
    "<title>",
    '<link rel="stylesheet" href="assets/k4p-clone.css">\n    <title>',
    1,
)

# --- scripts -------------------------------------------------------------------
KEEP_JS = {
    "d3.min.js.descarga": "assets/vendor/d3.min.js",
    "ecl-ec.js.descarga": "assets/ecl/scripts/ecl-ec.js",
}


def replace_script(m):
    tag = m.group(0)
    s = re.search(r'src="([^"]*)"', m.group(1))
    if not s:
        return tag
    name = s.group(1).rsplit("/", 1)[-1]
    if name in KEEP_JS:
        return f'<script src="{KEEP_JS[name]}"></script>'
    return ""  # Drupal, jQuery plugins, analytics, webtools...


html = re.sub(r"<script\b([^>]*)>\s*</script>", replace_script, html)
# Webtools JSON configs (globan, piwik, cookie consent) and Drupal settings.
html = re.sub(r'<script type="application/json"[^>]*>.*?</script>', "", html, flags=re.S)
# Colorbox/webtools DOM injected at runtime by scripts that no longer run.
html = re.sub(r'<div id="cboxOverlay".*?(?=</body>)', "", html, flags=re.S)

# --- images --------------------------------------------------------------------
PLACEHOLDER = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">
<rect width="400" height="300" fill="#d9e1ef"/>
<g fill="none" stroke="#7a8db3" stroke-width="8"><rect x="120" y="85" width="160" height="130" rx="8"/>
<circle cx="170" cy="130" r="14"/><path d="M128 205l50-50 35 35 25-25 34 40"/></g>
<text x="200" y="260" font-family="sans-serif" font-size="18" fill="#4a5a7a" text-anchor="middle">{label}</text>
</svg>"""


def replace_img_src(m):
    name = m.group(1)
    if name.startswith("logo-ec--en"):
        return 'src="assets/img/logo-ec--en.svg"'
    if name == "eu.svg":
        return 'src="assets/img/logo-ec--en-negative.svg"'
    slug = re.sub(r"[^a-z0-9]+", "-", name.rsplit(".", 1)[0].lower()).strip("-")
    out = ASSETS / "img" / f"ph-{slug}.svg"
    out.write_text(PLACEHOLDER.format(label=name[:40]), encoding="utf-8")
    return f'src="assets/img/ph-{slug}.svg" data-original-src="{name}"'


html = re.sub(r'src="\./Knowledge for policy_files/([^"]*)"', replace_img_src, html)
html = re.sub(r'\s(?:srcset|data-srcset)="\./Knowledge for policy_files/[^"]*"', "", html)
# <picture> sources use site-root paths that only resolve on the live server.
html = re.sub(r'<source\b[^>]*srcset="/[^"]*"[^>]*>', "", html)

# --- page init + attribution -----------------------------------------------------
html = html.replace(
    "</body>",
    """<script>if (window.ECL && ECL.autoInit) { ECL.autoInit(); }</script>
<!-- Local clone of https://knowledge-for-policy.ec.europa.eu/home_en for redesign
     work. Content (c) European Union, reused under Commission Decision 2011/833/EU.
     ECL (c) European Commission, EUPL-1.2. -->
</body>""",
    1,
)

leftover = sorted(set(re.findall(r'Knowledge for policy_files/[^"\')]+', html)))
SITE.mkdir(exist_ok=True)
(SITE / "index.html").write_text(html, encoding="utf-8")
print(f"wrote {SITE / 'index.html'} ({len(html)} bytes)")
if leftover:
    print("unresolved references:", *leftover, sep="\n  ")
