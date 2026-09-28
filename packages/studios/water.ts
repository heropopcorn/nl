import type { Effect } from '../core';
import { flowDirection } from '../core/flow';
import { waterFragment } from './water-shader';

/** The old two-phase advected, flow-aligned water shader, not moving dash particles. */
export class WaterSurface {
  private canvas = Object.assign(document.createElement('canvas'), { width: 1280, height: 720 });
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private source: WebGLTexture;
  private flow: WebGLTexture;
  private buffer: WebGLBuffer;
  private flowKey = '';
  private fields = new Map<string, Uint8Array>();
  constructor() {
    const gl = this.canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false });
    if (!gl) throw new Error('水面渲染需要 WebGL，请启用浏览器硬件加速');
    this.gl = gl;
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!; gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { const error = gl.getShaderInfoLog(shader); gl.deleteShader(shader); throw new Error(`水面着色器编译失败：${error}`); }
      return shader;
    };
    const vertex = compile(gl.VERTEX_SHADER, 'attribute vec2 position; void main(){gl_Position=vec4(position,0.0,1.0);}');
    const fragment = compile(gl.FRAGMENT_SHADER, waterFragment);
    const program = gl.createProgram()!; gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
    gl.deleteShader(vertex); gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('水面着色器链接失败');
    this.program = program; gl.useProgram(program);
    this.buffer = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
    const pos = gl.getAttribLocation(program, 'position'); gl.enableVertexAttribArray(pos); gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
    const texture = () => { const t = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D, t); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; };
    this.source = texture(); this.flow = texture();
  }
  render(background: HTMLCanvasElement, effect: Effect, regionIndex: number, frame: number) {
    const gl = this.gl, r = effect.regions[regionIndex], k = 720 / 1024;
    gl.useProgram(this.program);
    const uniform = (name: string) => gl.getUniformLocation(this.program, name);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.source); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, background); gl.uniform1i(uniform('screen_texture'), 0);
    const fallback = effect.flowVector ?? { x: effect.wind < 0 ? -1 : 1, y: 0 };
    const key = JSON.stringify([r.x, r.y, r.width, r.height, effect.flowLines, fallback]);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.flow); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    if (key !== this.flowKey) {
      const size = 48;
      let data = this.fields.get(key);
      if (!data) {
        data = new Uint8Array(size * size * 4);
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const dir = flowDirection({ x: r.x + (x + 0.5) / size * r.width, y: r.y + (1 - (y + 0.5) / size) * r.height }, effect.flowLines, fallback), i = (y * size + x) * 4;
        data[i] = Math.round((dir.x + 1) * 127.5); data[i + 1] = Math.round((-dir.y + 1) * 127.5); data[i + 3] = 255;
        }
        if (this.fields.size >= 24) this.fields.delete(this.fields.keys().next().value!);
        this.fields.set(key, data);
      }
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, data); this.flowKey = key;
    }
    gl.uniform1i(uniform('flow_map'), 1); gl.uniform1i(uniform('has_flow_map'), 1);
    gl.uniform2f(uniform('flow_dir'), fallback.x, -fallback.y);
    gl.uniform2f(uniform('region_size'), r.width, r.height);
    gl.uniform4f(uniform('bounds'), 100 + r.x * k, 720 - (r.y + r.height) * k, r.width * k, r.height * k);
    gl.uniform1f(uniform('director_time'), effect.speed === 0 ? 0 : frame / 30); gl.uniform1f(uniform('flow_speed'), effect.speed * 0.22);
    gl.uniform4f(uniform('tint'), 0.32, 0.68, 0.90, effect.intensity);
    gl.uniform1f(uniform('current_strength'), 0.95); gl.uniform1f(uniform('surface_mist'), 0.08); gl.uniform1f(uniform('refraction_strength'), 0.32);
    gl.disable(gl.SCISSOR_TEST); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.viewport(0, 0, 1280, 720);
    gl.enable(gl.SCISSOR_TEST); gl.scissor(Math.floor(100 + r.x * k), Math.floor(r.y * k), Math.ceil(r.width * k) + 1, Math.ceil(r.height * k) + 1);
    gl.drawArrays(gl.TRIANGLES, 0, 6); gl.disable(gl.SCISSOR_TEST);
    return this.canvas;
  }
  dispose() { const gl = this.gl; gl.deleteTexture(this.source); gl.deleteTexture(this.flow); gl.deleteBuffer(this.buffer); gl.deleteProgram(this.program); gl.getExtension('WEBGL_lose_context')?.loseContext(); }
}
