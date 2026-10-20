//////////////////////////////////////////////////////////////////////////////
// DATA LOADING
///////////////////////////////////////////////////////////////////////////////
let vizState = "All";
let plcBriefmeMap = {}; // populated in init, consumed by openSidePanel
let plcInfoMap = {}; // plcId -> {plcLabel, plcLink}, populated in init
let plcRelatedMap = {}; // plcId -> related plcIds, populated in init
// Nothing is fetched or drawn while #vizSection is hidden: init() sizes every
// layout from #graph's clientWidth, which is 0 under display:none, and every
// radius and angle derived from it would come out NaN.
//
// The threshold comes from the section's data-min-width attribute, so it is
// declared once in the markup and shared with the reveal script there.
const vizSection = document.getElementById("vizSection");
const vizWideEnough = window.matchMedia(
  `(min-width: ${vizSection.dataset.minWidth}px)`,
);
// The data is loaded at most once, the first time the viewport is wide enough.
// Crossing the threshold again later only shows or hides the existing SVG,
// which rescales on its own through its viewBox.
let vizLoaded = false;
// Called on every viewport change, not just at load: rotating a phone to
// landscape or zooming out can cross the threshold mid-session, and the block
// would otherwise stay hidden (or stay visible, and unusable) until a reload.
function syncVizVisibility() {
  vizSection.style.display = vizWideEnough.matches ? "block" : "none";
  if (!vizWideEnough.matches) {
    // The panel lives inside the section, so hiding it would leave an open
    // dialog holding focus on an element the user can no longer see. Focus is
    // not restored to the dot that opened it, since that is now hidden too.
    if (isPanelOpen()) closeSidePanel(false);
    return;
  }
  if (!vizLoaded) {
    vizLoaded = true;
    loadData();
  }
}
syncVizVisibility();
vizWideEnough.addEventListener("change", syncVizVisibility);
function loadData() {
  const files = [
  k4pCsv("topics_0.csv"),
  k4pCsv("kc_0.csv"),
  k4pCsv("plc_0.csv"),
  k4pCsv("topic-kc_0.csv"),
  k4pCsv("kc-plc_0.csv"),
  k4pCsv("plc-plc_0.csv"),
  k4pCsv("plc-briefme_0.csv"),
  ];
  Promise.all(files)
    .then(files => { document.getElementById("graph").innerHTML = ""; init(files); })
    .catch(err => console.log("Promise.all error", err));
}
// Max width for the side panel, capped so it never overflows past the left
// edge of the viewport. #sidePanel sits at the right edge of #sidePanelTrack,
// which spans #vizWrapper, not the viewport, so the available width is the
// distance from the viewport's left edge to #vizWrapper's right edge (its
// getBoundingClientRect right value) — not window.innerWidth, which ignores
// that offset.
function getSidePanelWidth() {
  const wrapperRight = document
    .getElementById("vizWrapper")
    .getBoundingClientRect().right;
  return Math.min(700, wrapperRight);
}
// Below this panel width, the image and KC/title block feel cramped side by
// side, so the header switches to a stacked (column) layout instead.
const SIDE_PANEL_STACK_BREAKPOINT = 480;
function updateSidePanelHeaderLayout(width) {
  const header = document.getElementById("sidePanelHeader");
  if (!header) return;
  header.classList.toggle(
    "ecl-u-flex-column",
    width < SIDE_PANEL_STACK_BREAKPOINT,
  );
}
// The panel is hidden with width:0, which does not remove its links from the
// tab order — the `inert` attribute does that, and is toggled on open/close.
function isPanelOpen() {
  const w = document.getElementById("sidePanel").style.width;
  return w !== "0px" && w !== "0" && w !== "";
}
// Elements outside a modal stay reachable by Tab, so the panel traps focus
// while open. Covers the link/button types the panel actually renders.
const PANEL_FOCUSABLE = "a[href], button:not([disabled])";
function getPanelFocusables() {
  const panel = document.getElementById("sidePanel");
  return Array.from(panel.querySelectorAll(PANEL_FOCUSABLE)).filter(
    // offsetParent is null for display:none elements, e.g. the related-content
    // links when a PLC has none
    el => el.offsetParent !== null,
  );
}
// Element focused when the panel opened, restored when it closes
let panelOpener = null;
function openSidePanel(d) {
  const panel = document.getElementById("sidePanel");
  const panelInner = document.getElementById("sidePanelInner");
  const overlay = document.getElementById("vizOverlay");
  const currentTitle = document.getElementById("sidePanelTitle").textContent;
  const isSame = currentTitle === d.plcLabel;
  // Clicking the same PLC that opened the panel toggles it closed
  if (isPanelOpen() && isSame) {
    closeSidePanel();
    return;
  }
  document.getElementById("sidePanelStripe").style.backgroundColor = d.kcColor;
  document.getElementById("sidePanelTitle").textContent = d.plcLabel;
  document.getElementById("sidePanelIntro").textContent = d.plcIntroText || "";
  // Show the square PLC image only if one is provided; otherwise keep it
  // hidden so the KC link/title block sticks to the left edge
  const sidePanelImage = document.getElementById("sidePanelImage");
  if (d.plcImageUrl) {
    sidePanelImage.src = d.plcImageUrl;
    // Decorative image: empty alt so screen readers skip it instead of
    // reading a redundant label (the PLC title is already shown as text)cll
    sidePanelImage.alt = "";
    sidePanelImage.classList.remove("ecl-u-d-none");
  } else {
    sidePanelImage.removeAttribute("src");
    sidePanelImage.classList.add("ecl-u-d-none");
  }
  // The KC name is always shown; with no link the href is dropped so the
  // element is neither clickable nor reachable by Tab. The ecl-link classes go
  // with it: they paint the link colour, underline and hover on their own, so
  // leaving them would keep the name looking clickable. The typography and
  // spacing utilities stay, so the header layout does not shift either way.
  const sidePanelKC = document.getElementById("sidePanelKC");
  const hasKcLink = Boolean(d.kcLink);
  sidePanelKC.querySelector(".ecl-link__label").textContent = d.kcLabel;
  if (hasKcLink) sidePanelKC.href = d.kcLink;
  else sidePanelKC.removeAttribute("href");
  sidePanelKC.classList.toggle("ecl-link", hasKcLink);
  sidePanelKC.classList.toggle("ecl-link--standalone", hasKcLink);
  // Populate "Brief me" bullet list from plcBriefmeMap
  const bullets = plcBriefmeMap[d.plcId] || [];
  const ul = document.querySelector("#sidePanelContent .ecl-unordered-list");
  if (ul) {
    ul.innerHTML = bullets
      .map(b => `
<li class="ecl-unordered-list__item ecl-u-type-s">
                                                        ${b}
</li>
`)
      .join("");
  }
  // Populate "Related knowledge and communities" links from plcRelatedMap,
  // separated by vertical bars; hide the whole section (divider + title +
  // links) when there is nothing to show
  const relatedIds = plcRelatedMap[d.plcId] || [];
  const relatedInfos = relatedIds.map(id => plcInfoMap[id]).filter(Boolean);
  const relatedSection = document.getElementById("sidePanelRelatedSection");
  const relatedContainer = document.getElementById("sidePanelRelated");
  if (relatedSection) {
    relatedSection.classList.toggle("ecl-u-d-none", relatedInfos.length === 0);
  }
  // Separator is drawn as a left border on every item but the first, so the
  // pipe is never read out as text. Padding sits on both sides of that border
  // to keep the gap symmetrical around it.
  if (relatedContainer) {
    // Every item but the first carries the separator on its left edge
    const separatorClasses =
      "ecl-u-pl-xs ecl-u-border-left ecl-u-border-width-2 ecl-u-border-color-monochrome-400";
    // Items without a link are kept as plain text rather than dropped: the
    // related record is still worth naming, and an <a href="#"> would look
    // clickable while only jumping the page to the top
    relatedContainer.innerHTML = relatedInfos
      .map((info, i) => {
        const itemClasses = `ecl-u-pr-xs${i > 0 ? " " + separatorClasses : ""}`;
        // ECL typography comes from the classes, not from an inherited body
        // rule: ecl-link carries its own family and size, so a bare <span>
        // would fall back to the browser default next to the linked items
        const content = info.plcLink
          ? `<a href="${info.plcLink}" class="ecl-link ecl-link--standalone">${info.plcLabel}</a>`
          : `<span class="ecl-u-type-s">${info.plcLabel}</span>`;
        return `
<li class="${itemClasses}">
                                                        ${content}
</li>
`;
      })
      .join("");
  }
  // Update "Find out more", or hide the whole block when the record has no
  // link: a "#" href reads as clickable but only jumps the page to the top.
  // NOTE: selector must match the class used in the side panel markup
  // (currently .ecl-link--secondary in the HTML).
  const findOutMore = document.querySelector(
    "#sidePanelContent .ecl-link--secondary",
  );
  const findOutMoreWrapper = document.getElementById("sidePanelFindOutMore");
  if (findOutMore) {
    // Dropping the href also takes the link out of the panel's focus trap,
    // which matches on a[href]
    if (d.plcLink) findOutMore.href = d.plcLink;
    else findOutMore.removeAttribute("href");
  }
  if (findOutMoreWrapper) {
    // Both display utilities are toggled, never left on at once: they carry the
    // same specificity, so with both present the winner is decided by their
    // order in the ECL stylesheet rather than by what was added last
    const hasPlcLink = Boolean(d.plcLink);
    findOutMoreWrapper.classList.toggle("ecl-u-d-flex", hasPlcLink);
    findOutMoreWrapper.classList.toggle("ecl-u-d-none", !hasPlcLink);
  }
  // Remember the opener before moving focus, so Escape/close can return there.
  // Only on a fresh open: reopening for another PLC must not store an element
  // inside the panel itself.
  if (!isPanelOpen()) {
    panelOpener =
      document.activeElement !== document.body ? document.activeElement : null;
  }
  // Width caps at 700px, but shrinks to fill narrower viewports
  const width = getSidePanelWidth();
  panel.style.width = `${width}px`;
  panelInner.style.width = `${width}px`;
  updateSidePanelHeaderLayout(width);
  panel.removeAttribute("inert");
  // preventScroll keeps the browser from scrolling the panel into view: it is
  // anchored near the top of #vizWrapper, so on a tall canvas (Network view)
  // focusing it would yank the page up and away from the dot just clicked
  panel.focus({preventScroll: true});
  overlay.style.display = "block";
  requestAnimationFrame(() => {
    overlay.style.opacity = "1";
  });
}
// restoreFocus is false when the panel closes as a side effect of another
// action that has already moved focus itself (e.g. switching view from the
// toggle buttons); returning focus to the opener would then pull it off the
// control the user just operated.
function closeSidePanel(restoreFocus = true) {
  const panel = document.getElementById("sidePanel");
  const overlay = document.getElementById("vizOverlay");
  panel.style.width = "0";
  panel.setAttribute("inert", "");
  overlay.style.opacity = "0";
  setTimeout(() => {
    overlay.style.display = "none";
  }, 400);
  // Return focus where it was, so keyboard users are not dropped at the top
  // of the document
  if (panelOpener) {
    if (restoreFocus) panelOpener.focus();
    panelOpener = null;
  }
}
// Clicking empty graph space (not a PLC dot) clears any pinned network
// highlight. Network only: clearHighlight hides the per-topic duplicates,
// which the Topics view needs visible.
document.getElementById("graph").addEventListener("click", e => {
  if (vizState !== "Network") return;
  if (e.target.tagName !== "circle") {
    if (networkSelsRef) networkSelsRef.clearHighlight();
  }
});
document.addEventListener("click", e => {
  if (e.target.closest("#closePanel")) closeSidePanel();
});
// Wrapped so the click event is not passed as closeSidePanel's first argument
document
  .getElementById("vizOverlay")
  .addEventListener("click", () => closeSidePanel());
