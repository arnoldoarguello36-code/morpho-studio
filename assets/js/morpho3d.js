(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Hero: pointer tilt on the specimen plate (cheap, no 3D library) ---------- */
  const plate = document.getElementById('mphPlate'), tilt = document.getElementById('mphTilt');
  if (plate && tilt && !reduce && matchMedia('(hover: hover)').matches) {
    plate.addEventListener('pointermove', e => {
      const r = plate.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
      tilt.style.transform = `perspective(900px) rotateY(${x * 14}deg) rotateX(${-y * 12}deg)`;
    });
    plate.addEventListener('pointerleave', () => { tilt.style.transform = ''; });
  }

  /* ---------- Process: scroll progress, shared by 3D and fallback ---------- */
  const stepsEl = document.getElementById('mphSteps');
  if (!stepsEl) return;
  const steps = [...stepsEl.children];
  const stage = document.getElementById('mphStage'), nameEl = document.getElementById('mphStageName'),
        figEl = document.getElementById('mphStageFig'), pctEl = document.getElementById('mphPct');
  let lastIdx = -1;
  function progress() {
    const r = stepsEl.getBoundingClientRect(), vh = innerHeight;
    const start = vh * 0.7, span = r.height - vh * 0.35;
    return Math.min(1, Math.max(0, (start - r.top) / span));
  }
  function updateUI(p) {
    stage.style.setProperty('--mph-p', p.toFixed(3));
    pctEl.textContent = Math.round(p * 100) + '%';
    const idx = Math.min(3, Math.floor(p * 4 + 0.02));
    if (idx !== lastIdx) {
      lastIdx = idx;
      steps.forEach((s, i) => s.classList.toggle('active', i === idx));
      nameEl.textContent = steps[idx].dataset.name;
      figEl.textContent = 'Fig. ' + (idx + 2);
    }
  }
  updateUI(progress());

  function useFallback() {
    document.getElementById('mphCanvas').hidden = true;
    document.getElementById('mphStageFallback').hidden = false;
    addEventListener('scroll', () => updateUI(progress()), { passive: true });
  }

  /* ---------- Lazy-load Three.js only when the process section approaches ---------- */
  const glOK = (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl') || c.getContext('experimental-webgl')); } catch (e) { return false; } })();
  if (!glOK) { useFallback(); return; }
  const io = new IntersectionObserver(entries => {
    if (!entries.some(e => e.isIntersecting)) return;
    io.disconnect();
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
    s.onload = () => { try { initMorpho(); } catch (err) { console.error(err); useFallback(); } };
    s.onerror = useFallback;
    document.head.appendChild(s);
  }, { rootMargin: '600px 0px' });
  io.observe(document.getElementById('mphProcessGrid'));

  function initMorpho() {
    const canvas = document.getElementById('mphCanvas');
    const view = canvas.parentElement;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);

    /* Wing outlines as polar radius tables [angle°, radius] around each wing root */
    const FORE = { root: [0.035, 0.03], d0: -16, d1: 80, cup: 0.10,
      t: [[-16,.42],[-4,.62],[10,.84],[24,1.0],[37,1.13],[47,1.2],[56,1.12],[64,.9],[72,.58],[80,.26]] };
    const HIND = { root: [0.035, -0.04], d0: -104, d1: -6, cup: 0.07,
      t: [[-104,.26],[-94,.52],[-80,.76],[-64,.9],[-48,.92],[-34,.84],[-20,.68],[-6,.48]] };

    const cr = (a,b,c,d,t) => { const t2=t*t, t3=t2*t; return .5*(2*b + (-a+c)*t + (2*a-5*b+4*c-d)*t2 + (-a+3*b-3*c+d)*t3); };
    function R(tab, deg) {
      let i = 0; while (i < tab.length - 2 && deg > tab[i+1][0]) i++;
      const a = tab[Math.max(i-1,0)], b = tab[i], c = tab[i+1], d = tab[Math.min(i+2, tab.length-1)];
      const t = Math.min(1, Math.max(0, (deg - b[0]) / (c[0] - b[0])));
      return cr(a[1], b[1], c[1], d[1], t);
    }
    function pt(w, u, v) {
      const deg = w.d0 + v * (w.d1 - w.d0), rad = deg * Math.PI / 180, r = R(w.t, deg) * u;
      return [w.root[0] + Math.cos(rad) * r, w.root[1] + Math.sin(rad) * r, w.cup * u * u + 0.035 * Math.sin(v * Math.PI) * u];
    }
    function wingMesh(w, U = 26, V = 56) {
      const pos = [], uv = [], idx = [];
      for (let i = 0; i <= U; i++) for (let j = 0; j <= V; j++) { const u = i/U, v = j/V; pos.push(...pt(w, u, v)); uv.push(u, v); }
      for (let i = 0; i < U; i++) for (let j = 0; j < V; j++) {
        const a = i*(V+1)+j, b = a+1, c = a+V+1, d = c+1; idx.push(a, c, b, b, c, d);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('wuv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx); g.computeVertexNormals(); return g;
    }
    function wingLines(w, rings = 6, spokes = 11, fine = 60, seg = 10) {
      const pos = [], lu = [];
      const push = (u, v) => { pos.push(...pt(w, u, v)); lu.push(u); };
      for (let i = 1; i <= rings; i++) { const u = i / rings; for (let j = 0; j < fine; j++) { push(u, j/fine); push(u, (j+1)/fine); } }
      for (let j = 0; j <= spokes; j++) { const v = j / spokes; for (let k = 0; k < seg; k++) { push(k/seg, v); push((k+1)/seg, v); } }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('lu', new THREE.Float32BufferAttribute(lu, 1));
      return g;
    }

    const U = { uTime: { value: 0 }, uFill: { value: 0 }, uWire: { value: 0 }, uLineOp: { value: 1 } };

    const wingMat = new THREE.ShaderMaterial({
      uniforms: U, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: `
        attribute vec2 wuv; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        void main(){ vUv = wuv; vec4 wp = modelMatrix * vec4(position,1.0);
          vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz);
          gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: `
        uniform float uTime, uFill; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        void main(){
          vec3 N = normalize(vN); if(!gl_FrontFacing) N = -N;
          float ndv = clamp(abs(dot(N, normalize(vV))), 0.0, 1.0);
          float fres = pow(1.0 - ndv, 2.0);
          float u = vUv.x, v = vUv.y;
          // thin-film: thickness field + viewing angle -> spectral phase
          float th = 0.55 + 0.22*sin(u*5.0 + v*3.0 + uTime*0.25) + 0.12*sin(v*11.0 - u*4.0 - uTime*0.15);
          float phase = th*1.5 + (1.0 - ndv)*1.3;
          vec3 film = 0.5 + 0.5*cos(6.2832*(phase + vec3(0.0, 0.33, 0.67)));
          vec3 deep = vec3(0.04,0.10,0.40), morpho = vec3(0.18,0.42,1.0), cyan = vec3(0.45,0.88,1.0);
          vec3 base = mix(deep, morpho, 0.25 + 0.75*smoothstep(0.0, 0.75, u));
          base = mix(base, cyan, smoothstep(0.35, 0.95, u) * 0.35 * (0.5 + 0.5*sin(v*6.0 + uTime*0.3)));
          vec3 col = mix(base, film, 0.16 + 0.5*fres);
          float vv = abs(fract(v*9.0 + 0.5) - 0.5);
          col *= 1.0 - 0.28*(1.0 - smoothstep(0.0, 0.035, vv))*smoothstep(0.08, 0.9, u);
          float rim = smoothstep(0.9, 1.0, u);
          col += vec3(0.75,0.86,1.0)*rim*0.65 + film*rim*0.35;
          float sp = hash(floor(vec2(u*80.0, v*140.0)));
          col += step(0.986, sp) * 0.7 * (0.5 + 0.5*sin(uTime*2.5 + sp*50.0)) * smoothstep(0.2,0.8,u);
          float a = 0.40 + 0.35*fres + 0.35*rim + 0.15*u;
          float edge = uFill*1.25;
          a *= 1.0 - smoothstep(edge - 0.25, edge, u);
          gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
        }`
    });

    const lineMat = new THREE.ShaderMaterial({
      uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute float lu; varying float vU; void main(){ vU = lu; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform float uWire, uLineOp; varying float vU;
        void main(){ float e = uWire*1.2; float a = uLineOp * (1.0 - smoothstep(e - 0.2, e, vU));
          gl_FragColor = vec4(vec3(0.62,0.85,1.0) * a, a); }`
    });

    const bodyMat = new THREE.ShaderMaterial({
      uniforms: U, transparent: true,
      vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 wp = modelMatrix*vec4(position,1.0);
        vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix*viewMatrix*wp; }`,
      fragmentShader: `uniform float uFill; varying vec3 vN; varying vec3 vV;
        void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
          vec3 c = mix(vec3(0.03,0.07,0.2), vec3(0.6,0.82,1.0), f);
          gl_FragColor = vec4(c, mix(0.25, 0.95, uFill)); }`
    });
    const bodyWire = new THREE.MeshBasicMaterial({ color: 0x9fd4ff, wireframe: true, transparent: true, opacity: .35, depthWrite: false });

    const fly = new THREE.Group(); scene.add(fly);
    const geo = { fore: wingMesh(FORE), hind: wingMesh(HIND), foreL: wingLines(FORE), hindL: wingLines(HIND, 5, 9) };

    function side(mirror) {
      const outer = new THREE.Group(), inner = new THREE.Group();
      if (mirror) inner.scale.x = -1;
      const fore = new THREE.Group(), hind = new THREE.Group();
      fore.add(new THREE.Mesh(geo.fore, wingMat), new THREE.LineSegments(geo.foreL, lineMat));
      hind.add(new THREE.Mesh(geo.hind, wingMat), new THREE.LineSegments(geo.hindL, lineMat));
      hind.children[0].renderOrder = 0; fore.children[0].renderOrder = 1;
      inner.add(hind, fore); outer.add(inner); fly.add(outer);
      return { outer, fore, hind };
    }
    const right = side(false), left = side(true);

    const sph = new THREE.SphereGeometry(1, 24, 16);
    const parts = [[0, -0.14, 0, .04, .3, .04], [0, .05, 0, .058, .11, .058], [0, .19, 0, .045, .045, .045]];
    const bodyWires = [];
    parts.forEach(([x, y, z, sx, sy, sz]) => {
      const m = new THREE.Mesh(sph, bodyMat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.renderOrder = 2; fly.add(m);
      const w = new THREE.Mesh(sph, bodyWire); w.position.copy(m.position); w.scale.copy(m.scale).multiplyScalar(1.01); fly.add(w); bodyWires.push(w);
    });
    const antMat = new THREE.LineBasicMaterial({ color: 0x9fd4ff, transparent: true, opacity: .8 });
    [-1, 1].forEach(s => {
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(s*.02,.22,0), new THREE.Vector3(s*.06,.38,.02), new THREE.Vector3(s*.14,.56,.05)]);
      fly.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(24)), antMat));
      const tip = new THREE.Mesh(new THREE.SphereGeometry(.014, 12, 8), bodyMat); tip.position.set(s*.14, .56, .05); fly.add(tip);
    });

    // faint spectral dust, visible once color arrives
    const N = 110, dp = [], ds = [];
    for (let i = 0; i < N; i++) { const r = 0.6 + Math.random()*1.4, a = Math.random()*6.283, b = (Math.random()-.5)*2;
      dp.push(Math.cos(a)*r, b, Math.sin(a)*r*.6); ds.push(Math.random()); }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.Float32BufferAttribute(dp, 3));
    dg.setAttribute('seed', new THREE.Float32BufferAttribute(ds, 1));
    const dust = new THREE.Points(dg, new THREE.ShaderMaterial({
      uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute float seed; uniform float uTime; varying float vA; varying float vS;
        void main(){ vec4 mv = modelViewMatrix * vec4(position + vec3(0.0, sin(uTime*0.3 + seed*20.0)*0.05, 0.0), 1.0);
          vS = seed; vA = 0.4 + 0.6*sin(uTime*1.3 + seed*40.0); gl_PointSize = (2.0 + seed*3.0) * (3.5 / -mv.z) * ${renderer.getPixelRatio().toFixed(2)};
          gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uFill; varying float vA; varying float vS;
        void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * vA * smoothstep(0.6, 1.0, uFill) * 0.7;
          vec3 c = mix(vec3(0.5,0.85,1.0), vec3(0.7,0.6,1.0), vS); gl_FragColor = vec4(c*a, a); }`
    }));
    scene.add(dust);

    function fit() {
      const w = view.clientWidth, h = view.clientHeight; if (!w || !h) return;
      renderer.setSize(w, h, false); camera.aspect = w / h;
      const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      camera.position.set(0, 0, Math.max(1.3 / t, 1.45 / (t * camera.aspect)) * 1.05);
      camera.lookAt(0, 0, 0); camera.updateProjectionMatrix();
    }
    new ResizeObserver(fit).observe(view); fit();

    let visible = true, ps = progress(), raf = 0;
    new IntersectionObserver(e => { visible = e[0].isIntersecting; if (visible && !raf) loop(); }, { rootMargin: '100px' }).observe(stage);
    const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t*t*(3 - 2*t); };
    const t0 = performance.now();

    function loop() {
      raf = 0; if (!visible) return;
      const t = reduce ? 2.0 : (performance.now() - t0) / 1000;
      const p = progress();
      ps = reduce ? p : ps + (p - ps) * 0.09;
      updateUI(ps);

      U.uTime.value = t;
      U.uWire.value = 0.14 + 0.86 * Math.min(1, ps / 0.45);
      U.uFill.value = ss(0.42, 0.82, ps);
      U.uLineOp.value = 0.95 - 0.8 * U.uFill.value;
      bodyWire.opacity = 0.35 * (1 - U.uFill.value);
      antMat.opacity = 0.35 + 0.5 * U.uFill.value;

      const flapAmt = ss(0.72, 1.0, ps);
      const beat = Math.pow(0.5 + 0.5 * Math.sin(t * 2.4), 1.6);
      const f = flapAmt * (0.08 + 0.62 * beat);
      right.outer.rotation.y = -f; left.outer.rotation.y = f;
      right.hind.rotation.y = left.hind.rotation.y = 0;
      right.hind.rotation.x = left.hind.rotation.x = -0.06 * flapAmt * beat;

      // pose: flat dorsal plate -> three-quarter view in flight
      const k = ss(0.3, 1.0, ps), sway = reduce ? 0 : 1;
      fly.rotation.set(-0.55 * k + 0.04 * Math.sin(t*0.5) * sway, 0.5 * k + 0.08 * Math.sin(t*0.37) * sway * k, -0.12 * k);
      fly.position.y = 0.04 * Math.sin(t * 1.2) * flapAmt * sway;
      dust.rotation.y = t * 0.03;

      renderer.render(scene, camera);
      if (reduce) { addEventListener('scroll', onScrollOnce, { passive: true, once: true }); return; }
      raf = requestAnimationFrame(loop);
    }
    function onScrollOnce() { if (!raf) raf = requestAnimationFrame(loop); }
    loop();
  }
})();
