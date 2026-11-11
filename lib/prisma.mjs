// PRISMA 2020 flow diagram SVG — ported from
// metaworkbench/prisma-flow-diagram-generator/index.html (layout and the
// derived-count arithmetic: screened = identified − removed, etc.).

function box(x, y, w, h, lines, fill) {
  var s = '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="4" fill="' + (fill || "#ffffff") + '" stroke="#333" stroke-width="1.2"/>';
  var startY = y + h / 2 - (lines.length - 1) * 9 + 4;
  for (var i = 0; i < lines.length; i++) {
    s += '<text x="' + (x + w / 2) + '" y="' + (startY + i * 18) + '" text-anchor="middle" font-size="12.5" fill="#111">' + lines[i] + "</text>";
  }
  return s;
}
function arrow(x, y1, y2) {
  return '<line x1="' + x + '" y1="' + y1 + '" x2="' + x + '" y2="' + (y2 - 6) + '" stroke="#333" stroke-width="1.2"/><polygon points="' + (x - 4) + "," + (y2 - 6) + " " + (x + 4) + "," + (y2 - 6) + " " + x + "," + y2 + '" fill="#333"/>';
}
function hArrow(x1, x2, y) {
  return '<line x1="' + x1 + '" y1="' + y + '" x2="' + (x2 - 6) + '" y2="' + y + '" stroke="#333" stroke-width="1.2"/><polygon points="' + (x2 - 6) + "," + (y - 4) + " " + (x2 - 6) + "," + (y + 4) + " " + x2 + "," + y + '" fill="#333"/>';
}
function phaseLabel(x, y, text) {
  return '<rect x="' + x + '" y="' + y + '" width="26" height="150" rx="4" fill="#0b5394"/><text x="' + (x + 13) + '" y="' + (y + 75) + '" text-anchor="middle" font-size="12" fill="#fff" transform="rotate(-90 ' + (x + 13) + " " + (y + 75) + ')">' + text + "</text>";
}
function esc(t) { return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
function n0(v) { var n = Math.floor(Number(v)); return isFinite(n) && n > 0 ? n : 0; }

// counts: { databases, registers, duplicatesRemoved, automationRemoved,
//           otherRemoved, screenExcluded, notRetrieved, fullTextExcluded,
//           exclusionReasons: [string], studiesIncluded, reportsIncluded }
export function prismaCounts(c) {
  var identified = n0(c.databases) + n0(c.registers);
  var removed = n0(c.duplicatesRemoved) + n0(c.automationRemoved) + n0(c.otherRemoved);
  var screened = Math.max(identified - removed, 0);
  var sought = Math.max(screened - n0(c.screenExcluded), 0);
  var assessed = Math.max(sought - n0(c.notRetrieved), 0);
  return { identified: identified, removedBeforeScreening: removed,
           screened: screened, sought: sought, assessed: assessed };
}

export function renderPrismaSvg(c) {
  var d = prismaCounts(c);
  var reasons = Array.isArray(c.exclusionReasons) ? c.exclusionReasons.map(function (r) { return String(r).trim(); }).filter(Boolean) : [];
  var exclLines = ["Reports excluded (n = " + n0(c.fullTextExcluded) + ")"];
  reasons.forEach(function (r) { exclLines.push(esc(r)); });
  var exclH = Math.max(56, 22 + exclLines.length * 18);

  var svg = '<svg id="prismaSvg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 640">';
  svg += '<rect x="0" y="0" width="700" height="640" fill="#ffffff"/>';
  svg += phaseLabel(8, 20, "Identification");
  svg += phaseLabel(8, 250, "Screening");
  svg += phaseLabel(8, 520, "Included");
  svg += box(50, 20, 290, 84, ["Records identified from:", "Databases (n = " + n0(c.databases) + ")", "Registers (n = " + n0(c.registers) + ")"]);
  svg += box(380, 20, 290, 84, ["Records removed before screening:", "Duplicates (n = " + n0(c.duplicatesRemoved) + ")", "Automation-ineligible (n = " + n0(c.automationRemoved) + ")", "Other reasons (n = " + n0(c.otherRemoved) + ")"]);
  svg += hArrow(340, 380, 62);
  svg += arrow(195, 104, 140);
  svg += box(50, 140, 290, 56, ["Records screened", "(n = " + d.screened + ")"]);
  svg += box(380, 140, 290, 56, ["Records excluded", "(n = " + n0(c.screenExcluded) + ")"]);
  svg += hArrow(340, 380, 168);
  svg += arrow(195, 196, 232);
  svg += box(50, 232, 290, 56, ["Reports sought for retrieval", "(n = " + d.sought + ")"]);
  svg += box(380, 232, 290, 56, ["Reports not retrieved", "(n = " + n0(c.notRetrieved) + ")"]);
  svg += hArrow(340, 380, 260);
  svg += arrow(195, 288, 324);
  svg += box(50, 324, 290, 56, ["Reports assessed for eligibility", "(n = " + d.assessed + ")"]);
  svg += box(380, 324, 290, exclH, exclLines);
  svg += hArrow(340, 380, 352);
  svg += arrow(195, 380, 520);
  svg += box(50, 520, 290, 72, ["Studies included in review", "(n = " + n0(c.studiesIncluded) + ")", "Reports of included studies", "(n = " + n0(c.reportsIncluded) + ")"], "#eef4fb");
  svg += "</svg>";
  return { svg: svg, height: 640, derived: d };
}
