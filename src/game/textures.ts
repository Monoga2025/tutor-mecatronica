import * as THREE from 'three';
import { mulberry32 } from '../engine/rng';

type Painter = (g: CanvasRenderingContext2D, s: number, rnd: () => number) => void;

function canvasTexture(size: number, seed: number, paint: Painter, repeat = 1): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  paint(g, size, mulberry32(seed));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  return t;
}

export function grassTexture(repeat: number): THREE.CanvasTexture {
  return canvasTexture(256, 11, (g, s, r) => {
    g.fillStyle = '#93c264';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 1400; i++) {
      const l = 40 + r() * 22;
      g.fillStyle = `hsl(${88 + r() * 18}, ${42 + r() * 18}%, ${l}%)`;
      g.fillRect(r() * s, r() * s, 1.5 + r() * 2, 3 + r() * 5);
    }
    for (let i = 0; i < 18; i++) {
      g.fillStyle = r() < 0.5 ? '#f5e6a8' : '#f4b8c4';
      g.beginPath();
      g.arc(r() * s, r() * s, 1.6, 0, Math.PI * 2);
      g.fill();
    }
  }, repeat);
}

export function dirtTexture(): THREE.CanvasTexture {
  return canvasTexture(128, 23, (g, s, r) => {
    g.fillStyle = '#9a6b45';
    g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 16) {
      g.fillStyle = `rgba(70,40,20,${0.12 + r() * 0.1})`;
      g.fillRect(0, y, s, 3);
    }
    for (let i = 0; i < 300; i++) {
      g.fillStyle = `rgba(${r() < 0.5 ? '60,35,20' : '200,160,110'},${0.25 + r() * 0.3})`;
      g.fillRect(r() * s, r() * s, 2 + r() * 3, 2 + r() * 2);
    }
  });
}

export function stoneTexture(): THREE.CanvasTexture {
  return canvasTexture(256, 37, (g, s, r) => {
    g.fillStyle = '#e8d4b0';
    g.fillRect(0, 0, s, s);
    const n = 4, w = s / n;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const l = 78 + r() * 10;
        g.fillStyle = `hsl(${32 + r() * 10}, 45%, ${l}%)`;
        g.fillRect(x * w + 3, y * w + 3, w - 6, w - 6);
        for (let k = 0; k < 30; k++) {
          g.fillStyle = `rgba(120,90,60,${r() * 0.15})`;
          g.fillRect(x * w + r() * w, y * w + r() * w, 2, 2);
        }
      }
    }
  });
}

export function skyTexture(top: string, horizon: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, top);
  grad.addColorStop(0.75, horizon);
  grad.addColorStop(1, horizon);
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function labelTexture(text: string, bg: string, fg: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.beginPath();
  g.roundRect(8, 8, 496, 112, 40);
  g.fill();
  g.fillStyle = fg;
  g.font = 'bold 58px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function woodTexture(): THREE.CanvasTexture {
  return canvasTexture(128, 51, (g, s, r) => {
    const n = 4, h = s / n;
    for (let i = 0; i < n; i++) {
      g.fillStyle = `hsl(${26 + r() * 6}, ${50 + r() * 10}%, ${50 + r() * 8}%)`;
      g.fillRect(0, i * h, s, h);
      g.fillStyle = 'rgba(80,45,20,.55)';
      g.fillRect(0, i * h, s, 2);
      for (let k = 0; k < 6; k++) {
        g.fillStyle = `rgba(110,60,25,${0.15 + r() * 0.15})`;
        g.fillRect(0, i * h + 4 + r() * (h - 8), s, 1);
      }
    }
  });
}
