import * as THREE from 'three';

// Small canvas-textured signs. Their materials are collected so the main loop
// can dim them at night (lit signs stay bright).
export const signMaterials = [];

export function makeSign({
  lines,
  width,
  height,
  bg = '#1f4f9a',
  fg = '#ffffff',
  font = '"Hiragino Sans", "Yu Gothic", "Noto Sans JP", sans-serif',
  weight = 800,
  vertical = false,
  border = null,
  lit = false,
  pxPerUnit = 64,
  draw = null,
}) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(16, Math.round(width * pxPerUnit));
  canvas.height = Math.max(16, Math.round(height * pxPerUnit));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (border) {
    ctx.strokeStyle = border;
    ctx.lineWidth = Math.max(2, canvas.height * 0.06);
    ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, canvas.width - ctx.lineWidth, canvas.height - ctx.lineWidth);
  }
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (draw) draw(ctx, canvas.width, canvas.height);
  else if (vertical) {
    const chars = [...lines[0]];
    const size = Math.min(canvas.width * 0.72, (canvas.height * 0.86) / chars.length);
    ctx.font = `${weight} ${size}px ${font}`;
    chars.forEach((ch, i) => {
      ctx.fillText(ch, canvas.width / 2, canvas.height * 0.07 + size * (i + 0.5));
    });
  } else {
    const n = lines.length;
    lines.forEach((line, i) => {
      const [text, scale = 1] = Array.isArray(line) ? line : [line, 1];
      const size = (canvas.height / n) * 0.62 * scale;
      ctx.font = `${weight} ${size}px ${font}`;
      ctx.fillText(text, canvas.width / 2, (canvas.height / n) * (i + 0.53), canvas.width * 0.92);
    });
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  const material = new THREE.MeshBasicMaterial({ map: texture });
  material.userData.lit = lit;
  signMaterials.push(material);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  mesh.name = `sign:${lines?.[0] ?? 'custom'}`;
  return mesh;
}

export function updateSigns(night) {
  for (const m of signMaterials) {
    const k = m.userData.lit ? 1 : THREE.MathUtils.lerp(1, 0.3, night);
    m.color.setScalar(k);
  }
}
