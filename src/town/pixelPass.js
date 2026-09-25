import * as THREE from 'three';

// Low-resolution render + edge pass in the style of "3D pixel art":
// the scene renders at 1/pixelSize resolution, silhouettes get a dark
// outline from depth discontinuities, creases get a light rim from normal
// discontinuities, and the result is upscaled with nearest filtering.

export class PixelPass {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.pixelSize = 3;
    this.outlines = true;
    this.dither = true;
    this.enabled = true;

    // half-float colour buffers need an extension some mobile GPUs lack
    const ext = renderer.extensions;
    const halfOk = ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float');
    const opts = { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, type: halfOk ? THREE.HalfFloatType : THREE.UnsignedByteType };
    this.colorRT = new THREE.WebGLRenderTarget(1, 1, opts);
    this.colorRT.depthTexture = new THREE.DepthTexture(1, 1);
    this.normalRT = new THREE.WebGLRenderTarget(1, 1, { ...opts, type: THREE.UnsignedByteType });
    this.normalMaterial = new THREE.MeshNormalMaterial();

    this.quadScene = new THREE.Scene();
    this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: this.colorRT.texture },
        tDepth: { value: this.colorRT.depthTexture },
        tNormal: { value: this.normalRT.texture },
        uResolution: { value: new THREE.Vector2() },
        uNear: { value: camera.near },
        uFar: { value: camera.far },
        uOutline: { value: 0.42 },
        uHighlight: { value: 0.3 },
        uEdges: { value: 1 },
        uDither: { value: 1 },
        uNight: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        #include <packing>
        uniform sampler2D tColor, tDepth, tNormal;
        uniform vec2 uResolution;
        uniform float uNear, uFar, uOutline, uHighlight, uEdges, uDither, uNight;
        varying vec2 vUv;

        float depthAt(vec2 uv) {
          return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, uNear, uFar);
        }
        vec3 normalAt(vec2 uv) { return texture2D(tNormal, uv).xyz * 2.0 - 1.0; }

        float bayer4(vec2 p) {
          ivec2 i = ivec2(mod(p, 4.0));
          int idx = i.x + i.y * 4;
          float m[16];
          m[0]=0.;m[1]=8.;m[2]=2.;m[3]=10.;m[4]=12.;m[5]=4.;m[6]=14.;m[7]=6.;
          m[8]=3.;m[9]=11.;m[10]=1.;m[11]=9.;m[12]=15.;m[13]=7.;m[14]=13.;m[15]=5.;
          for (int k = 0; k < 16; k++) if (k == idx) return m[k] / 16.0 - 0.5;
          return 0.0;
        }

        void main() {
          vec2 texel = 1.0 / uResolution;
          vec4 base = texture2D(tColor, vUv);
          vec3 col = base.rgb;

          if (uEdges > 0.5) {
            float d = depthAt(vUv);
            vec3 n = normalAt(vUv);
            float depthEdge = 0.0;
            float normalEdge = 0.0;
            vec2 offs[4];
            offs[0] = vec2(1.0, 0.0); offs[1] = vec2(-1.0, 0.0);
            offs[2] = vec2(0.0, 1.0); offs[3] = vec2(0.0, -1.0);
            float thresh = 0.12 + d * 0.035;
            for (int i = 0; i < 4; i++) {
              vec2 uv = vUv + offs[i] * texel;
              float dn = depthAt(uv);
              depthEdge += clamp(dn - d - thresh, 0.0, 1.0);
              vec3 nn = normalAt(uv);
              float nd = dot(n - nn, vec3(-0.6, 0.6, 0.4));
              float ni = smoothstep(-0.01, 0.01, nd);
              float di = clamp(sign(d - dn + 0.08 + d * 0.01), 0.0, 1.0);
              normalEdge += (1.0 - dot(n, nn)) * ni * di;
            }
            depthEdge = clamp(depthEdge, 0.0, 1.0);
            normalEdge = step(0.18, normalEdge);
            float far = 1.0 - smoothstep(55.0, 110.0, d);
            if (depthEdge > 0.0) col *= 1.0 - uOutline * far;
            else col *= 1.0 + uHighlight * normalEdge * far * (1.0 - uNight * 0.6);
          }

          // gentle grade: a touch more saturation for the painted look
          float l = dot(col, vec3(0.299, 0.587, 0.114));
          col = mix(vec3(l), col, 1.12);

          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>

          if (uDither > 0.5) {
            float levels = 28.0;
            vec3 c = gl_FragColor.rgb * levels + bayer4(gl_FragCoord.xy) * 0.9;
            gl_FragColor.rgb = floor(c + 0.5) / levels;
          }
        }
      `,
      depthTest: false,
      depthWrite: false,
    });
    this.quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material));
  }

  setSize(width, height) {
    const p = this.enabled ? this.pixelSize : 1 / Math.min(window.devicePixelRatio, 2);
    const w = Math.max(1, Math.floor(width / p));
    const h = Math.max(1, Math.floor(height / p));
    this.width = w;
    this.height = h;
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w, h, false);
    this.colorRT.setSize(w, h);
    this.normalRT.setSize(w, h);
    this.material.uniforms.uResolution.value.set(w, h);
    const canvas = this.renderer.domElement;
    canvas.style.width = '100vw';
    canvas.style.height = '100vh';
    canvas.style.imageRendering = this.enabled ? 'pixelated' : 'auto';
  }

  render(night) {
    const { renderer, scene, camera } = this;
    const u = this.material.uniforms;
    u.uNear.value = camera.near;
    u.uFar.value = camera.far;
    u.uEdges.value = this.outlines ? 1 : 0;
    u.uDither.value = this.dither && this.enabled ? 1 : 0;
    u.uNight.value = night;

    camera.layers.enableAll();
    renderer.setRenderTarget(this.colorRT);
    renderer.render(scene, camera);

    if (this.outlines) {
      const bg = scene.background;
      const fog = scene.fog;
      scene.background = null;
      scene.fog = null;
      scene.overrideMaterial = this.normalMaterial;
      camera.layers.set(0);
      renderer.setRenderTarget(this.normalRT);
      renderer.setClearColor(0x000000, 1);
      renderer.clear();
      renderer.render(scene, camera);
      scene.overrideMaterial = null;
      scene.background = bg;
      scene.fog = fog;
      camera.layers.enableAll();
    }

    renderer.setRenderTarget(null);
    renderer.render(this.quadScene, this.quadCamera);
  }
}