// Escape closes the panel; Tab cycles within it so focus cannot reach the page
// behind the modal
document.addEventListener("keydown", e => {
  if (!isPanelOpen()) return;
  if (e.key === "Escape") {
    closeSidePanel();
    return;
  }
  if (e.key !== "Tab") return;
  const focusables = getPanelFocusables();
  if (focusables.length === 0) {
    e.preventDefault();
    return;
  }
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const active = document.activeElement;
  const panel = document.getElementById("sidePanel");
  if (e.shiftKey && (active === first || active === panel)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
});
// Keep the panel width correct if the viewport is resized while it's open
window.addEventListener("resize", () => {
  if (!isPanelOpen()) return;
  const panel = document.getElementById("sidePanel");
  const width = getSidePanelWidth();
  panel.style.width = `${width}px`;
  document.getElementById("sidePanelInner").style.width = `${width}px`;
  updateSidePanelHeaderLayout(width);
});
///////////////////////////////////////////////////////////////////////////////
// LAYOUT
///////////////////////////////////////////////////////////////////////////////
// Put the view buttons in a column on the left and the chart on the right.
// #vizLayout's height is capped to the viewport in CSS, so init() can size
// every view to fit on screen. Runs once, before init() measures #graph.
function setupVizLayout() {
  if (document.getElementById("vizLayout")) return;
  const buttons = document.getElementById("vizToggleButtons");
  const wrapper = document.getElementById("vizWrapper");
  const layout = document.createElement("div");
  layout.id = "vizLayout";
  wrapper.parentNode.insertBefore(layout, wrapper);
  layout.append(buttons, wrapper);
}
///////////////////////////////////////////////////////////////////////////////
// KC POPOVER ("All" view)
///////////////////////////////////////////////////////////////////////////////
// Clicking a KC name around the star opens a list of that KC's PLCs next to
// the click; picking one opens the side panel. While it is open the KC stays
// highlighted in the chart.
let popoverKcId = null;
// Dim every PLC and KC label outside kcId, or restore them all when null
function highlightAllKc(kcId) {
  d3.selectAll(".plcs").style("opacity", d => {
    if (!d.isGlobalPrimary) return 0;
    return kcId === null || d.kcId === kcId ? 1 : DIM_OPACITY;
  });
  d3.selectAll(".kcLabels").style("opacity", d =>
    kcId === null || d.kcId === kcId ? 1 : DIM_OPACITY,
  );
}
function closeKcPopover() {
  const popover = document.getElementById("kcPopover");
  if (popover) popover.remove();
  if (popoverKcId === null) return;
  popoverKcId = null;
  if (vizState === "All") highlightAllKc(null);
}
function openKcPopover(kc, event, color) {
  if (popoverKcId === kc.kcId) {
    closeKcPopover();
    return;
  }
  closeKcPopover();
  popoverKcId = kc.kcId;
  highlightAllKc(kc.kcId);
  // The PLC records drawn in the "All" view for this KC (one per PLC)
  const records = d3
    .selectAll(".plcs")
    .data()
    .filter(d => d.isGlobalPrimary && d.kcId === kc.kcId);
  // Built with textContent, not innerHTML: labels come from the CSVs
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };
  const popover = el("div", "kc-popover");
  popover.id = "kcPopover";
  popover.setAttribute("role", "dialog");
  popover.setAttribute("aria-label", kc.kcLabel);
  popover.style.setProperty("--kc-color", color);
  const header = el("div", "kc-popover__header");
  const heading = el("div");
  heading.append(
    el("p", "kc-popover__eyebrow", `Knowledge community · ${records.length}`),
    el("p", "kc-popover__title", kc.kcLabel),
  );
  const close = el("button", "kc-popover__close", "×");
  close.type = "button";
  close.setAttribute("aria-label", "Close");
  close.addEventListener("click", closeKcPopover);
  header.append(heading, close);
  const list = el("ul", "kc-popover__list");
  records.forEach(d => {
    const item = el("li");
    const button = el("button", "kc-popover__item");
    button.type = "button";
    button.append(el("span", "kc-popover__dot"));
    const text = el("span");
    text.append(el("span", "kc-popover__label", d.plcLabel));
    if (d.plcIntroText) text.append(el("span", "kc-popover__intro", d.plcIntroText));
    button.append(text);
    button.addEventListener("click", e => {
      e.stopPropagation();
      closeKcPopover();
      openSidePanel(d);
    });
    item.append(button);
    list.append(item);
  });
  popover.append(header, list);
  if (records[0] && records[0].kcLink) {
    const link = el("a", "kc-popover__link", "Visit the knowledge community");
    link.href = records[0].kcLink;
    popover.append(link);
  }
  // Placed next to the click inside #vizWrapper, then nudged back in if it
  // would overflow the wrapper's right or bottom edge.
  const wrapper = document.getElementById("vizWrapper");
  wrapper.append(popover);
  const box = wrapper.getBoundingClientRect();
  const gap = 12;
  let left = event.clientX - box.left + gap;
  let top = event.clientY - box.top + gap;
  if (left + popover.offsetWidth > box.width - gap)
    left = event.clientX - box.left - popover.offsetWidth - gap;
  if (top + popover.offsetHeight > box.height - gap)
    top = box.height - popover.offsetHeight - gap;
  popover.style.left = `${Math.max(gap, left)}px`;
  popover.style.top = `${Math.max(gap, top)}px`;
  list.querySelector("button")?.focus({preventScroll: true});
}
document.addEventListener("click", e => {
  if (!e.target.closest("#kcPopover")) closeKcPopover();
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && document.getElementById("kcPopover")) closeKcPopover();
});
///////////////////////////////////////////////////////////////////////////////
// MODULE-LEVEL STATE
///////////////////////////////////////////////////////////////////////////////
// A PLC can appear in several topics, so enrichedData holds duplicate records
// (one per topic). Two flags decide which duplicate actually renders:
//   isGlobalPrimary — the single record drawn in the "All" view
//   isTopicPrimary  — the single record drawn within each topic ("Topics" view)
// Duplicates stay in the DOM for smooth transitions but are hidden via opacity
// unless they are the relevant primary for the current state.
// vizState drives every layout/transition branch:
//   "All"     — every PLC once, in a single shared star grouped by KC
//   "Topics"  — PLCs scattered into per-topic stars (duplicated across topics)
//   "Network" — three-column topic › KC › PLC node-link diagram
const COLORS = [
  "#d1f586",
  "#aafd21",
  "#71a92f",
  "#b5fb82",
  "#80ff54",
  "#b9f9a3",
  "#74a66c",
  "#02d53f",
  "#00b65c",
  "#01ec84",
  "#24ae7d",
  "#1cffbe",
  "#7bbaa0",
  "#b3f6dc",
  "#7cffd8",
  "#01b09c",
  "#01e9d7",
  "#02aad3",
  "#8bd1ff",
  "#799adb",
  "#c37ee5",
  "#e7b0ff",
  "#ff9ade",
  "#ff6dab",
  "#fc6d50",
  "#ffc39c",
  "#cb8c5f",
  "#ff8e0b",
  "#ffaf4c",
  "#ffac33",
  "#c19149",
  "#ffd87c",
  "#b59829",
  "#fce6ad",
  "#ffe754",
  "#acba00",
  "#e5f15d",
];
const backgroundColor = "#00002e";
// SVG text cannot inherit ECL's typography the way HTML does, so the family is
// declared explicitly on every label. Matches the EC theme's font stack.
const FONT_FAMILY = "Arial, sans-serif";
const DIM_OPACITY = 0.4;
// Opacity applied to everything not connected to the highlighted node in the
// Network view. Split per element type because links, filled nodes and pie
// charts do not read as equally faded at the same value: a hairline stroke
// disappears well before a filled circle does.
const NET_DIM_LINK = 0.15;
const NET_DIM_KC = 0.25;
const NET_DIM_PLC = 0.25;
const NET_DIM_TOPIC = 0.35;
let networkSelsRef = null;
// Users who ask their OS to reduce motion get near-instant view switches
// instead of the full 1.5s animation of hundreds of dots. Read at each call so
// the setting is honoured if it changes mid-session.
function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
let cfg = {};
///////////////////////////////////////////////////////////////////////////////
// INIT
///////////////////////////////////////////////////////////////////////////////
function init(files) {
  // ¦¦ Helper: strip BOM and trim whitespace from all CSV row keys/values ¦¦¦¦¦¦
  function normalizeRows(rows) {
    return rows.map(r => {
      const out = {};
      Object.entries(r).forEach(([k, v]) => {
        out[k.trim().replace(/^\uFEFF/, "")] = (v || "").trim();
      });
      return out;
    });
  }
  // ¦¦ Dimensions ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
  // The chart fills the right-hand column of #vizLayout, whose height is capped
  // to the viewport so every view fits on screen without scrolling.
  // svgWidth/svgHeight stay square — the largest square that fits governs the
  // centred All/Topics layouts — while Network uses the whole box.
  setupVizLayout();
  const graphEl = document.getElementById("graph");
  const containerWidth = graphEl.clientWidth;
  const containerHeight = graphEl.clientHeight;
  const svgWidth = Math.min(containerWidth, containerHeight);
  const svgHeight = svgWidth;
  const networkWidth = containerWidth;
  // The view buttons now live in the left column, so no band is reserved for
  // them above the chart.
  const btnAreaHeight = 0;
  // ¦¦ Data ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
  // files are the 7 parsed CSVs in load order: topics, kcs, plcs, topic-kc,
  // kc-plc, plc-plc, plc›briefme. Each is normalized (BOM/whitespace stripped).
  const topics = normalizeRows(files[0]);
  const plcs = normalizeRows(files[2]);
  const topicKc = normalizeRows(files[3]).filter(r => r.topicId && r.kcId);
  const kcPlc = normalizeRows(files[4]).filter(r => r.kcId && r.plcId);
  const plcPlcRows = normalizeRows(files[5]).filter(
    r => r.plcSource && r.plcTarget,
  );
  // Only KCs that actually have PLCs are rendered. The All/Topics stars already
  // derive their KC list from kc-plc, so filtering here keeps the Network view
  // consistent: without it, blank rows in kc.csv and KCs with no PLCs are drawn
  // as isolated nodes (kcNodeData applies no such filter) that also reserve an
  // empty row in kcYMap.
  const kcIdsWithPlc = new Set(kcPlc.map(r => r.kcId));
  const kcs = normalizeRows(files[1]).filter(r => kcIdsWithPlc.has(r.kcId));
  // Build plcId -> {plcLabel, plcLink} lookup, used to render related PLC links
  plcInfoMap = {};
  plcs.forEach(p => {
    plcInfoMap[p.plcId] = {plcLabel: p.plcLabel.trim(), plcLink: p.plcLink};
  });
  // Build plcId -> related plcIds (undirected) from the plc-plc relationships
  plcRelatedMap = {};
  plcPlcRows.forEach(r => {
    if (!plcRelatedMap[r.plcSource]) plcRelatedMap[r.plcSource] = [];
    if (!plcRelatedMap[r.plcTarget]) plcRelatedMap[r.plcTarget] = [];
    plcRelatedMap[r.plcSource].push(r.plcTarget);
    plcRelatedMap[r.plcTarget].push(r.plcSource);
  });
  // Build briefme map: plcId › string[] (bullet points for the side panel)
  plcBriefmeMap = {};
  normalizeRows(files[6])
    .filter(r => r.plcId && r.plcBriefme)
    .forEach(r => {
      if (!plcBriefmeMap[r.plcId]) plcBriefmeMap[r.plcId] = [];
      plcBriefmeMap[r.plcId].push(r.plcBriefme);
    });
  const networkHeight = containerHeight;
  // ¦¦ Shared config ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
  // cfg bundles dimensions, dot sizes (derived from svgHeight so they scale),
  // the chart centre and transition durations. Read by all layout/draw helpers.
  cfg = {
    svgWidth,
    svgHeight,
    networkWidth,
    networkHeight,
    btnAreaHeight,
    marginX: 0,
    plcR: svgHeight * 0.004,
    minStarR: svgHeight * 0.05,
    paddingR: svgHeight * 0.008,
    paddingH: svgHeight * 0.008,
    center: {x: svgWidth / 2, y: svgHeight / 2 + btnAreaHeight},
    // Network sizes: the canvas no longer scales up to 1300px wide, so text and
    // KC nodes get absolute sizes instead of a fraction of svgWidth.
    netFont: Math.max(11, Math.min(15, networkHeight * 0.017)),
    kcR: Math.max(4, svgWidth * 0.006),
    relayoutDuration: prefersReducedMotion() ? 1 : 500,
    // Every layout transition reads these, so reducing them here covers all
    // six prev›target branches in toggleViz at once
    duration: prefersReducedMotion() ? 1 : 1500,
    halfDuration: prefersReducedMotion() ? 1 : 750,
  };
  // Denormalize into one record per (plc, topic) pair — the source for all layouts
  const enrichedData = buildEnrichedData(kcPlc, topicKc, plcs, kcs, topics);
  // Stamp "All" + per-topic polar coordinates onto enrichedData
  const {plcsData, globalDistribution, allPlcsStarR} = formatPlcData(
    enrichedData,
    topics,
    kcs,
  );
  // Stamp networkX / networkY onto enrichedData in-place
  const networkLayout = computeNetworkCoords(enrichedData, kcs, topics);
  const kcsData = formatKcsData(globalDistribution);
  const dataByTopicId = getDataByTopicId(plcsData, kcs);
  // Stamp topicForceX/Y for the Topics › Network transition
  dataByTopicId.forEach(topic => {
    topic.plcs.forEach(ray =>
      ray.forEach(plc => {
        plc.topicForceX = topic.x;
        plc.topicForceY = topic.y;
      }),
    );
  });
  // Map each KC to a colour, then propagate that colour to every record and
  // to a plcId › colour lookup (a PLC takes the colour of its first KC).
  const kcColorScale = d3
    .scaleOrdinal()
    .domain(kcs.map(d => d.kcId))
    .range(COLORS);
  enrichedData.forEach(d => {
    d.kcColor = kcColorScale(d.kcId);
  });
  const plcColorMap = {};
  enrichedData.forEach(d => {
    if (!plcColorMap[d.plcId]) plcColorMap[d.plcId] = kcColorScale(d.kcId);
  });
  // ¦¦ SVG scaffold ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
  // viewBox defines the internal coordinate system; width:100% + height:auto
  // make the browser scale everything proportionally to the #graph container.
  // The viewBox is animated (not width/height) when switching to/from Network,
  // since that layout needs the full width and a taller height.
  const svg = d3
    .select("#graph")
    .append("svg")
    .attr("aria-hidden", "true") // Remove this line when the graph is accessible
    .attr("viewBox", `0 0 ${cfg.svgWidth} ${cfg.svgHeight + cfg.btnAreaHeight}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .style("display", "block")
    .style("width", "100%")
    .style("height", "100%")
    .style("user-select", "none");
  // chartContainer is translated to the chart centre, so all layouts use a
  // coordinate system where (0,0) is the middle of the canvas.
  const chartContainer = svg
    .append("g")
    .attr(
      "transform",
      `translate(${cfg.svgWidth / 2}, ${cfg.svgHeight / 2 + cfg.btnAreaHeight})`,
    );
  // ¦¦ Glow filter ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
  // Blurs the source and merges it back underneath, giving dots/nodes a halo.
  const defs = svg.append("defs");
  const filter = defs
    .append("filter")
    .attr("id", "glow")
    .attr("width", "300%")
    .attr("x", "-100%")
    .attr("height", "300%")
    .attr("y", "-100%");
  filter
    .append("feGaussianBlur")
    .attr("class", "blur")
    .attr("stdDeviation", "5")
    .attr("result", "coloredBlur");
  const feMerge = filter.append("feMerge");
  feMerge.append("feMergeNode").attr("in", "coloredBlur");
  feMerge.append("feMergeNode").attr("in", "SourceGraphic");
  // ¦¦ Draw (z-order: network layer first, then PLCs on top) ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
  const networkSels = drawNetworkLayer(
    networkLayout,
    kcPlc,
    topicKc,
    plcPlcRows,
    enrichedData,
    kcColorScale,
    plcColorMap,
    kcs,
    topics,
  );
  networkSelsRef = networkSels;
  drawStars(dataByTopicId, kcsData, allPlcsStarR);
  drawToggleButton();
  updateButtonStates();
  ///////////////////////////////////////////////////////////////////////////////
  // COMPUTE NETWORK COORDINATES
  ///////////////////////////////////////////////////////////////////////////////
  // Stamp networkX/networkY onto every record for the three-column Network layout
  // (topic column › KC column › PLC column) and return the column/row geometry.
  function computeNetworkCoords(enrichedData, kcs, topics) {
    // Network spans the full width (networkWidth), unlike the square All/Topics
    // canvas. Columns are laid out symmetrically around chartContainer's centre.
    const {networkWidth, networkHeight, marginX} = cfg;
    const marginY = networkHeight * 0.05;
    const availW = networkWidth - 2 * marginX;
    const availH = networkHeight - 2 * marginY;
    // Column X positions (relative to chartContainer centre = 0). The fraction
    // for each column also sets the room left for its label: everything to the
    // left of topicX holds the topic names, and the gap between kcX and
    // plcStartX holds the KC names.
    const topicX = -networkWidth / 2 + marginX + availW * 0.28;
    const kcX = -networkWidth / 2 + marginX + availW * 0.45;
    const plcStartX = -networkWidth / 2 + marginX + availW * 0.75;
    // Longest PLC row (PLCs per KC), so spacing can be sized to fit it exactly.
    const plcCountByKc = {};
    enrichedData.forEach(d => {
      const set = (plcCountByKc[d.kcId] ||= new Set());
      set.add(d.plcId);
    });
    const maxPlcsInRow = Math.max(
      1,
      ...Object.values(plcCountByKc).map(s => s.size),
    );
    // Right edge with a small safety pad so the last dot never touches the border.
    const plcRightEdge = networkWidth / 2 - marginX - networkWidth * 0.02;
    const plcAvailW = plcRightEdge - plcStartX;
    // Spacing tied to the dot size keeps dots visually consistent at any width;
    // capped by the available row width so a long row still fits to the edge.
    const plcSpacing = Math.min(
      cfg.plcR * 3.5,
      plcAvailW / Math.max(1, maxPlcsInRow - 1),
    );
    // Row Y positions: topics spread evenly down their column; KC rows are
    // placed by layout() below, since selecting a KC makes room under it.
    const kcYMap = {};
    const topicYMap = {};
    topics.forEach((top, i) => {
      topicYMap[top.topicId] =
        -networkHeight / 2 + marginY + (availH * (i + 0.5)) / topics.length;
    });
    // Index of each PLC within its KC (first occurrence sets its column slot)
    const plcIndexByKc = {};
    kcs.forEach(kc => {
      plcIndexByKc[kc.kcId] = new Map();
    });
    enrichedData.forEach(d => {
      const m = plcIndexByKc[d.kcId];
      if (m && !m.has(d.plcId)) m.set(d.plcId, m.size);
    });
    // A selected (expanded) KC lists its PLCs underneath it, one row each: the
    // dot sits under the start of the KC label and its title follows it.
    const plcRowX = kcX + cfg.kcR + 12 + cfg.plcR;
    // Stamp KC row positions and PLC positions onto enrichedData for the given
    // expanded KC (or none). Every row — KC or expanded PLC — gets the same
    // height, so the column always fits the canvas without scrolling.
    function layout(expandedKcId) {
      const expanded = expandedKcId
        ? [...(plcIndexByKc[expandedKcId] || new Map()).keys()]
        : [];
      const rowH = availH / (kcs.length + expanded.length);
      const plcRowY = {};
      let y = -networkHeight / 2 + marginY + rowH / 2;
      kcs.forEach(kc => {
        kcYMap[kc.kcId] = y;
        y += rowH;
        if (kc.kcId !== expandedKcId) return;
        expanded.forEach(plcId => {
          plcRowY[plcId] = y;
          y += rowH;
        });
      });
      enrichedData.forEach(d => {
        if (d.kcId === expandedKcId) {
          d.networkX = plcRowX;
          d.networkY = plcRowY[d.plcId];
          return;
        }
        const m = plcIndexByKc[d.kcId];
        const idx = m ? (m.get(d.plcId) ?? 0) : 0;
        d.networkX = plcStartX + idx * plcSpacing;
        d.networkY = kcYMap[d.kcId] ?? 0;
      });
    }
    layout(null);
    return {topicX, kcX, plcStartX, plcRowX, kcYMap, topicYMap, layout};
  }
  ///////////////////////////////////////////////////////////////////////////////
  // DRAW NETWORK LAYER
  ///////////////////////////////////////////////////////////////////////////////
  // Build the (initially hidden) Network layer: topic›KC and KC›PLC links, PLC-PLC
  // arcs, KC nodes and topic pie charts, plus hover/click highlight behaviour.
  // Returns handles the PLC dots use to drive highlighting from the star layer.
  function drawNetworkLayer(
    networkLayout,
    kcPlc,
    topicKc,
    plcPlcRows,
    enrichedData,
    kcColorScale,
    plcColorMap,
    kcs,
    topics,
  ) {
    const {topicX, kcX, plcStartX, plcRowX, kcYMap, topicYMap, layout} =
      networkLayout;
    const {networkWidth, svgWidth, marginX, kcR, netFont} = cfg;
    const pieR = svgWidth * 0.018;
    // Click "pins" a highlight; while pinned, hover is ignored. Stores a
    // re-applier fn for the pinned element, or null when nothing is pinned.
    let pinnedHighlight = null;
    // KC whose PLCs are listed underneath it (one row each), or null
    let expandedKc = null;
    const layer = chartContainer
      .append("g")
      .attr("id", "networkLayer")
      .style("opacity", 0)
      .style("pointer-events", "none");
    // ¦¦ Lookups ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
    // Adjacency maps used by the highlight functions to find connected nodes.
    const kcsWithPlc = new Set(kcPlc.map(r => r.kcId));
    const topToKc = {};
    topics.forEach(t => (topToKc[t.topicId] = []));
    topicKc.forEach(r => {
      if (topToKc[r.topicId] && kcsWithPlc.has(r.kcId))
        topToKc[r.topicId].push(r.kcId);
    });
    const kcToTop = {};
    kcs.forEach(k => (kcToTop[k.kcId] = []));
    topicKc.forEach(r => {
      if (kcToTop[r.kcId]) kcToTop[r.kcId].push(r.topicId);
    });
    const kcToPlc = {};
    kcPlc.forEach(r => {
      if (!kcToPlc[r.kcId]) kcToPlc[r.kcId] = [];
      kcToPlc[r.kcId].push(r.plcId);
    });
    const plcToKc = {};
    kcPlc.forEach(r => {
      if (!plcToKc[r.plcId]) plcToKc[r.plcId] = [];
      plcToKc[r.plcId].push(r.kcId);
    });
    const plcNeighbors = {};
    plcPlcRows.forEach(r => {
      if (!plcNeighbors[r.plcSource]) plcNeighbors[r.plcSource] = [];
      if (!plcNeighbors[r.plcTarget]) plcNeighbors[r.plcTarget] = [];
      plcNeighbors[r.plcSource].push(r.plcTarget);
      plcNeighbors[r.plcTarget].push(r.plcSource);
    });
    // Unique position per plcId (first occurrence). Refreshed in place by
    // relayout(), so everything below reads positions through this map.
    const plcPosMap = {};
    function refreshPlcPos() {
      Object.keys(plcPosMap).forEach(id => delete plcPosMap[id]);
      enrichedData.forEach(d => {
        if (!plcPosMap[d.plcId])
          plcPosMap[d.plcId] = {x: d.networkX, y: d.networkY};
      });
    }
    refreshPlcPos();
    // ¦¦ Gradients for PLC-PLC arcs ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
    // Each arc fades from its source PLC colour to its target PLC colour, so one
    // linear gradient is created per link and referenced by id.
    const plcLinkData = plcPlcRows
      .map((r, i) => {
        if (!plcPosMap[r.plcSource] || !plcPosMap[r.plcTarget]) return null;
        const grad = defs
          .append("linearGradient")
          .attr("id", `net-plc-grad-${i}`)
          .attr("gradientUnits", "userSpaceOnUse");
        grad
          .append("stop")
          .attr("offset", "0%")
          .attr("stop-color", plcColorMap[r.plcSource] || "#fff");
        grad
          .append("stop")
          .attr("offset", "100%")
          .attr("stop-color", plcColorMap[r.plcTarget] || "#fff");
        return {
          grad,
          idA: r.plcSource,
          idB: r.plcTarget,
          gradId: `net-plc-grad-${i}`,
        };
      })
      .filter(Boolean);
    function placeGradients() {
      plcLinkData.forEach(d => {
        const sa = plcPosMap[d.idA];
        const sb = plcPosMap[d.idB];
        d.grad
          .attr("x1", sa.x)
          .attr("y1", sa.y)
          .attr("x2", sb.x)
          .attr("y2", sb.y);
      });
    }
    placeGradients();
    // ¦¦ Link paths ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
    // Computed from the current kcYMap / plcPosMap, so a relayout only has to
    // re-run them.
    // Cubic bézier from the topic column to the KC column. Links run edge to
    // edge, not centre to centre: when a highlight fades the nodes out, links
    // drawn to the centre show through and read as crossing the nodes instead
    // of connecting them.
    function topKcPath(d) {
      const sx = topicX + pieR;
      const sy = topicYMap[d.topId];
      const tx = kcX - kcR;
      const ty = kcYMap[d.kcId];
      const mx = (sx + tx) / 2;
      return `M${sx},${sy} C${mx},${sy} ${mx},${ty} ${tx},${ty}`;
    }
    // Bézier from the KC to its PLC's slot in the PLC column; for the expanded
    // KC, a tree branch dropping from the KC node to each listed PLC instead.
    function kcPlcPath(d) {
      const pos = plcPosMap[d.plcId];
      const ky = kcYMap[d.kcId];
      if (d.kcId === expandedKc) {
        const r = Math.min(6, Math.abs(pos.y - ky) / 2);
        return `M${kcX},${ky + kcR} V${pos.y - r} Q${kcX},${pos.y} ${kcX + r},${pos.y} H${pos.x - cfg.plcR}`;
      }
      const sx = kcX + kcR;
      const tx = pos.x - cfg.plcR;
      const mx = (sx + tx) / 2;
      return `M${sx},${ky} C${mx},${ky} ${mx},${pos.y} ${tx},${pos.y}`;
    }
    // Same-row pairs get a shallow quadratic bow, others a wider arc.
    function plcArcPath(d) {
      const {x: x1, y: y1} = plcPosMap[d.idA],
        {x: x2, y: y2} = plcPosMap[d.idB];
      if (Math.abs(y1 - y2) < 2) {
        const mx = (x1 + x2) / 2;
        return `M${x1},${y1} Q${mx},${y1 + 15} ${x2},${y2}`;
      }
      const cx = Math.max(x1, x2) + 40;
      return `M${x1},${y1} C${cx},${y1} ${cx},${y2} ${x2},${y2}`;
    }
    // ¦¦ Links topic › KC ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
    // Cubic bézier from the topic column to the KC column, coloured by KC.
    // Links run edge to edge, not centre to centre: when a highlight fades the
    // nodes out, links drawn to the centre show through and read as crossing
    // the nodes instead of connecting them.
    const linkTopKcData = [];
    topicKc.forEach(r => {
      if (topicYMap[r.topicId] === undefined) return;
      if (kcYMap[r.kcId] === undefined) return;
      if (!kcsWithPlc.has(r.kcId)) return;
      linkTopKcData.push({
        color: kcColorScale(r.kcId),
        topId: r.topicId,
        kcId: r.kcId,
      });
    });
    const linkTopKcSel = layer
      .append("g")
      .selectAll("path")
      .data(linkTopKcData)
      .join("path")
      .attr("d", topKcPath)
      .attr("stroke", d => d.color)
      .attr("stroke-width", 2)
      .attr("stroke-opacity", 0.35)
      .attr("fill", "none");
    // ¦¦ Links KC › PLC ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
    // Cubic bézier from the KC column to each PLC's slot in the PLC column.
    const linkKcPlcData = kcPlc
      .map(r => {
        if (!plcPosMap[r.plcId] || kcYMap[r.kcId] === undefined) return null;
        return {
          color: kcColorScale(r.kcId),
          kcId: r.kcId,
          plcId: r.plcId,
        };
      })
      .filter(Boolean);
    const linkKcPlcGroup = layer.append("g");
    const linkKcPlcSel = linkKcPlcGroup
      .selectAll("path")
      .data(linkKcPlcData)
      .join("path")
      .attr("d", kcPlcPath)
      .attr("stroke", d => d.color)
      .attr("stroke-width", 1.5)
      .attr("stroke-opacity", 0.25)
      .attr("fill", "none");
    // ¦¦ PLC-PLC arcs ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
    // Curved connectors between related PLCs; hidden (opacity 0) until a PLC is
    // highlighted. Same-row pairs get a shallow quadratic bow, others a wider arc.
    const plcArcSel = layer
      .append("g")
      .selectAll("path")
      .data(plcLinkData)
      .join("path")
      .attr("d", plcArcPath)
      .attr("stroke", d => `url(#${d.gradId})`)
      .attr("stroke-width", 1.8)
      .attr("stroke-opacity", 0)
      .attr("fill", "none");
    // ¦¦ KC nodes ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
    // One glowing circle per KC that has PLCs; hover/click highlights its row.
    const kcNodeData = kcs
      .filter(k => kcYMap[k.kcId] !== undefined)
      .map(k => ({
        id: k.kcId,
        short: k.kcLabel,
        x: kcX,
        color: kcColorScale(k.kcId),
      }));
    // Clicking a KC selects it: its PLCs unfold underneath, one row each, and
    // the highlight is pinned. Clicking it again folds it back.
    function selectKc(e, d) {
      if (vizState !== "Network") return;
      e.stopPropagation();
      if (expandedKc === d.id) {
        clearHighlight();
        return;
      }
      expandedKc = d.id;
      relayout(true);
      pinnedHighlight = () => highlightKc(d.id);
      highlightKc(d.id);
    }
    const kcCircles = layer
      .append("g")
      .selectAll("circle")
      .data(kcNodeData)
      .join("circle")
      .attr("cx", d => d.x)
      .attr("cy", d => kcYMap[d.id])
      .attr("r", kcR)
      .attr("fill", d => d.color)
      .attr("fill-opacity", 0.9)
      .attr("filter", "url(#glow)")
      .style("cursor", "pointer")
      .on("mouseover", (e, d) => {
        if (vizState === "Network" && !pinnedHighlight) highlightKc(d.id);
      })
      .on("mouseleave", () => {
        if (vizState === "Network") resetHighlight();
      })
      .on("click", selectKc);
    // KC labels: a background rect + text placed to the right of each KC node,
    // truncated to fit the gap before the PLC column, with the full name as a
    // tooltip. Each label is a group positioned at its row, so a relayout only
    // moves the group.
    const kcLabelGroups = layer
      .append("g")
      .selectAll("g")
      .data(kcNodeData)
      .join("g")
      .attr("class", "kcNetLabel")
      .attr("transform", d => `translate(0,${kcYMap[d.id]})`);
    kcLabelGroups.each(function (d) {
      const group = d3.select(this);
      const fontSize = netFont;
      const padX = 4;
      const padY = 2;
      const labelX = d.x + kcR + 12;
      // Available width: from the label start to the PLC column, leaving a
      // gap so the text never collides with the dots. Measured, not capped
      // by character count, so labels use all the room the wide canvas gives.
      const kcLabelMaxW = plcStartX - labelX - 12;
      const fullLabel = d.short;
      // Measure full label; truncate by binary search only if it overflows.
      const tempText = layer
        .append("text")
        .style("font", `${fontSize}px ${FONT_FAMILY}`)
        .attr("visibility", "hidden")
        .text(fullLabel);
      const tempNode = tempText.node();
      let label = fullLabel;
      if (tempNode.getComputedTextLength() > kcLabelMaxW) {
        let lo = 0,
          hi = fullLabel.length;
        while (lo < hi - 1) {
          const mid = Math.floor((lo + hi) / 2);
          tempText.text(fullLabel.slice(0, mid) + "…");
          if (tempNode.getComputedTextLength() <= kcLabelMaxW) lo = mid;
          else hi = mid;
        }
        label = fullLabel.slice(0, lo) + "…";
      }
      // Final width of the (possibly truncated) label, for the background rect.
      tempText.text(label);
      const textWidth = tempNode.getComputedTextLength();
      tempText.remove();
      group
        .append("rect")
        .attr("x", labelX - padX)
        .attr("y", 4 - fontSize * 0.75 - padY)
        .attr("width", textWidth + padX * 2)
        .attr("height", fontSize + padY * 2)
        .attr("rx", 2)
        .attr("fill", backgroundColor)
        .attr("fill-opacity", 0.75);
      group
        .append("text")
        .attr("x", labelX)
        .attr("y", 4)
        .style("font", `${fontSize}px ${FONT_FAMILY}`)
        .attr("fill", "#aaa")
        .text(label)
        .style("cursor", "pointer")
        .on("mouseover", () => {
          if (vizState === "Network" && !pinnedHighlight) highlightKc(d.id);
        })
        .on("mouseleave", () => {
          if (vizState === "Network") resetHighlight();
        })
        .on("click", e => selectKc(e, d))
        .append("title")
        .text(fullLabel);
    });
    // ¦¦ Expanded PLC rows ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
    // One title per PLC, shown next to its dot only while its KC is expanded.
    // Clicking the title opens the side panel, like clicking the dot.
    const plcRowRecords = enrichedData.filter(d => d.isGlobalPrimary);
    const plcTitleX = plcRowX + cfg.plcR + 10;
    const plcTitleMaxW =
      networkWidth / 2 - marginX - networkWidth * 0.02 - plcTitleX;
    const plcRowLabels = layer
      .append("g")
      .selectAll("text")
      .data(plcRowRecords)
      .join("text")
      .attr("class", "plcRowLabel")
      .attr("x", plcTitleX)
      .attr("y", d => plcPosMap[d.plcId].y + 4)
      .style("font", `${netFont}px ${FONT_FAMILY}`)
      .attr("fill", "#e6e6f0")
      .style("cursor", "pointer")
      .style("opacity", 0)
      .style("pointer-events", "none")
      .text(d => d.plcLabel)
      .on("mouseover", function () {
        d3.select(this).attr("fill", "#fff").style("text-decoration", "underline");
      })
      .on("mouseleave", function () {
        d3.select(this).attr("fill", "#e6e6f0").style("text-decoration", null);
      })
      .on("click", (e, d) => {
        e.stopPropagation();
        openSidePanel(d);
      })
      .each(function (d) {
        const el = d3.select(this);
        const node = this;
        const full = d.plcLabel;
        if (node.getComputedTextLength() > plcTitleMaxW) {
          let lo = 0,
            hi = full.length;
          while (lo < hi - 1) {
            const mid = Math.floor((lo + hi) / 2);
            el.text(full.slice(0, mid) + "…");
            if (node.getComputedTextLength() <= plcTitleMaxW) lo = mid;
            else hi = mid;
          }
          el.text(full.slice(0, lo) + "…");
        }
        el.append("title").text(full);
      });
    // ¦¦ Relayout ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
    // Re-place every row for the current expandedKc. KC nodes, labels, topic
    // links and dots slide to their new rows; the KC›PLC links change shape
    // (bézier vs tree branch), which cannot be tweened, so that group fades
    // out and back in around the move. moveDots is false when leaving the
    // Network view, whose own transition is about to move the dots.
    function relayout(animate, moveDots = true) {
      layout(expandedKc);
      refreshPlcPos();
      const duration = animate ? cfg.relayoutDuration : 0;
      const tr = sel => sel.transition().duration(duration);
      tr(kcCircles).attr("cy", d => kcYMap[d.id]);
      tr(kcLabelGroups).attr("transform", d => `translate(0,${kcYMap[d.id]})`);
      kcLabelGroups
        .select("text")
        .attr("fill", d => (d.id === expandedKc ? "#fff" : "#aaa"))
        .style("font-weight", d => (d.id === expandedKc ? "bold" : null));
      tr(linkTopKcSel).attr("d", topKcPath);
      linkKcPlcGroup.interrupt().style("opacity", animate ? 0 : 1);
      linkKcPlcSel.attr("d", kcPlcPath);
      if (animate)
        linkKcPlcGroup.transition().delay(duration).duration(250).style("opacity", 1);
      placeGradients();
      plcArcSel.attr("d", plcArcPath);
      plcRowLabels
        .attr("y", d => plcPosMap[d.plcId].y + 4)
        .style("pointer-events", d => (d.kcId === expandedKc ? "all" : "none"))
        .interrupt()
        .style("opacity", 0)
        .filter(d => d.kcId === expandedKc)
        .transition()
        .delay(duration)
        .duration(250)
        .style("opacity", 1);
      if (moveDots)
        tr(d3.selectAll(".plcs")).attr(
          "transform",
          d => `translate(${d.networkX},${d.networkY})`,
        );
    }
    // Fold any expanded KC back into its row (no-op when none is expanded)
    function collapse(animate, moveDots = true) {
      if (expandedKc === null) return;
      expandedKc = null;
      relayout(animate, moveDots);
    }
    // ¦¦ Topic pie charts ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
    // Each topic node is a donut whose slices are its KCs (colour-coded); the
    // matching label sits to its left. Hover/click highlights the topic's row.
    const arcFn = d3.arc();
    const pieFn = d3.pie().value(1).sort(null);
    const topPieGroups = new Map();
    topics.forEach(top => {
      const y = topicYMap[top.topicId];
      if (y === undefined) return;
      const kcList = topToKc[top.topicId] || [];
      const g = layer
        .append("g")
        .attr("transform", `translate(${topicX},${y})`)
        .attr("filter", "url(#glow)")
        .style("cursor", "pointer");
      topPieGroups.set(top.topicId, g);
      g.on("mouseover", () => {
        if (vizState === "Network" && !pinnedHighlight)
          highlightTopic(top.topicId);
      })
        .on("mouseleave", () => {
          if (vizState === "Network") resetHighlight();
        })
        .on("click", e => {
          if (vizState !== "Network") return;
          e.stopPropagation();
          collapse(true);
          pinnedHighlight = () => highlightTopic(top.topicId);
          highlightTopic(top.topicId);
        });
      // Donut slices (grey placeholder slice when the topic has no KCs)
      pieFn(kcList.length ? kcList : ["__none__"]).forEach(a => {
        g.append("path")
          .attr(
            "d",
            arcFn({
              innerRadius: pieR * 0.55,
              outerRadius: pieR,
              startAngle: a.startAngle,
              endAngle: a.endAngle,
            }),
          )
          .attr("fill", a.data === "__none__" ? "#555" : kcColorScale(a.data))
          .attr("fill-opacity", 0.95)
          .attr("stroke", "#00002E")
          .attr("stroke-width", 0.8);
      });
      g.append("circle")
        .attr("r", pieR * 0.5)
        .attr("fill", "#00002E")
        .attr("stroke", "rgba(255,255,255,0.12)")
        .attr("stroke-width", 0.5);
      g.append("circle")
        .attr("r", pieR)
        .attr("fill", "none")
        .attr("stroke", "rgba(255,255,255,0.12)")
        .attr("stroke-width", 0.5);
      // Available width: from the label origin (left of the pie) to the left
      // edge of the Network canvas (networkWidth, not the capped svgWidth).
      const labelOriginX = topicX - pieR - 8;
      const topicLabelMaxW = labelOriginX - (-networkWidth / 2 + marginX);
      layer
        .append("text")
        .attr("x", labelOriginX)
        .attr("y", y + 4)
        .attr("text-anchor", "end")
        .style("font", `${netFont}px ${FONT_FAMILY}`)
        .attr("fill", "#aaa")
        .text(top.topicLabel)
        .style("cursor", "pointer")
        .on("mouseover", () => {
          if (vizState === "Network" && !pinnedHighlight)
            highlightTopic(top.topicId);
        })
        .on("mouseleave", () => {
          if (vizState === "Network") resetHighlight();
        })
        .on("click", e => {
          if (vizState !== "Network") return;
          e.stopPropagation();
          collapse(true);
          pinnedHighlight = () => highlightTopic(top.topicId);
          highlightTopic(top.topicId);
        })
        .each(function () {
          // Truncate by measured width, not character count, so the label uses
          // all available horizontal space before an ellipsis is added.
          const el = d3.select(this);
          const node = this;
          const full = el.text();
          if (node.getComputedTextLength() <= topicLabelMaxW) {
            el.append("title").text(full);
            return;
          }
          let lo = 0,
            hi = full.length;
          while (lo < hi - 1) {
            const mid = Math.floor((lo + hi) / 2);
            el.text(full.slice(0, mid) + "…");
            if (node.getComputedTextLength() <= topicLabelMaxW) lo = mid;
            else hi = mid;
          }
          el.text(full.slice(0, lo) + "…");
          el.append("title").text(full);
        });
    });
    // ¦¦ Highlight functions ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
    // Each focuses one node type, dimming everything not connected to it: links
    // by endpoint, KC nodes/topic pies by membership, PLC dots by opacity.
    // Highlight a topic: its KCs, their PLCs, and the topic›KC links.
    function highlightTopic(topId) {
      const activeKcs = new Set(topToKc[topId] || []);
      const activePlcs = new Set();
      activeKcs.forEach(kcId =>
        (kcToPlc[kcId] || []).forEach(id => activePlcs.add(id)),
      );
      linkTopKcSel
        .attr("stroke-opacity", d => (d.topId === topId ? 0.9 : NET_DIM_LINK))
        .attr("stroke-width", d => (d.topId === topId ? 3.5 : 2));
      linkKcPlcSel
        .attr("stroke-opacity", d =>
          activeKcs.has(d.kcId) ? 0.8 : NET_DIM_LINK,
        )
        .attr("stroke-width", d => (activeKcs.has(d.kcId) ? 3 : 1.5));
      plcArcSel.attr("stroke-opacity", 0);
      kcCircles
        .attr("fill-opacity", d => (activeKcs.has(d.id) ? 1 : NET_DIM_KC))
        .attr("r", d => (activeKcs.has(d.id) ? kcR + 2 : kcR));
      // Only the global primary of each PLC is drawn; duplicates share the same
      // position, so showing them would stack the glow and look brighter.
      d3.selectAll(".plcs").style("opacity", d =>
        !d.isGlobalPrimary ? 0 : activePlcs.has(d.plcId) ? 1 : NET_DIM_PLC,
      );
      topPieGroups.forEach((g, id) =>
        g.attr("opacity", id === topId ? 1 : NET_DIM_TOPIC),
      );
    }
    // Highlight a KC: its topics, its PLCs, and the links on both sides.
    function highlightKc(kcId) {
      const activeTops = new Set(kcToTop[kcId] || []);
      const activePlcs = new Set(kcToPlc[kcId] || []);
      linkTopKcSel
        .attr("stroke-opacity", d => (d.kcId === kcId ? 0.9 : NET_DIM_LINK))
        .attr("stroke-width", d => (d.kcId === kcId ? 3.5 : 2));
      linkKcPlcSel
        .attr("stroke-opacity", d => (d.kcId === kcId ? 0.8 : NET_DIM_LINK))
        .attr("stroke-width", d => (d.kcId === kcId ? 3 : 1.5));
      plcArcSel.attr("stroke-opacity", 0);
      kcCircles
        .attr("fill-opacity", d => (d.id === kcId ? 1 : NET_DIM_KC))
        .attr("r", d => (d.id === kcId ? kcR + 2 : kcR));
      // Only the global primary of each PLC is drawn; duplicates share the same
      // position, so showing them would stack the glow and look brighter.
      d3.selectAll(".plcs").style("opacity", d =>
        !d.isGlobalPrimary ? 0 : activePlcs.has(d.plcId) ? 1 : NET_DIM_PLC,
      );
      topPieGroups.forEach((g, id) =>
        g.attr("opacity", activeTops.has(id) ? 1 : NET_DIM_TOPIC),
      );
    }
    // Highlight a PLC: its plc-plc neighbours and arcs, plus the KCs/topics it
    // belongs to (and the links connecting them).
    function highlightPlc(plcId) {
      const neighbors = new Set(plcNeighbors[plcId] || []);
      // KC(s) this PLC belongs to, and the topics linked to those KCs.
      const activeKcs = new Set(plcToKc[plcId] || []);
      const activeTops = new Set();
      activeKcs.forEach(kcId =>
        (kcToTop[kcId] || []).forEach(t => activeTops.add(t)),
      );
      plcArcSel.attr("stroke-opacity", d =>
        d.idA === plcId || d.idB === plcId ? 0.85 : 0,
      );
      // Only the global primary of each PLC is drawn; duplicates share the same
      // position, so showing them would stack the glow and look brighter.
      d3.selectAll(".plcs").style("opacity", d =>
        !d.isGlobalPrimary
          ? 0
          : d.plcId === plcId
            ? 1
            : neighbors.has(d.plcId)
              ? 0.8
              : NET_DIM_PLC,
      );
      // Light up the PLC's KC links/nodes and the connected topic links/pies.
      linkTopKcSel
        .attr("stroke-opacity", d =>
          activeKcs.has(d.kcId) && activeTops.has(d.topId) ? 0.8 : NET_DIM_LINK,
        )
        .attr("stroke-width", d =>
          activeKcs.has(d.kcId) && activeTops.has(d.topId) ? 3 : 2,
        );
      linkKcPlcSel.attr("stroke-opacity", d =>
        d.plcId === plcId ? 0.8 : NET_DIM_LINK,
      );
      kcCircles
        .attr("fill-opacity", d => (activeKcs.has(d.id) ? 1 : NET_DIM_KC))
        .attr("r", d => (activeKcs.has(d.id) ? kcR + 2 : kcR));
      topPieGroups.forEach((g, id) =>
        g.attr("opacity", activeTops.has(id) ? 1 : NET_DIM_TOPIC),
      );
    }
    // Restore default styling after a hover, unless a highlight is pinned.
    function resetHighlight() {
      if (pinnedHighlight) return; // pinned: ignore hover-out
      linkTopKcSel.attr("stroke-opacity", 0.35).attr("stroke-width", 2);
      linkKcPlcSel.attr("stroke-opacity", 0.25).attr("stroke-width", 1.5);
      plcArcSel.attr("stroke-opacity", 0);
      kcCircles.attr("fill-opacity", 0.9).attr("r", kcR);
      d3.selectAll(".plcs").style("opacity", 1);
      d3.selectAll(".plcs")
        .filter(d => !d.isGlobalPrimary)
        .style("opacity", 0);
      topPieGroups.forEach(g => g.attr("opacity", 1));
    }
    // Force-clear regardless of pin (used when unpinning), folding any
    // expanded KC too. Leaving the Network view passes moveDots = false: the
    // view transition is about to animate the dots itself.
    function clearHighlight(moveDots = true) {
      pinnedHighlight = null;
      collapse(moveDots, moveDots);
      linkTopKcSel.attr("stroke-opacity", 0.35).attr("stroke-width", 2);
      linkKcPlcSel.attr("stroke-opacity", 0.25).attr("stroke-width", 1.5);
      plcArcSel.attr("stroke-opacity", 0);
      kcCircles.attr("fill-opacity", 0.9).attr("r", kcR);
      d3.selectAll(".plcs").style("opacity", 1);
      d3.selectAll(".plcs")
        .filter(d => !d.isGlobalPrimary)
        .style("opacity", 0);
      topPieGroups.forEach(g => g.attr("opacity", 1));
    }
    return {
      highlightPlc,
      resetHighlight,
      clearHighlight,
      isPinned: () => pinnedHighlight !== null,
    };
  }
  ///////////////////////////////////////////////////////////////////////////////
  // DRAW STARS
  ///////////////////////////////////////////////////////////////////////////////
  // Draw the star layouts shared by the "All" and "Topics" views: KC labels around
  // the global star, one dashed circle + name per topic, and the PLC dots arranged
  // along radial rays. Dots carry the click/hover handlers that drive all states.
  function drawStars(dataByTopicId, kcsData, allPlcsStarR) {
    const {plcR, paddingR, paddingH, svgHeight} = cfg;
    const topic = chartContainer
      .selectAll(".topicContainer")
      .data(dataByTopicId)
      .enter()
      .append("g")
      .attr("class", "topicContainer");
    // ¦¦ KC labels ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
    // Radial labels around the global star, one per KC, angled to stay readable
    // and truncated to the space between the star edge and the canvas border.
    const kcContainer = chartContainer.append("g").attr("id", "kcContainer");
    // Radius at which labels start (same formula used in translate)
    const maxRayHeight = 7;
    const labelStartR =
      allPlcsStarR +
      cfg.plcR * 1.8 * maxRayHeight +
      cfg.paddingR * (maxRayHeight + 2);
    // Worst-case available width: distance from label origin to SVG edge at 90°
    // (vertical direction is most restrictive since svgHeight == svgWidth here,
    // but we take the minimum of both axes to be safe)
    const halfW = cfg.svgWidth / 2;
    const halfH = cfg.svgHeight / 2;
    const maxAvailableWidth = Math.min(halfW, halfH) - labelStartR - 8; // 8px margin
    const kcItems = kcContainer
      .selectAll(".kcLabels")
      .data(kcsData)
      .enter()
      .append("g")
      .attr("class", "kcLabels")
      .style("pointer-events", "all")
      .attr("transform", d => {
        const r = labelStartR;
        return `translate(${r * Math.cos(d.angle)}, ${r * Math.sin(d.angle)})`;
      });
    kcItems
      .append("text")
      .attr("transform", d => {
        // Flip labels on the left half so text never reads upside-down
        const angle =
          d.angle < Math.PI / 2 || d.angle > (3 * Math.PI) / 2
            ? d.angle
            : d.angle + Math.PI;
        return `rotate(${angle * (180 / Math.PI)})`;
      })
      .attr("dy", "0.35em")
      .attr("text-anchor", d =>
        d.angle < Math.PI / 2 || d.angle > (3 * Math.PI) / 2 ? "start" : "end",
      )
      .style("font", `${svgHeight * 0.015}px ${FONT_FAMILY}`)
      .style("fill", d => kcColorScale(d.kcId))
      .style("opacity", 1)
      .style("cursor", "pointer")
      .text(d => d.kcLabel)
      // Clicking a KC name lists its PLCs in a popover to pick one from
      .on("click", (e, d) => {
        if (vizState !== "All") return;
        e.stopPropagation();
        openKcPopover(d, e, kcColorScale(d.kcId));
      })
      .each(function () {
        // Truncate label if it exceeds the available radial space
        const el = d3.select(this);
        const node = this;
        const fullLabel = el.text();
        if (node.getComputedTextLength() <= maxAvailableWidth) {
          el.append("title").text(fullLabel);
          return;
        }
        // NOTE: getComputedTextLength() returns 0 if the SVG is not yet attached
        // to the DOM when this runs. This is safe here because the SVG is appended
        // to #graph before drawStars() is called, but if this function is ever
        // moved to a different context, wrap the truncation in a requestAnimationFrame.
        let lo = 0,
          hi = fullLabel.length;
        while (lo < hi - 1) {
          const mid = Math.floor((lo + hi) / 2);
          el.text(fullLabel.slice(0, mid) + "…");
          if (node.getComputedTextLength() <= maxAvailableWidth) lo = mid;
          else hi = mid;
        }
        el.text(fullLabel.slice(0, lo) + "…");
        el.append("title").text(fullLabel);
      });
    // ¦¦ Topic containers ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
    // Dashed ring + wrapped name per topic. Both are invisible in "All" and fade
    // in for "Topics"; the ring radius animates between the two star sizes.
    topic
      .append("circle")
      .attr("class", "topicCircle")
      .attr("cx", 0)
      .attr("cy", 0)
      .attr("r", d => d.allStarR - svgHeight * 0.01)
      .style("fill", "none")
      .style("stroke", "grey")
      .style("stroke-width", "2px")
      .style("stroke-dasharray", "3, 3");
    topic
      .append("text")
      .attr("class", "topicName")
      .attr("x", 0)
      .attr("y", 0)
      .attr("dy", "0.35em")
      .attr("text-anchor", "middle")
      .style("font", `${svgHeight * 0.012}px ${FONT_FAMILY}`)
      .style("fill", "#BDBDBD")
      .style("opacity", 0)
      .text(d => d.name)
      .call(text =>
        text.each(function (d) {
          wrap(d3.select(this), d.topicStarR * 2 - paddingH, "middle");
        }),
      );
    // ¦¦ PLC dots ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
    // Nested join: each topic owns rays, each ray owns its PLC dots. Dots are
    // positioned along their ray for the "All" layout and carry the interaction
    // handlers; per-state opacity hides the duplicates that shouldn't show.
    const rays = topic
      .selectAll(".rays")
      .data(d => d.plcs)
      .enter()
      .append("g")
      .attr("class", "rays");
    const plcCircles = rays
      .selectAll(".plcs")
      .data(d => d)
      .enter()
      .append("g")
      .attr("class", "plcs")
      .attr("transform", d => {
        const r =
          d.allStarR + paddingR + plcR + (paddingR + plcR * 2) * d.allIndex;
        return `translate(${r * Math.cos(d.allAngle)}, ${r * Math.sin(d.allAngle)})`;
      })
      .style("cursor", "pointer")
      .on("mouseover", (e, d) => {
        // Hover behaviour depends on the active view
        if (vizState === "Network") {
          if (!networkSels.isPinned()) networkSels.highlightPlc(d.plcId);
        } else if (vizState === "All") {
          // Dim every other PLC and grey out non-matching KC labels
          d3.selectAll(".plcs").style("opacity", pd => {
            if (!pd.isGlobalPrimary) return 0;
            return pd.plcId === d.plcId ? 1 : DIM_OPACITY;
          });
          d3.selectAll(".kcLabels").style("opacity", pd =>
            pd.kcId === d.kcId ? 1 : DIM_OPACITY,
          );
        } else if (vizState === "Topics") {
          // A PLC can belong to multiple topics — collect all of them
          const activePlcTopics = new Set(
            d3
              .selectAll(".plcs")
              .data()
              .filter(pd => pd.plcId === d.plcId)
              .map(pd => pd.topicId),
          );
          d3.selectAll(".plcs").style("opacity", pd => {
            if (!pd.isTopicPrimary) return 0;
            return pd.plcId === d.plcId ? 1 : DIM_OPACITY;
          });
          d3.selectAll(".topicName").style("opacity", pd =>
            activePlcTopics.has(pd.topicId) ? 1 : DIM_OPACITY,
          );
          d3.selectAll(".topicCircle").style("opacity", pd =>
            activePlcTopics.has(pd.topicId) ? 1 : DIM_OPACITY,
          );
        }
      })
      .on("mouseleave", () => {
        // Restore the default opacities for the active view
        if (vizState === "Network") {
          networkSels.resetHighlight();
        } else if (vizState === "All") {
          highlightAllKc(popoverKcId);
        } else if (vizState === "Topics") {
          d3.selectAll(".plcs").style("opacity", pd =>
            pd.isTopicPrimary ? 1 : 0,
          );
          d3.selectAll(".topicName").style("opacity", 1);
          d3.selectAll(".topicCircle").style("opacity", 1);
        }
      })
      .on("click", (e, d) => openSidePanel(d));
    // Invisible larger hit-circle so primaries are easy to click/hover
    plcCircles
      .append("circle")
      .attr("id", d => d.plcId)
      .attr("r", plcR + 5)
      .style("pointer-events", d => (d.isTopicPrimary ? "all" : "none"))
      .style("fill", "none")
      .style("stroke", d => kcColorScale(d.kcId))
      .style("stroke-opacity", 0);
    // Visible glowing dot, drawn only for the primary record of each PLC
    plcCircles
      .filter(d => d.isTopicPrimary)
      .append("circle")
      .attr("class", "plcDot")
      .style("filter", "url(#glow)")
      .attr("r", plcR)
      .style("fill", d => kcColorScale(d.kcId));
    plcCircles
      .filter(d => d.isTopicPrimary)
      .append("svg:title")
      .text(d => {
        return d.plcLabel;
      });
    // Hide non-global duplicates in initial "All" state
    plcCircles.filter(d => !d.isGlobalPrimary).style("opacity", 0);
  }
  ///////////////////////////////////////////////////////////////////////////////
  // TOGGLE BUTTON — 3 buttons
  ///////////////////////////////////////////////////////////////////////////////
  // Active/inactive state is expressed by swapping the ECL button variant,
  // so the pressed state needs no custom CSS
  function buttonClasses(isActive) {
    return isActive ? "viz-view-btn viz-view-btn--active" : "viz-view-btn";
  }
  // Build the three view-switch buttons (All / Topics / Network) into the
  // #vizToggleButtons container, each wired to call toggleViz on click.
  function drawToggleButton() {
    d3.select("#vizToggleButtons").selectAll("*").remove();
    // Icon geometry: each button holds its own square SVG, so the icon
    // coordinates below are relative to that button, not to a shared canvas.
    // ECL adds its own padding around the icon to keep the button square.
    const iconSize = 50;
    // Stroke widths scale with iconSize like every other icon dimension, so the
    // icons keep the same proportions at any size.
    const strokeThick = iconSize * 0.03; // 1.5px at iconSize 50
    const strokeThin = iconSize * 0.02; // 1px at iconSize 50
    // The buttons form the left column of #vizLayout, stacked and centred
    // vertically, each showing its view's name under the icon.
    const btnGroup = d3
      .select("#vizToggleButtons")
      .append("div")
      .attr("class", "viz-view-buttons")
      .attr("role", "group")
      .attr("aria-label", "Visualisation view");
    // A real <button>, reachable by keyboard and operable with Enter/Space,
    // whose accessible name is the visible view name; the longer description
    // stays available as a tooltip. Returns the icon SVG so each caller can
    // draw its own icon into it.
    function makeButton(id, state, name, description) {
      const isActive = vizState === state;
      const btn = btnGroup
        .append("button")
        .attr("id", id)
        .attr("type", "button")
        .attr("class", buttonClasses(isActive))
        .attr("aria-pressed", isActive ? "true" : "false")
        .attr("title", description)
        .on("click", () => {
          if (vizState !== state) toggleViz(state);
        });
      // viewBox makes the drawing scale instead of being clipped
      const icon = btn
        .append("svg")
        .attr("class", "viz-view-btn__icon")
        .attr("viewBox", `0 0 ${iconSize} ${iconSize}`)
        .attr("aria-hidden", "true")
        .attr("focusable", "false");
      btn.append("span").attr("class", "viz-view-btn__label").text(name);
      return icon;
    }
    // Help text under the buttons (HTML, not SVG, so it never gets clipped).
    function addHelp() {
      d3.select("#vizToggleButtons")
        .append("p")
        .attr("class", "viz-help")
        .text(
          "Each dot represents a piece of policy-relevant content. Hover over a dot and click to find out more about it.",
        );
    }
    // Button 1 — All: single ring
    const btnAll = makeButton(
      "btnAll",
      "All",
      "All content",
      "View all policy-relevant content together by Knowledge Community",
    );
    btnAll
      .append("circle")
      .attr("cx", iconSize / 2)
      .attr("cy", iconSize / 2)
      .attr("r", iconSize * 0.3)
      .style("fill", "none")
      .style("stroke", "currentColor")
      .style("stroke-width", strokeThick);
    // Button 2 — Topics: scattered rings
    const btnTopics = makeButton(
      "btnTopics",
      "Topics",
      "By topic",
      "View policy-relevant content grouped by JRC Topic",
    );
    [
      {dx: 0, dy: -iconSize * 0.28, r: iconSize * 0.07},
      {dx: iconSize * 0.2, dy: -iconSize * 0.16, r: iconSize * 0.07},
      {dx: iconSize * 0.28, dy: iconSize * 0.1, r: iconSize * 0.09},
      {dx: iconSize * 0.1, dy: iconSize * 0.28, r: iconSize * 0.06},
      {dx: -iconSize * 0.12, dy: iconSize * 0.22, r: iconSize * 0.08},
      {dx: -iconSize * 0.28, dy: iconSize * 0.08, r: iconSize * 0.06},
      {dx: -iconSize * 0.26, dy: -iconSize * 0.16, r: iconSize * 0.05},
      {dx: -iconSize * 0.1, dy: -iconSize * 0.07, r: iconSize * 0.08},
      {dx: iconSize * 0.08, dy: iconSize * 0.06, r: iconSize * 0.05},
    ].forEach(({dx, dy, r}) => {
      btnTopics
        .append("circle")
        .attr("cx", iconSize / 2 + dx)
        .attr("cy", iconSize / 2 + dy)
        .attr("r", r)
        .style("fill", "none")
        .style("stroke", "currentColor")
        .style("stroke-width", strokeThick);
    });
    // Button 3 — Network: 3 columns of dots with lines
    const btnNetwork = makeButton(
      "btnNetwork",
      "Network",
      "Network",
      "View data as a three-layer network",
    );
    const netCols = [
      {x: iconSize * 0.22, count: 2},
      {x: iconSize * 0.5, count: 4},
      {x: iconSize * 0.78, count: 4},
    ];
    netCols.forEach(col => {
      const step = iconSize / (col.count + 1);
      for (let i = 0; i < col.count; i++) {
        btnNetwork
          .append("circle")
          .attr("cx", col.x)
          .attr("cy", step * (i + 1))
          .attr("r", iconSize * 0.04)
          .style("fill", "currentColor");
      }
    });
    // Lines col0 › col1 (fully connected: every left node to every right node)
    [
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 0],
      [1, 1],
      [1, 2],
      [0, 3],
      [1, 3],
    ].forEach(([li, ri]) => {
      const ls = iconSize / (netCols[0].count + 1);
      const rs = iconSize / (netCols[1].count + 1);
      btnNetwork
        .append("line")
        .attr("x1", netCols[0].x)
        .attr("y1", ls * (li + 1))
        .attr("x2", netCols[1].x)
        .attr("y2", rs * (ri + 1))
        .style("stroke", "currentColor")
        .style("stroke-width", strokeThin);
    });
    // Lines col1 › col2 (single connection)
    [
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 3],
    ].forEach(([li, ri]) => {
      const ls = iconSize / (netCols[1].count + 1);
      const rs = iconSize / (netCols[2].count + 1);
      btnNetwork
        .append("line")
        .attr("x1", netCols[1].x)
        .attr("y1", ls * (li + 1))
        .attr("x2", netCols[2].x)
        .attr("y2", rs * (ri + 1))
        .style("stroke", "currentColor")
        .style("stroke-width", strokeThin);
    });
    addHelp();
  }
  ///////////////////////////////////////////////////////////////////////////////
  // ANNOUNCE VIEW
  ///////////////////////////////////////////////////////////////////////////////
  // The graph redraws without moving focus, so screen reader users get no
  // signal that the content changed. A short message in the live region
  // confirms the switch.
  const VIEW_ANNOUNCEMENTS = {
    All: "All view: content grouped by Knowledge Community.",
    Topics: "Topics view: content grouped by JRC Topic.",
    Network: "Network view: topics, Knowledge Communities and their content.",
  };
  function announceView(state) {
    const region = document.getElementById("vizLiveRegion");
    if (!region) return;
    region.textContent = VIEW_ANNOUNCEMENTS[state] || "";
  }
  ///////////////////////////////////////////////////////////////////////////////
  // UPDATE BUTTON STATES — 3 buttons
  ///////////////////////////////////////////////////////////////////////////////
  // Swap the ECL variant and aria-pressed so the button matching vizState reads
  // as active. Icon colours follow the button's own text colour via currentColor.
  function updateButtonStates() {
    [
      ["btnAll", "All"],
      ["btnTopics", "Topics"],
      ["btnNetwork", "Network"],
    ].forEach(([id, state]) => {
      const isActive = vizState === state;
      d3.select(`#${id}`)
        .attr("class", buttonClasses(isActive))
        .attr("aria-pressed", isActive ? "true" : "false");
    });
  }
  ///////////////////////////////////////////////////////////////////////////////
  // TOGGLE VIZ — 3 states, each branch is self-contained
  ///////////////////////////////////////////////////////////////////////////////
  // Animate from the previous view to targetState. Each prev›target pair has its
  // own branch that transitions the relevant elements (star dots, topic rings/names,
  // KC labels, network layer) and, where needed, animates the SVG viewBox.
  function toggleViz(targetState) {
    const {plcR, paddingR, svgHeight, duration, halfDuration} = cfg;
    // The panel describes a PLC as positioned in the view being left, and the
    // dot it was opened from is about to animate somewhere else, so the panel
    // closes on every view switch. Focus is not restored to that dot: it
    // belongs on the toggle button that was just activated.
    if (isPanelOpen()) closeSidePanel(false);
    closeKcPopover();
    const prevState = vizState;
    // A selected KC unfolds its PLCs into the Network layout only; fold it
    // back before the dots leave, so they start from their usual rows.
    if (prevState === "Network") networkSels.clearHighlight(false);
    vizState = targetState;
    updateButtonStates();
    announceView(targetState);
    // viewBox strings for the two canvas shapes. All/Topics use the square
    // canvas; Network uses the full width and taller height. The x-origin of
    // the Network box is shifted so chartContainer's centre (0) stays centred.
    const squareVB = `0 0 ${cfg.svgWidth} ${cfg.svgHeight + cfg.btnAreaHeight}`;
    const networkVB = `${cfg.svgWidth / 2 - cfg.networkWidth / 2} 0 ${cfg.networkWidth} ${cfg.networkHeight + cfg.btnAreaHeight}`;
    // ¦¦ Network layer ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
    // Entering/leaving Network swaps the viewBox + chartContainer centre and
    // fades the network layer in/out; star elements stay put but stop catching
    // pointer events while Network is shown.
    if (targetState === "Network") {
      d3.selectAll(".kcLabels").style("pointer-events", "none");
      svg.transition().duration(halfDuration).attr("viewBox", networkVB);
      chartContainer
        .transition()
        .duration(halfDuration)
        .attr(
          "transform",
          `translate(${cfg.svgWidth / 2}, ${cfg.networkHeight / 2 + cfg.btnAreaHeight})`,
        );
      d3.select("#networkLayer")
        .style("pointer-events", "all")
        .transition()
        .duration(halfDuration)
        .delay(cfg.duration * 0.6)
        .style("opacity", 1);
      // Star/topic elements stay in the DOM (invisible) but must not intercept
      // hover meant for the network layer underneath/around them.
      d3.selectAll(".topicContainer").style("pointer-events", "none");
    } else if (prevState === "Network") {
      d3.select("#networkLayer")
        .style("pointer-events", "none")
        .transition()
        .duration(halfDuration)
        .style("opacity", 0);
      svg
        .transition()
        .duration(halfDuration)
        .delay(halfDuration)
        .attr("viewBox", squareVB);
      chartContainer
        .transition()
        .duration(halfDuration)
        .delay(halfDuration)
        .attr(
          "transform",
          `translate(${cfg.svgWidth / 2}, ${cfg.svgHeight / 2 + cfg.btnAreaHeight})`,
        );
      // Re-enable interaction with the star/topic elements outside Network.
      d3.selectAll(".topicContainer").style("pointer-events", "all");
    }
    // ¦¦ All › Topics ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
    // Fade out KC labels, reveal topic rings/names, move each topic container to
    // its force-simulated position and re-place its dots on the per-topic star.
    if (prevState === "All" && targetState === "Topics") {
      d3.selectAll(".plcs").style("opacity", 1);
      d3.selectAll(".kcLabels")
        .transition()
        .duration(halfDuration)
        .style("opacity", 0)
        .on("end", function () {
          d3.select(this).style("pointer-events", "none");
        });
      d3.selectAll(".topicCircle")
        .transition()
        .duration(duration)
        .style("opacity", 1)
        .attr("r", d => d.topicStarR);
      d3.selectAll(".topicName")
        .transition()
        .duration(duration)
        .style("opacity", 1);
      d3.selectAll(".topicContainer")
        .transition()
        .duration(duration)
        .attr("transform", d => `translate(${d.x},${d.y})`);
      d3.selectAll(".topicContainer")
        .selectAll(".rays")
        .selectAll(".plcs")
        .transition()
        .duration(duration)
        .attr("transform", d => {
          const r =
            d.topicStarR +
            paddingR +
            plcR +
            (paddingR + plcR * 2) * d.topicIndex;
          return `translate(${r * Math.cos(d.topicAngle)},${r * Math.sin(d.topicAngle)})`;
        });
      // ¦¦ Topics › All ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
      // Hide duplicates, bring KC labels back, collapse all topic containers to
      // the centre and re-place dots on the single global star.
    } else if (prevState === "Topics" && targetState === "All") {
      d3.selectAll(".plcs")
        .filter(d => !d.isGlobalPrimary)
        .style("opacity", 0);
      d3.selectAll(".kcLabels")
        .style("pointer-events", "all")
        .transition()
        .duration(duration)
        .style("opacity", 1);
      d3.selectAll(".topicCircle")
        .transition()
        .duration(duration)
        .style("opacity", 1)
        .attr("r", d => d.allStarR - svgHeight * 0.01);
      d3.selectAll(".topicName")
        .transition()
        .duration(halfDuration)
        .style("opacity", 0);
      d3.selectAll(".topicContainer")
        .transition()
        .duration(duration)
        .attr("transform", "translate(0,0)");
      d3.selectAll(".topicContainer")
        .selectAll(".rays")
        .selectAll(".plcs")
        .transition()
        .duration(duration)
        .attr("transform", d => {
          const r =
            d.allStarR + paddingR + plcR + (paddingR + plcR * 2) * d.allIndex;
          return `translate(${r * Math.cos(d.allAngle)},${r * Math.sin(d.allAngle)})`;
        });
      // ¦¦ All › Network ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
      // Fade out star chrome and slide each dot directly to its network position
      // (containers are already centred, so networkX/Y can be used as-is).
    } else if (prevState === "All" && targetState === "Network") {
      d3.selectAll(".kcLabels")
        .transition()
        .duration(halfDuration)
        .style("opacity", 0)
        .on("end", function () {
          d3.select(this).style("pointer-events", "none");
        });
      d3.selectAll(".topicCircle")
        .transition()
        .duration(halfDuration)
        .style("opacity", 0);
      d3.selectAll(".topicName").style("opacity", 0);
      d3.selectAll(".topicContainer")
        .selectAll(".rays")
        .selectAll(".plcs")
        .transition()
        .duration(duration)
        .attr("transform", d => `translate(${d.networkX},${d.networkY})`);
      // ¦¦ Network › All ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
      // Bring KC labels back and send dots from network positions to the global
      // star, then fade the topic rings back in at the global radius.
    } else if (prevState === "Network" && targetState === "All") {
      d3.selectAll(".kcLabels")
        .style("pointer-events", "all")
        .transition()
        .duration(duration)
        .style("opacity", 1);
      d3.selectAll(".topicName").style("opacity", 0);
      d3.selectAll(".topicContainer")
        .selectAll(".rays")
        .selectAll(".plcs")
        .transition()
        .duration(duration)
        .attr("transform", d => {
          const r =
            d.allStarR + paddingR + plcR + (paddingR + plcR * 2) * d.allIndex;
          return `translate(${r * Math.cos(d.allAngle)},${r * Math.sin(d.allAngle)})`;
        });
      d3.selectAll(".topicCircle")
        .attr("r", d => d.allStarR - svgHeight * 0.01)
        .transition()
        .duration(halfDuration)
        .delay(duration * 0.5)
        .style("opacity", 1);
      // ¦¦ Topics › Network ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
      // Topic containers sit at scattered positions, so dots animate to a
      // container-relative offset that lands on their absolute networkX/Y, then an
      // invisible snap recentres the containers once every dot transition ends.
    } else if (prevState === "Topics" && targetState === "Network") {
      d3.selectAll(".plcs")
        .filter(d => !d.isGlobalPrimary)
        .style("opacity", 0);
      d3.selectAll(".kcLabels")
        .transition()
        .duration(halfDuration)
        .style("opacity", 0);
      d3.selectAll(".topicName")
        .transition()
        .duration(halfDuration)
        .style("opacity", 0);
      d3.selectAll(".topicCircle")
        .transition()
        .duration(halfDuration)
        .style("opacity", 0);
      // PLCs animate to a position relative to their container that equals
      // their absolute networkX/Y once the container snaps back to (0,0)
      const plcSel = d3
        .selectAll(".topicContainer")
        .selectAll(".rays")
        .selectAll(".plcs");
      const total = plcSel.size();
      let count = 0;
      plcSel
        .transition()
        .duration(duration)
        .attr("transform", d => {
          const relX = d.networkX - (d.topicForceX || 0);
          const relY = d.networkY - (d.topicForceY || 0);
          return `translate(${relX},${relY})`;
        })
        .on("end", function () {
          count++;
          if (count < total) return;
          // Invisible snap: move containers to (0,0) and PLCs to absolute coords
          d3.selectAll(".topicContainer").attr("transform", "translate(0,0)");
          d3.selectAll(".topicContainer")
            .selectAll(".rays")
            .selectAll(".plcs")
            .attr("transform", d => `translate(${d.networkX},${d.networkY})`);
        });
      // ¦¦ Network › Topics ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
      // Move containers out to their scattered positions while dots move from
      // absolute network coords to topic-relative star coords, so the net motion
      // reads as a single straight slide; then fade the topic rings/names in.
    } else if (prevState === "Network" && targetState === "Topics") {
      d3.selectAll(".plcs").style("opacity", 1);
      d3.selectAll(".kcLabels").style("opacity", 0);
      // Containers animate from (0,0) to (d.x, d.y) simultaneously with
      // PLCs animating from absolute network coords to topic-relative coords,
      // producing straight absolute motion
      d3.selectAll(".topicContainer")
        .transition()
        .duration(duration)
        .attr("transform", d => `translate(${d.x},${d.y})`);
      d3.selectAll(".topicContainer")
        .selectAll(".rays")
        .selectAll(".plcs")
        .transition()
        .duration(duration)
        .attr("transform", d => {
          const r =
            d.topicStarR +
            paddingR +
            plcR +
            (paddingR + plcR * 2) * d.topicIndex;
          return `translate(${r * Math.cos(d.topicAngle)},${r * Math.sin(d.topicAngle)})`;
        });
      d3.selectAll(".topicCircle")
        .transition()
        .duration(duration)
        .style("opacity", 1)
        .attr("r", d => d.topicStarR);
      d3.selectAll(".topicName")
        .transition()
        .duration(duration)
        .style("opacity", 1);
    }
  }
} // end init
///////////////////////////////////////////////////////////////////////////////
// DATA PREPARATION
///////////////////////////////////////////////////////////////////////////////
// Fan out the kc-plc relationships into one row per (plc, topic) pair, joining in
// the human-readable labels/links. This denormalized array is the source for every
// layout; the *Primary flags set later decide which duplicates actually render.
function buildEnrichedData(kcPlc, topicKc, plcs, kcs, topics) {
  const plcById = new Map(plcs.map(p => [p.plcId, p]));
  const kcById = new Map(kcs.map(k => [k.kcId, k]));
  const topicById = new Map(topics.map(t => [t.topicId, t]));
  const topicsByKc = new Map();
  topicKc.forEach(row => {
    if (!topicsByKc.has(row.kcId)) topicsByKc.set(row.kcId, []);
    topicsByKc.get(row.kcId).push(row.topicId);
  });
  return kcPlc.flatMap(row => {
    const plc = plcById.get(row.plcId);
    const kc = kcById.get(row.kcId);
    const topicIds = topicsByKc.get(row.kcId) ?? [];
    return topicIds.map(topicId => {
      const topic = topicById.get(topicId);
      return {
        plcId: row.plcId,
        plcLabel: plc ? plc.plcLabel.trim() : row.plcId,
        plcLink: plc ? plc.plcLink : "",
        plcImageUrl: plc && plc.plcImageLink ? plc.plcImageLink : "",
        plcIntroText: plc ? plc.plcIntroText : "",
        kcId: row.kcId,
        kcLabel: kc ? kc.kcLabel : row.kcId,
        kcLink: kc ? kc.kcLink : "",
        topicId: topicId,
        topicLabel: topic ? topic.topicLabel.trim() : topicId,
      };
    });
  });
}
// Compute and stamp two sets of polar coordinates onto every record: the global
// "All" star layout (deduplicated across all PLCs) and a per-topic star layout
// (deduplicated within each topic). Returns the data plus the global star radius.
function formatPlcData(enrichedData, topics, kcs) {
  // Deduplicate by plcId for the global "All" layout
  const seenForAll = new Set();
  const enrichedDataUniq = enrichedData.filter(d => {
    if (seenForAll.has(d.plcId)) return false;
    seenForAll.add(d.plcId);
    return true;
  });
  const globalDistribution = getPlcsDistribution(
    enrichedDataUniq,
    kcs,
    getThresholdGlobal,
  );
  const allPlcStar = globalDistribution.raysArray;
  const allPlcsStarR = Math.max(getStarInnerRadius(allPlcStar), cfg.minStarR);
  // Build plcId › "All" position map
  const allPosMap = new Map();
  allPlcStar.forEach((ray, i, rays) => {
    ray.forEach((plc, index) => {
      allPosMap.set(plc.plcId, {
        allAngle: ((2 * Math.PI) / rays.length) * i,
        allStarR: allPlcsStarR,
        allIndex: index,
      });
    });
  });
  // Stamp onto all records (including cross-topic duplicates)
  enrichedData.forEach(d => {
    const pos = allPosMap.get(d.plcId);
    if (pos) {
      d.allAngle = pos.allAngle;
      d.allStarR = pos.allStarR;
      d.allIndex = pos.allIndex;
    }
  });
  // Per-topic layout — deduplicate within each topic
  topics.forEach(({topicId}) => {
    const topicPlcsAll = enrichedData.filter(d => d.topicId === topicId);
    const seenInTopic = new Set();
    const topicPlcsUniq = topicPlcsAll.filter(d => {
      if (seenInTopic.has(d.plcId)) return false;
      seenInTopic.add(d.plcId);
      return true;
    });
    const topicPlcsStar = getPlcsDistribution(
      topicPlcsUniq,
      kcs,
      getThresholdTopic,
    ).raysArray;
    const topicPlcsStarR = Math.max(
      getStarInnerRadius(topicPlcsStar),
      cfg.minStarR,
    );
    const topicPosMap = new Map();
    topicPlcsStar.forEach((ray, i, rays) => {
      ray.forEach((plc, index) => {
        topicPosMap.set(plc.plcId, {
          topicAngle: ((2 * Math.PI) / rays.length) * i,
          topicStarR: topicPlcsStarR,
          topicIndex: index,
        });
      });
    });
    topicPlcsAll.forEach(d => {
      const pos = topicPosMap.get(d.plcId);
      if (pos) {
        d.topicAngle = pos.topicAngle;
        d.topicStarR = pos.topicStarR;
        d.topicIndex = pos.topicIndex;
      }
    });
  });
  return {plcsData: enrichedData, globalDistribution, allPlcsStarR};
}
// Compute the angular position of each KC label around the global star, sizing each
// KC's angular slice in proportion to the number of rays (spokes) it occupies.
function formatKcsData(globalDistribution) {
  const {kcGroups} = globalDistribution;
  const totalRays = kcGroups.reduce((sum, o) => sum + o.length, 0);
  const angleUnit = (2 * Math.PI) / totalRays;
  let cumulativeRays = 0;
  return kcGroups.map(o => {
    const rayCount = o.length;
    const angle = (cumulativeRays + (rayCount - 1) / 2) * angleUnit;
    cumulativeRays += rayCount;
    return {
      kcId: o.flat()[0].kcId,
      kcLabel: o.flat()[0].kcLabel,
      angle,
    };
  });
}
// Group records by topic, run a force simulation to lay the topic stars out without
// overlap, and mark the primary (non-duplicate) PLC in each topic and globally so
// the draw/transition code knows which records to render.
function getDataByTopicId(data, kcs) {
  const {plcR, paddingR, center} = cfg;
  const grouped = d3.group(data, d => d.topicId);
  const topicArray = Array.from(grouped, ([topicId, items]) => {
    const plcs = getPlcsDistribution(items, kcs, getThresholdTopic).raysArray;
    const maxRayHeight = d3.max(plcs, ray => ray.length);
    const topicStarR = items[0].topicStarR;
    return {
      topicId,
      name: items[0].topicLabel,
      topicStarR,
      allStarR: items[0].allStarR,
      plcs,
      topicOuterR:
        topicStarR + plcR * 2 * maxRayHeight + paddingR * (maxRayHeight + 2),
    };
  });
  // Collision-only force layout: pack the topic stars around the centre without
  // overlapping (radius = each topic's outer reach). Run synchronously via tick().
  d3.forceSimulation(topicArray)
    .force(
      "collide",
      d3.forceCollide().radius(d => 2 + d.topicOuterR),
    )
    .force("x", d3.forceX(0))
    .force("y", d3.forceY(0))
    .stop()
    .tick(500);
  // Mark the first occurrence of each plcId as primary — once per topic
  // (isTopicPrimary) and once across the whole dataset (isGlobalPrimary).
  const seenGlobal = new Set();
  topicArray.forEach(topic => {
    const seenInTopic = new Set();
    topic.plcs.forEach(ray =>
      ray.forEach(plc => {
        plc.isTopicPrimary = !seenInTopic.has(plc.plcId);
        plc.isGlobalPrimary = !seenGlobal.has(plc.plcId);
        seenInTopic.add(plc.plcId);
        seenGlobal.add(plc.plcId);
      }),
    );
  });
  return topicArray;
}
///////////////////////////////////////////////////////////////////////////////
// GEOMETRY HELPERS
///////////////////////////////////////////////////////////////////////////////
// A "ray" is one spoke of a star. PLCs of a KC are chunked into rays so each spoke
// holds at most thresholdFn(...) dots. Returns raysArray (flat list of spokes) and
// kcGroups (the same spokes kept grouped by KC, used for angular label sizing).
function getPlcsDistribution(data, kcs, thresholdFn) {
  const kcGroups = [];
  kcs.forEach(kc => {
    const kcPlcs = data.filter(d => d.kcId === kc.kcId);
    if (kcPlcs.length === 0) return;
    kcGroups.push(chunk(kcPlcs, thresholdFn(kcPlcs)));
  });
  return {raysArray: kcGroups.flat(), kcGroups};
}
// Inner radius needed so `n` rays fit evenly around the circle without their base
// dots overlapping (derived from circumference = n dots + gaps).
function getStarInnerRadius(raysArray) {
  const {plcR, paddingH, paddingR} = cfg;
  const n = raysArray.length;
  return (n * 2 * plcR + (n - 1) * paddingH) / (2 * Math.PI) - paddingR - plcR;
}
// Split an array into consecutive chunks of at most `threshold` items.
function chunk(array, threshold) {
  const result = [];
  for (let i = 0; i < array.length; i += threshold)
    result.push(array.slice(i, i + threshold));
  return result;
}
// Rays-per-KC for the global star: more PLCs ? taller rays, so a busy KC doesn't
// spread into too many thin spokes.
function getThresholdGlobal(array) {
  const n = array.length;
  return n < 3 ? 2 : n < 4 ? 3 : n < 5 ? 4 : n < 8 ? 5 : n < 13 ? 6 : 7;
}
// Per-topic stars are smaller, so a fixed 3 dots per ray keeps them compact.
function getThresholdTopic(array) {
  return 3;
}
///////////////////////////////////////////////////////////////////////////////
// SVG UTILITIES
///////////////////////////////////////////////////////////////////////////////
// Wrap an SVG <text> onto multiple <tspan> lines so it fits within `width`,
// optionally re-centring the block vertically when verticalAlignment is "middle".
function wrap(text, width, verticalAlignment) {
  text.each(function () {
    const el = d3.select(this);
    const words = el.text().split(/\s+/).reverse();
    const lineHeight = 1.15;
    const x = el.attr("x");
    const y = el.attr("y") || 0;
    const dy = parseFloat(el.attr("dy"));
    let word,
      line = [],
      lineNumber = 0;
    let tspan = el
      .text(null)
      .append("tspan")
      .attr("x", x)
      .attr("y", y)
      .attr("dy", dy + "em");
    while ((word = words.pop())) {
      line.push(word);
      tspan.text(line.join(" "));
      if (tspan.node().getComputedTextLength() > width) {
        line.pop();
        tspan.text(line.join(" "));
        line = [word];
        tspan = el
          .append("tspan")
          .attr("x", x)
          .attr("y", y)
          .attr("dy", ++lineNumber * lineHeight + dy + "em")
          .text(word);
        if (verticalAlignment === "middle") {
          el.selectAll("tspan").attr(
            "y",
            y - (lineHeight * lineNumber) / 2 + "em",
          );
        }
      }
    }
  });
}
