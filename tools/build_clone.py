"""Turn the saved K4P homepage (browser "Save page as": the .html plus its
"Knowledge for policy_files" folder) into a self-contained local clone under site/.

- All saved stylesheets and images are kept, copied to site/assets/k4p/ with
  URL-safe names.
- Only the ECL runtime and d3 are kept as scripts; Drupal behaviours,
  analytics, cookie banner and webtools loaders are removed.
- The Inter font (referenced by ECL as ../fonts/) comes from @ecl/preset-ec.

Usage: python3 tools/build_clone.py <saved.html> <saved_files_dir> <ecl-fonts-dir>
"""
import json
import re
import shutil
import sys
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "site"
ASSETS = SITE / "assets"
OUT = ASSETS / "k4p"
PREFIX = "./Knowledge for policy_files/"

src, files_dir, fonts_dir = (Path(p) for p in sys.argv[1:4])
html = src.read_text(encoding="utf-8")

KEEP_JS = {"d3.min.js.descarga", "ecl-ec.js.descarga"}
DROP_CSS = {"webtools.etrans.css"}  # only styles the removed translation widget


def safe_name(name):
    name = name.replace("#U00a9", "")  # "©" mangled by the browser/zip
    if name.endswith(".js.descarga"):
        name = name[: -len(".descarga")]
    stem, dot, ext = name.rpartition(".")
    stem = re.sub(r"[^A-Za-z0-9_.-]+", "-", stem).strip("-")
    return f"{stem}.{ext}"


def local_file(ref):
    """Map a saved-page reference to the file on disk ("©" may be mangled)."""
    name = unquote(ref)
    path = files_dir / name
    if not path.exists():
        path = files_dir / name.replace("©", "#U00a9")
    return path if path.exists() else None


# --- vendor assets -----------------------------------------------------------
for stale in (ASSETS / "ecl", ASSETS / "img", ASSETS / "vendor", OUT, ASSETS / "fonts"):
    if stale.exists():
        shutil.rmtree(stale)
OUT.mkdir(parents=True)
shutil.copytree(fonts_dir, ASSETS / "fonts", ignore=shutil.ignore_patterns("*.txt"))
missing = []


def copy_ref(ref):
    path = local_file(ref)
    if path is None:
        missing.append(ref)
        return None
    name = safe_name(path.name)
    shutil.copy(path, OUT / name)
    return f"assets/k4p/{name}"


# --- stylesheets ---------------------------------------------------------------
def replace_link(m):
    tag = m.group(0)
    href = re.search(r'href="(\./Knowledge for policy_files/[^"]*)"', tag)
    if not href:
        return tag
    ref = href.group(1)[len(PREFIX):]
    if ref in DROP_CSS:
        return ""
    new = copy_ref(ref)
    return tag.replace(href.group(1), new) if new else ""


html = re.sub(r"<link\b[^>]*>", replace_link, html)
# Favicons point to the live site; drop them so nothing is fetched from it.
html = re.sub(r'<link rel="(?:icon|apple-touch-icon)"[^>]*>', "", html)
html = html.replace(
    "</head>",
    '<link rel="stylesheet" href="assets/k4p-clone.css">\n</head>',
    1,
)


# --- scripts -------------------------------------------------------------------
def replace_script(m):
    tag = m.group(0)
    s = re.search(r'src="\./Knowledge for policy_files/([^"]*)"', m.group(1))
    if not s:
        return tag if "src=" not in m.group(1) else ""
    if s.group(1) not in KEEP_JS:
        return ""  # Drupal, jQuery plugins, analytics, webtools...
    return f'<script src="{copy_ref(s.group(1))}"></script>'


html = re.sub(r"<script\b([^>]*)>\s*</script>", replace_script, html)
# Webtools JSON configs (globan, piwik, cookie consent) and Drupal settings.
html = re.sub(r'<script type="application/json"[^>]*>.*?</script>', "", html, flags=re.S)
# Colorbox/webtools DOM injected at runtime by scripts that no longer run.
html = re.sub(r'<div id="cboxOverlay".*?(?=</body>)', "", html, flags=re.S)

# --- images --------------------------------------------------------------------
html = re.sub(
    r'(src|srcset)="\./Knowledge for policy_files/([^"]*)"',
    lambda m: f'{m.group(1)}="{copy_ref(m.group(2)) or ""}"',
    html,
)
# <picture> sources use site-root paths that only resolve on the live server.
html = re.sub(r'<source\b[^>]*srcset="/[^"]*"[^>]*>', "", html)

# --- "Explore" visualisation data ---------------------------------------------------
# Browsers refuse fetch() on file:// pages, so the CSVs the chart loads from
# the live site are embedded as strings in assets/viz-data.js instead. Any
# CSV missing from data/viz/ still falls back to the live URL.
LIVE_FILES = "https://knowledge-for-policy.ec.europa.eu/sites/default/files/"
viz_dir = ROOT / "data" / "viz"
viz_data = {p.name: p.read_text(encoding="utf-8-sig") for p in sorted(viz_dir.glob("*.csv"))}
(ASSETS / "viz-data.js").write_text(
    "window.K4P_VIZ_DATA = " + json.dumps(viz_data, ensure_ascii=False, indent=0) + ";\n",
    encoding="utf-8",
)
html = re.sub(
    r'd3\.csv\("' + re.escape(LIVE_FILES) + r'([^"]+)"\)',
    r'k4pCsv("\1")',
    html,
)
html = html.replace(
    ".then(files => init(files))",
    # The saved page already holds a static render of the chart; drop it so
    # init() does not draw a second SVG below it.
    '.then(files => { document.getElementById("graph").innerHTML = ""; init(files); })',
    1,
)
html = html.replace(
    '<script src="assets/k4p/d3.min.js"></script>',
    '<script src="assets/k4p/d3.min.js"></script>'
    '<script src="assets/viz-data.js"></script>'
    "<script>function k4pCsv(name) {"
    " var text = (window.K4P_VIZ_DATA || {})[name];"
    " return text != null ? Promise.resolve(d3.csvParse(text))"
    f' : d3.csv("{LIVE_FILES}" + name); }}</script>',
    1,
)
if viz_data:
    print("viz data:", ", ".join(viz_data))

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

(SITE / "index.html").write_text(html, encoding="utf-8")
print(f"wrote {SITE / 'index.html'} ({len(html)} bytes), {len(list(OUT.iterdir()))} assets")
leftover = sorted(set(re.findall(r'Knowledge for policy_files/[^"\')]+', html)))
for ref in sorted(set(missing)) + leftover:
    print("unresolved:", ref)
