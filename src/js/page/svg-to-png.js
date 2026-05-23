const MAX_CANVAS_PIXELS = 16_777_216;

export class SvgToPngError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SvgToPngError';
  }
}

const isValidPositive = (n) => Number.isFinite(n) && n > 0;

const parseSvgLength = (value) => {
  if (!value) return Number.NaN;
  const match = String(value)
    .trim()
    .match(/^([\d.]+)/);
  return match ? Number.parseFloat(match[1]) : Number.NaN;
};

const parseSvgDimensions = (svgText) => {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const svg = doc.documentElement;

  if (!svg || svg.nodeName.toLowerCase() !== 'svg') {
    return null;
  }

  const width = parseSvgLength(svg.getAttribute('width'));
  const height = parseSvgLength(svg.getAttribute('height'));

  if (isValidPositive(width) && isValidPositive(height)) {
    return { width, height };
  }

  const viewBox = svg.getAttribute('viewBox');

  if (viewBox) {
    const parts = viewBox
      .trim()
      .split(/[\s,]+/)
      .map(Number);

    if (
      parts.length === 4 &&
      isValidPositive(parts[2]) &&
      isValidPositive(parts[3])
    ) {
      return { width: parts[2], height: parts[3] };
    }
  }

  return null;
};

export const resolveSvgDimensions = (svgText, width, height) => {
  const w = Number(width);
  const h = Number(height);

  if (isValidPositive(w) && isValidPositive(h)) {
    return { width: w, height: h, usedFallback: false };
  }

  const parsed = parseSvgDimensions(svgText);

  if (parsed) {
    return { ...parsed, usedFallback: false };
  }

  return { width: 300, height: 150, usedFallback: true };
};

const loadImage = (url) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = url;
  });

const canvasToPngBlob = (canvas) =>
  new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('toBlob null'));
          return;
        }

        resolve(blob);
      }, 'image/png');
    } catch {
      reject(new Error('tainted canvas'));
    }
  });

export const svgToPng = async (svgText, width, height, { scale = 1 } = {}) => {
  const resolved = resolveSvgDimensions(svgText, width, height);
  const w = Math.round(resolved.width * scale);
  const h = Math.round(resolved.height * scale);

  if (!isValidPositive(w) || !isValidPositive(h)) {
    throw new SvgToPngError('Could not determine SVG size for PNG export.');
  }

  if (w * h > MAX_CANVAS_PIXELS) {
    throw new SvgToPngError('SVG too large to export as PNG.');
  }

  const url = URL.createObjectURL(
    new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' }),
  );

  try {
    const img = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new SvgToPngError('PNG export failed.');
    }

    ctx.drawImage(img, 0, 0, w, h);

    const blob = await canvasToPngBlob(canvas);

    return { blob, usedFallback: resolved.usedFallback };
  } catch (error) {
    if (error instanceof SvgToPngError) {
      throw error;
    }

    throw new SvgToPngError(
      'PNG export failed — SVG uses external resources browsers block.',
    );
  } finally {
    URL.revokeObjectURL(url);
  }
};

export const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

export const pngFilenameFromSvg = (svgFilename) => {
  if (/\.svg$/i.test(svgFilename)) {
    return svgFilename.replace(/\.svg$/i, '.png');
  }

  return `${svgFilename}.png`;
};
