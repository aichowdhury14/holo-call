// A typical Bangladeshi flat's room for the product viewer: glazed floor tiles with tile
// skirting, painted walls, a 10-foot ceiling, a window with a steel grill, a tube light and
// a wall switchboard. The back wall sits at z = 0 and the room opens towards +z (the camera).

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/RoundedBoxGeometry.js';
import * as tx from './textures.js';

export const CEILING = 3.05;     // 10 ft
const W = 6, D = 5;              // room width and depth in metres
const WIN = { z0: 0.75, z1: 2.05, y0: 0.95, y1: 2.15 };  // window in the right wall

export const WALL_COLOURS = {
  Cream: '#efe5d3',
  Mint: '#d4e8da',
  Sky: '#d3e2ee',
  Peach: '#f2d9c6',
  White: '#f1f1ec',
};

const std = (o) => new THREE.MeshStandardMaterial(o);

function plane(w, h, mat) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.receiveShadow = true;
  m.castShadow = true;
  return m;
}

function box(w, h, d, mat, x, y, z, r = 0) {
  const geo = r ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  return m;
}

export function buildHome() {
  const g = new THREE.Group();
  g.name = 'home';

  const wallMat = std({ map: tx.repeated(tx.wallPaint(WALL_COLOURS.Cream), 4, 2), roughness: 0.95 });
  const ceilMat = std({ color: 0xf6f6f2, roughness: 1 });
  const tileMat = std({ map: tx.repeated(tx.floorTile(), W / 0.6, D / 0.6), roughness: 0.22, metalness: 0.05 });
  const skirtMat = std({ map: tx.repeated(tx.floorTile('#d9cfbd'), W / 0.6, 0.2), roughness: 0.3 });

  const floor = plane(W, D, tileMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, D / 2);
  floor.castShadow = false;
  g.add(floor);

  const back = plane(W, CEILING, wallMat);
  back.position.set(0, CEILING / 2, 0);
  g.add(back);

  const left = plane(D, CEILING, wallMat);
  left.rotation.y = Math.PI / 2;
  left.position.set(-W / 2, CEILING / 2, D / 2);
  g.add(left);

  // Right wall, built around the window opening so daylight only comes in through the grill.
  const rw = (z0, z1, y0, y1) => {
    const p = plane(z1 - z0, y1 - y0, wallMat);
    p.rotation.y = -Math.PI / 2;
    p.position.set(W / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    g.add(p);
  };
  rw(0, D, 0, WIN.y0);
  rw(0, D, WIN.y1, CEILING);
  rw(0, WIN.z0, WIN.y0, WIN.y1);
  rw(WIN.z1, D, WIN.y0, WIN.y1);

  const ceiling = plane(W, D, ceilMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, CEILING, D / 2);
  g.add(ceiling);

  // Tile skirting, 10 cm, along the three walls.
  g.add(box(W, 0.1, 0.012, skirtMat, 0, 0.05, 0.006));
  g.add(box(0.012, 0.1, D, skirtMat, -W / 2 + 0.006, 0.05, D / 2));
  g.add(box(0.012, 0.1, D, skirtMat, W / 2 - 0.006, 0.05, D / 2));

  // Window: aluminium frame, sky outside, painted steel grill.
  const alu = std({ color: 0xb9bec4, metalness: 0.7, roughness: 0.35 });
  const grillMat = std({ color: 0x1f2a24, metalness: 0.5, roughness: 0.5 });
  const wx = W / 2 - 0.03, wzc = (WIN.z0 + WIN.z1) / 2, wyc = (WIN.y0 + WIN.y1) / 2;
  const ww = WIN.z1 - WIN.z0, wh = WIN.y1 - WIN.y0;
  g.add(box(0.06, 0.05, ww + 0.1, alu, wx, WIN.y0, wzc));
  g.add(box(0.06, 0.05, ww + 0.1, alu, wx, WIN.y1, wzc));
  g.add(box(0.06, wh, 0.05, alu, wx, wyc, WIN.z0));
  g.add(box(0.06, wh, 0.05, alu, wx, wyc, WIN.z1));
  g.add(box(0.05, wh, 0.03, alu, wx, wyc, wzc));
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(ww, wh), new THREE.MeshBasicMaterial({
    map: tx.gradient('sky', [[0, '#9cc9ef'], [0.7, '#dcefff'], [1, '#bfd9a8']]),
  }));
  sky.rotation.y = -Math.PI / 2;
  sky.position.set(W / 2 + 0.25, wyc, wzc);
  g.add(sky);
  for (let i = 1; i < 10; i++) {
    const bar = box(0.014, wh, 0.014, grillMat, W / 2 + 0.06, wyc, WIN.z0 + (ww * i) / 10);
    g.add(bar);
  }
  for (const y of [WIN.y0 + wh * 0.33, WIN.y0 + wh * 0.66]) g.add(box(0.014, 0.02, ww, grillMat, W / 2 + 0.06, y, wzc));

  // Tube light on the back wall.
  const fixture = box(1.24, 0.05, 0.06, std({ color: 0xf4f4f0, roughness: 0.6 }), -1.4, 2.6, 0.04, 0.01);
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 1.18, 16).rotateZ(Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfaf6ee, emissiveIntensity: 1.6 }));
  tube.position.set(-1.4, 2.57, 0.08);
  const tubeLight = new THREE.PointLight(0xfff4e6, 3, 7, 1.6);
  tubeLight.position.set(-1.4, 2.45, 0.5);
  g.add(fixture, tube, tubeLight);

  // Switchboard: four rocker switches and a 3-pin socket.
  const plate = std({ color: 0xf7f6f2, roughness: 0.5 });
  const sb = new THREE.Group();
  sb.add(box(0.27, 0.13, 0.012, plate, 0, 0, 0, 0.004));
  for (let i = 0; i < 4; i++) sb.add(box(0.026, 0.045, 0.01, std({ color: i === 0 ? 0xe9e6dc : 0xffffff, roughness: 0.4 }), -0.1 + i * 0.04, 0.02, 0.01, 0.003));
  const hole = std({ color: 0x2b2b2b });
  for (const [x, y] of [[0.085, 0.03], [0.07, -0.02], [0.1, -0.02]]) {
    const h = new THREE.Mesh(new THREE.CircleGeometry(0.0055, 12), hole);
    h.position.set(x, y, 0.0065);
    sb.add(h);
  }
  sb.position.set(-2.2, 1.3, 0.006);
  g.add(sb);

  return {
    group: g,
    window: { x: W / 2, z: wzc, y: wyc },
    setWall(hex) {
      wallMat.map = tx.repeated(tx.wallPaint(hex), 4, 2);
      wallMat.needsUpdate = true;
    },
  };
}
