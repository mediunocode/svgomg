const escapeXml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const titleFontSize = (name) => {
  if (name.length > 48) {
    return 36;
  }

  if (name.length > 32) {
    return 44;
  }

  return 52;
};

const buildOgSvg = ({ name, id }) => {
  const titleSize = titleFontSize(name);
  const titleY = name.length > 40 ? 250 : 280;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="${escapeXml(
    name,
  )}">
  <rect width="1200" height="630" fill="#303f9f"/>
  <rect y="500" width="1200" height="130" fill="#1a237e"/>
  <text x="60" y="110" fill="#00bcd4" font-family="system-ui,-apple-system,Segoe UI,Roboto,sans-serif" font-size="30" font-weight="600">SVGOMG · SVGO Plugin Guide</text>
  <text x="60" y="${titleY}" fill="#ffffff" font-family="system-ui,-apple-system,Segoe UI,Roboto,sans-serif" font-size="${titleSize}" font-weight="600">${escapeXml(
    name,
  )}</text>
  <text x="60" y="${
    titleY + 72
  }" fill="#e3f2fd" font-family="ui-monospace,Menlo,Consolas,monospace" font-size="28">${escapeXml(
    id,
  )}</text>
  <text x="60" y="580" fill="#ffffff" font-family="system-ui,-apple-system,Segoe UI,Roboto,sans-serif" font-size="26">svgomg.net</text>
</svg>`;
};

module.exports = { buildOgSvg };
