// The sky behind the page: an ocean world with two moons over the Rosette Nebula, the same scene as the game's
// main menu, drawn at a low resolution and scaled up without smoothing. It runs in a fragment shader so the camera
// can follow the scroll and every frame stays real pixel art: the ordered dithering is locked to the screen, never
// scaled.
//
// The scroll drives it: the moons orbit, the planet turns, the camera pulls back, the colonies go dark and the fleet
// leaves. Further down the same shader draws the dead world the visitor terraforms.

type Rgb = readonly [number, number, number];
const hex = (value: number): Rgb => [(value >> 16) & 255, (value >> 8) & 255, value & 255];

// The colour ramps, dark to light. They are the game's own.
const RAMPS: Record<string, readonly Rgb[]> = {
    NEBULA: [0x09070f, 0x110a17, 0x1c0d1f, 0x2a1027, 0x3d1430].map(hex),
    DEEP: [0x05080f, 0x08121e, 0x0c1e2e, 0x112d40, 0x194157, 0x255a6e].map(hex),
    SHALLOW: [0x060b10, 0x0b1820, 0x112834, 0x193b45, 0x245257, 0x336d6c].map(hex),
    LOWLAND: [0x0b080d, 0x1d1419, 0x352320, 0x55352a, 0x784c35, 0x9a6741].map(hex),
    HIGHLAND: [0x0d0a0f, 0x221a1d, 0x3d2e2a, 0x5f4836, 0x856749, 0xab8a62].map(hex),
    ICE: [0x0c0f17, 0x1f2532, 0x3c4658, 0x66748a, 0x9cabbd, 0xd2dde6].map(hex),
    CLOUD: [0x10121b, 0x262b38, 0x464e5f, 0x737e8f, 0xa9b4c2, 0xe2e9ef].map(hex),
    LIFE: [0x0a140f, 0x10291c, 0x1b4a2c, 0x2e6a38, 0x4e9446, 0x86c060].map(hex),
    ROCK: [0x0e0c12, 0x2a2629, 0x4f4642, 0x7a6c61, 0xa8988a].map(hex),
    FROST: [0x0e1018, 0x283244, 0x51637a, 0x8ea6bd, 0xcfe0ee].map(hex),
};

const glColor = ([r, g, b]: Rgb) => `vec3(${(r / 255).toFixed(4)},${(g / 255).toFixed(4)},${(b / 255).toFixed(4)})`;
const offsets: Record<string, number> = {};
const flat: string[] = [];
for (const [name, ramp] of Object.entries(RAMPS)) {
    offsets[name] = flat.length;
    flat.push(...ramp.map(glColor));
}
const ramp = (name: string) => `${offsets[name]},${RAMPS[name]!.length}`;

const VERTEX = `#version 300 es
in vec2 corner;
void main() { gl_Position = vec4(corner, 0.0, 1.0); }`;

const FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
out vec4 fragColor;

uniform vec2 uRes;
uniform float uTime;
uniform vec3 uPlanet;   // centre x, y and radius, in art pixels (radius 0 hides it)
uniform vec2 uSpin;     // how far the surface and the clouds have turned
uniform vec4 uWorld;    // sea level, atmosphere, clouds, life
uniform float uIce;     // the latitude where the caps begin
uniform float uSeed;
uniform float uLights;  // how many of the colonies still have their lights on
uniform vec4 uMoonA;    // x, y, radius, 1 when it passes in front of the planet
uniform vec4 uMoonB;
uniform vec3 uFleet;    // x, y and how many ships are shown
uniform vec2 uParallax;
uniform float uNebula;
uniform float uCutout;  // 1: no sky, for stills on a transparent ground
uniform float uLightZ;  // how far the star is moved towards the camera (0: as in the menu, side-on)
uniform vec2 uVeil;     // a dithered darkness behind the text: how strong, and how far across it reaches

const vec3 COLORS[${flat.length}] = vec3[${flat.length}](${flat.join(",")});
const vec3 SPACE = vec3(0.0235, 0.0196, 0.0471);
const vec3 AIR = vec3(0.2471, 0.8157, 0.8314);
const vec3 THIN_AIR = vec3(0.7804, 0.5412, 0.3412);
vec3 LIGHT;
const float TILT = -1.12;
const float PI = 3.14159265;
const float BAYER[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
const ivec2 SHIPS[7] = ivec2[7](ivec2(0,0), ivec2(9,-5), ivec2(11,6), ivec2(21,-9), ivec2(24,3), ivec2(33,-3), ivec2(38,8));

float bayer(ivec2 p) { return (BAYER[(p.y & 3) * 4 + (p.x & 3)] + 0.5) / 16.0; }

// One colour of a ramp, with the jump between shades dithered the way the game does it.
vec3 shade(int start, int count, float light, float dither) {
    float top = float(count - 1);
    float level = clamp(light * top + (dither - 0.5) * 0.4, 0.0, top);
    return COLORS[start + int(level + 0.5)];
}

float hash13(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.zyx + 31.32);
    return fract((p.x + p.y) * p.z);
}
float hash12(vec2 p) {
    vec3 q = fract(vec3(p.xyx) * 0.1031);
    q += dot(q, q.yzx + 33.33);
    return fract((q.x + q.y) * q.z);
}
float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    vec3 u = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(mix(hash13(i), hash13(i + vec3(1,0,0)), u.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), u.x), u.y),
        mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), u.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), u.x), u.y),
        u.z);
}
float fbm(vec3 p, int octaves) {
    float sum = 0.0, amplitude = 0.5, total = 0.0;
    for (int i = 0; i < octaves; i++) {
        sum += noise(p) * amplitude;
        total += amplitude;
        amplitude *= 0.5;
        p *= 2.03;
    }
    return sum / total;
}

const float STAR = 0.99722;     // one cell in 360 holds a star
const float FLASHING = 0.05;    // of those, how many flash with a cross at their peak
const float GOING_OUT = 0.14;   // how many go out altogether and come back (the flashing ones among them)
const float BREATHING = 0.38;   // how many dim and brighten without going out
const vec2 ARMS[4] = vec2[4](vec2(1.0, 0.0), vec2(-1.0, 0.0), vec2(0.0, 1.0), vec2(0.0, -1.0));

vec3 starTint(vec2 cell) {
    float kind = hash12(cell + 19.0);
    return kind < 0.15 ? vec3(0.949, 0.769, 0.541) : kind < 0.35 ? vec3(0.663, 0.784, 0.941) : vec3(0.902, 0.925, 0.961);
}

// How bright a star is right now, in steps like the rest of the art. Each one keeps its own time.
float starLight(vec2 cell) {
    float base = hash12(cell + 31.0) < 0.12 ? 1.0 : 0.55;
    float mode = hash12(cell + 43.0);
    if (mode >= BREATHING) return base;
    float speed = 0.6 + hash12(cell + 19.0) * 1.2;
    float wave = 0.5 + 0.5 * sin(uTime * speed + hash12(cell + 57.0) * 6.2832);
    float light = mode < GOING_OUT ? smoothstep(0.3, 0.8, wave) * max(base, 0.85) : base * (0.45 + 0.55 * wave);
    return floor(light * 6.0 + 0.5) / 6.0;
}

vec4 sky(ivec2 ip, vec2 p, float dither) {
    if (uCutout > 0.5) return vec4(0.0);
    vec3 color = SPACE;
    vec2 drift = p + uParallax * 0.35;
    float n = fbm(vec3(drift / 140.0, 3.1), 5);
    vec2 reach = (p - uRes * vec2(0.78, 0.15)) / (uRes * vec2(0.75, 0.95));
    float glow = max(0.0, n * 1.7 - 0.5) * max(0.0, 1.0 - length(reach)) * 1.9 * uNebula;
    if (glow > 0.006 + dither * 0.05) color = shade(${ramp("NEBULA")}, min(1.0, glow * 0.9), dither);

    vec2 cell = floor(p + uParallax);
    if (hash12(cell + 7.0) > STAR) {
        color = max(color, starTint(cell) * starLight(cell));
    } else {
        // The stars that flash throw a small cross of light at their peak.
        for (int i = 0; i < 4; i++) {
            vec2 near = cell + ARMS[i];
            if (hash12(near + 7.0) > STAR && hash12(near + 43.0) < FLASHING) {
                float light = starLight(near);
                if (light > 0.7) color = max(color, starTint(near) * (light - 0.35));
            }
        }
    }
    return vec4(color, 1.0);
}

vec4 moon(vec4 under, vec4 m, int start, int count, float seed, int craters, vec2 p, float dither) {
    if (m.z <= 0.0) return under;
    vec2 q = (p - m.xy) / m.z;
    float d2 = dot(q, q);
    if (d2 > 1.0) return under;
    vec3 normal = vec3(q, sqrt(1.0 - d2));
    float light = max(0.0, dot(normal, LIGHT));
    float tone = 0.55 + (fbm(normal * 3.0 + seed, 4) - 0.5) * 0.7;
    for (int i = 0; i < craters; i++) {
        float f = float(i);
        vec3 c = vec3(hash12(vec2(f, seed)), hash12(vec2(seed, f + 9.0)), hash12(vec2(f + 5.0, seed + 3.0)));
        float cd = length(q - (c.xy * 2.0 - 1.0)) / (0.08 + c.z * 0.2);
        if (cd < 1.0) tone -= (1.0 - cd) * 0.22;
        else if (cd < 1.25) tone += 0.06;
    }
    return vec4(shade(start, count, min(1.0, light * (0.45 + clamp(tone, 0.0, 1.0) * 0.8)), dither), 1.0);
}

vec3 planet(vec2 d, float d2, float dither) {
    float radius = uPlanet.z;
    float dz = sqrt(1.0 - d2);
    float ct = cos(TILT), st = sin(TILT);
    float ry = d.y * ct - dz * st;
    float rz = d.y * st + dz * ct;
    float light = min(1.0, 0.02 + max(0.0, dot(vec3(d, dz), LIGHT)) * 1.15);
    vec3 axis = vec3(d.x, ry, rz);
    float cs = cos(uSpin.x), sn = sin(uSpin.x);
    vec3 q = vec3(axis.x * cs - axis.z * sn, axis.y, axis.x * sn + axis.z * cs);
    vec3 shift = vec3(13.0, 7.0, 3.0) * uSeed;

    float sea = uWorld.x;
    float height = fbm(q * 7.0 + vec3(11.0, 3.0, 5.0) + shift, 6) * 0.8 + fbm(q * 2.5 + vec3(0.0, 0.0, 20.0) + shift, 3) * 0.2;
    float lat = asin(clamp(ry, -1.0, 1.0));
    float latitude = abs(lat / PI) * 2.0;
    vec3 color;
    if (latitude > uIce - (height - 0.5) * 0.4) color = shade(${ramp("ICE")}, light, dither);
    else if (height < sea) color = shade(${ramp("DEEP")}, light, dither);
    else if (sea > 0.3 && height < sea + 0.04) color = shade(${ramp("SHALLOW")}, light, dither);
    else if (height < max(sea, 0.42) + 0.11) color = shade(${ramp("LOWLAND")}, light, dither);
    else color = shade(${ramp("HIGHLAND")}, light, dither);

    // Life spreads from the coasts, one dithered pixel at a time.
    if (uWorld.w > 0.0 && height >= sea && latitude < uIce - 0.04) {
        float reach = uWorld.w * (1.0 - clamp((height - sea) / 0.1, 0.0, 1.0)) * 1.1;
        if (reach > dither) color = shade(${ramp("LIFE")}, light, dither);
    }

    // The colonies: amber points on the night side. They go out one at a time as uLights falls.
    if (uLights > 0.0 && light < 0.13 && height >= sea && height < sea + 0.13) {
        vec3 cell = floor(q * 92.0);
        float chance = hash13(cell + 5.0);
        if (chance > 0.94 && fract(chance * 613.7) < uLights) color = vec3(0.961, 0.659, 0.231);
    }

    // The clouds turn faster than the ground, in bands that fray.
    if (uWorld.z > 0.0 && light > 0.03) {
        float cc = cos(uSpin.y), cn = sin(uSpin.y);
        vec3 r = vec3(axis.x * cc - axis.z * cn, axis.y, axis.x * cn + axis.z * cc);
        float band = 0.5 + 0.5 * sin(lat * 26.0 + fbm(r * 8.0 + vec3(0.0, 0.0, 40.0), 3) * 7.0);
        float cloud = fbm(vec3(r.x * 14.0 + 31.0, r.y * 26.0 + 17.0, r.z * 14.0 + 9.0), 5) * 0.72 + band * 0.28;
        float gate = 0.57 + (1.0 - uWorld.z) * 0.16;
        if (cloud > gate) {
            float density = min(1.0, (cloud - gate) * 5.0);
            if (density > dither * 0.9) color = shade(${ramp("CLOUD")}, light * (0.65 + density * 0.35), dither);
        }
    }

    // The atmosphere seen edge-on takes the light near the rim.
    float atmosphere = uWorld.y;
    if (atmosphere > 0.0) {
        float band = 9.0 * clamp(radius / 250.0, 0.5, 1.0);
        float rim = pow(max(0.0, 1.0 - (1.0 - sqrt(d2)) * radius / band), 2.0);
        float scatter = rim * (0.25 + light) * 0.85 * atmosphere;
        if (scatter > 0.04) color = mix(color, mix(THIN_AIR, AIR, smoothstep(0.35, 0.85, atmosphere)), min(0.75, scatter));
    }
    return color;
}

vec4 fleet(vec4 under, ivec2 ip) {
    if (uFleet.z < 0.5) return under;
    ivec2 origin = ip - ivec2(floor(uFleet.xy));
    for (int i = 0; i < 7; i++) {
        if (float(i) >= uFleet.z) break;
        ivec2 r = origin - SHIPS[i];
        // A few pixels, flying left: the nose, the hull, a fin and the engine. The first ship is larger: it is yours.
        if (r.y == 0) {
            if (r.x == -2) return vec4(0.902, 0.925, 0.961, 1.0);
            if (r.x >= -1 && r.x <= 1) return vec4(0.639, 0.671, 0.761, 1.0);
            if (r.x == 2 && fract(uTime * 3.0 + float(i) * 0.37) < 0.8) return vec4(0.961, 0.659, 0.231, 1.0);
        }
        if (r.y == -1 && r.x >= 0 && r.x <= 1) return vec4(0.498, 0.533, 0.651, 1.0);
        if (i == 0) {
            if (r.y == 1 && r.x >= -1 && r.x <= 1) return vec4(0.392, 0.424, 0.561, 1.0);
            if (abs(r.y) == 1 && r.x == 2) return vec4(0.961, 0.659, 0.231, 1.0);
            if (r.y == 0 && r.x == -3) return vec4(0.902, 0.925, 0.961, 1.0);
        }
    }
    return under;
}

void main() {
    LIGHT = normalize(vec3(0.85, -0.36, -0.04 + uLightZ));
    ivec2 ip = ivec2(int(gl_FragCoord.x), int(uRes.y) - 1 - int(gl_FragCoord.y));
    vec2 p = vec2(ip) + 0.5;
    float dither = bayer(ip);

    vec2 d = vec2(2.0);
    float d2 = 4.0;
    if (uPlanet.z > 0.0) {
        d = (p - uPlanet.xy) / uPlanet.z;
        d2 = dot(d, d);
    }

    vec4 color = vec4(0.0);
    if (d2 > 1.0) {
        color = sky(ip, p, dither);
        if (uMoonA.w < 0.5) color = moon(color, uMoonA, ${ramp("ROCK")}, 2.7, 14, p, dither);
        if (uMoonB.w < 0.5) color = moon(color, uMoonB, ${ramp("FROST")}, 6.1, 4, p, dither);
        if (uPlanet.z > 0.0 && uWorld.y > 0.0) {
            float reach = 7.0 * clamp(uPlanet.z / 250.0, 0.55, 1.0);
            float outside = (sqrt(d2) - 1.0) * uPlanet.z;
            if (outside < reach) {
                float facing = max(0.0, (d.x * LIGHT.x + d.y * LIGHT.y) / sqrt(d2));
                float strength = pow(1.0 - outside / reach, 2.0) * (0.25 + 0.75 * facing) * uWorld.y;
                if (strength >= dither * 0.6) color = vec4(mix(color.rgb, mix(THIN_AIR, AIR, smoothstep(0.35, 0.85, uWorld.y)), min(1.0, strength)), 1.0);
            }
        }
    } else {
        color = vec4(planet(d, d2, dither), 1.0);
    }
    color = fleet(color, ip);
    if (uMoonA.w > 0.5) color = moon(color, uMoonA, ${ramp("ROCK")}, 2.7, 14, p, dither);
    if (uMoonB.w > 0.5) color = moon(color, uMoonB, ${ramp("FROST")}, 6.1, 4, p, dither);
    // The dark behind the text, in columns of dithered pixels, as behind the game's menu.
    if (uVeil.x > 0.0) {
        float dark = uVeil.x * pow(1.0 - clamp(p.x / (uRes.x * uVeil.y), 0.0, 1.0), 1.6);
        if (dark > dither) color.rgb = mix(color.rgb, SPACE, 0.78);
    }
    fragColor = color;
}`;

const UNIFORMS = ["uRes", "uTime", "uPlanet", "uSpin", "uWorld", "uIce", "uSeed", "uLights", "uMoonA", "uMoonB", "uFleet", "uParallax", "uNebula", "uCutout", "uLightZ", "uVeil"] as const;
type UniformName = (typeof UNIFORMS)[number];

export type Frame = {
    time: number;
    planet: readonly [number, number, number];
    spin: readonly [number, number];
    world: readonly [number, number, number, number];
    ice: number;
    seed: number;
    lights: number;
    moonA: readonly [number, number, number, number];
    moonB: readonly [number, number, number, number];
    fleet: readonly [number, number, number];
    parallax: readonly [number, number];
    nebula: number;
    cutout?: boolean;
    lightZ?: number;
    veil?: readonly [number, number];
};

type Painter = { draw: (frame: Frame) => void; gl: WebGL2RenderingContext };

function createPainter(canvas: HTMLCanvasElement, attributes: WebGLContextAttributes = {}): Painter | null {
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: "low-power", ...attributes });
    if (!gl) return null;
    const compile = (type: number, source: string) => {
        const shader = gl.createShader(type)!;
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(shader));
        return shader;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error(gl.getProgramInfoLog(program));
        return null;
    }
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const corner = gl.getAttribLocation(program, "corner");
    gl.enableVertexAttribArray(corner);
    gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);
    gl.clearColor(0, 0, 0, 0);
    const where = Object.fromEntries(UNIFORMS.map((name) => [name, gl.getUniformLocation(program, name)])) as Record<UniformName, WebGLUniformLocation | null>;
    return {
        gl,
        draw(f) {
            gl.viewport(0, 0, canvas.width, canvas.height);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.uniform2f(where.uRes, canvas.width, canvas.height);
            gl.uniform1f(where.uTime, f.time);
            gl.uniform3f(where.uPlanet, f.planet[0], f.planet[1], f.planet[2]);
            gl.uniform2f(where.uSpin, f.spin[0], f.spin[1]);
            gl.uniform4f(where.uWorld, f.world[0], f.world[1], f.world[2], f.world[3]);
            gl.uniform1f(where.uIce, f.ice);
            gl.uniform1f(where.uSeed, f.seed);
            gl.uniform1f(where.uLights, f.lights);
            gl.uniform4f(where.uMoonA, f.moonA[0], f.moonA[1], f.moonA[2], f.moonA[3]);
            gl.uniform4f(where.uMoonB, f.moonB[0], f.moonB[1], f.moonB[2], f.moonB[3]);
            gl.uniform3f(where.uFleet, f.fleet[0], f.fleet[1], f.fleet[2]);
            gl.uniform2f(where.uParallax, f.parallax[0], f.parallax[1]);
            gl.uniform1f(where.uNebula, f.nebula);
            gl.uniform1f(where.uCutout, f.cutout ? 1 : 0);
            gl.uniform1f(where.uLightZ, f.lightZ ?? 0);
            gl.uniform2f(where.uVeil, f.veil?.[0] ?? 0, f.veil?.[1] ?? 1);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        },
    };
}

const smooth = (from: number, to: number, x: number) => {
    const t = Math.max(0, Math.min(1, (x - from) / (to - from)));
    return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

const MENU_WORLD = { world: [0.45, 1, 1, 0] as const, ice: 0.84, seed: 0 };
const NO_MOON = [0, 0, 0, 0] as const;
const NO_FLEET = [0, 0, 0] as const;

// The dead world along its stages (t from 0 to 1): air first, then warmth and clouds, then seas, then life.
export function terraformed(t: number) {
    return {
        world: [mix(0.14, 0.47, smooth(0.5, 0.78, t)), smooth(0.04, 0.4, t), smooth(0.28, 0.66, t), smooth(0.78, 1, t)] as const,
        ice: mix(0.9, 0.98, smooth(0.22, 0.62, t)),
        seed: 2.3,
    };
}

const heroShot = (w: number, h: number) =>
    w >= h
        ? { x: w * 0.25, y: h * 2.7, r: h * 2.07, moonA: [w * 0.82, h * 0.26, h * 0.085] as const, moonB: [w * 0.72, h * 0.09, h * 0.035] as const }
        : { x: w * 0.1, y: h * 1.72, r: h * 0.94, moonA: [w * 0.8, h * 0.105, w * 0.11] as const, moonB: [w * 0.57, h * 0.055, w * 0.045] as const };

// Once the first screen is gone the top bar covers the first `bar` art pixels: these shots are framed below it.
const orbitShot = (w: number, h: number, bar = 0) =>
    w >= h ? { x: w * 0.68, y: bar + (h - bar) * 0.54, r: h * 0.3 } : { x: w * 0.56, y: bar + (h - bar) * 0.68, r: w * 0.3 };

const worldShot = (w: number, h: number, bar = 0) =>
    w >= h ? { x: w * 0.75, y: bar + (h - bar) * 0.5, r: Math.min(h * 0.4, w * 0.21) } : { x: w * 0.5, y: bar + (h - bar) * 0.43, r: w * 0.4 };

function orbit(center: { x: number; y: number; r: number }, angle: number, size: number, ratio: number, slant: number) {
    const ax = Math.cos(angle) * center.r * size;
    const ay = Math.sin(angle) * center.r * size * 0.26;
    return { x: center.x + ax * Math.cos(slant) - ay * Math.sin(slant), y: center.y + ax * Math.sin(slant) + ay * Math.cos(slant), r: center.r * ratio, front: Math.sin(angle) > 0 };
}

let terraformTarget = 0;
// The stage the visitor picked, from 0 (dead) to 1 (alive).
export function setTerraform(t: number) {
    terraformTarget = Math.max(0, Math.min(1, t));
    wake?.();
}
let wake: (() => void) | null = null;

// Starts the sky on this canvas. Returns what stops it. Without WebGL2 the page keeps its still picture.
export function startSpace(canvas: HTMLCanvasElement) {
    const root = document.documentElement;
    const painter = createPainter(canvas);
    if (!painter) {
        root.classList.add("no-gl");
        root.classList.remove("scenes");
        return { stop() {} };
    }
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let quality = 0;
    let running = true;
    let raf = 0;
    let smoothed = window.scrollY;
    let shownTerraform = 0;
    let lastDraw = -1e9;
    let slow = 0;
    let lastTick = 0;
    let dirty = true;
    let lastScrollAt = 0;

    const sections = { hero: document.getElementById("inicio"), premise: document.getElementById("historia"), world: document.getElementById("terraformar"), close: document.getElementById("cierre") };
    const lines = [...document.querySelectorAll<HTMLElement>(".premise-line")];
    const place = { heroTop: 0, premiseTop: 0, premiseBottom: 0, worldTop: 0, worldBottom: 0, closeTop: 0, viewport: 1, bar: 0 };

    const measure = () => {
        const y = window.scrollY;
        place.viewport = window.innerHeight;
        const rect = (el: HTMLElement | null) => el?.getBoundingClientRect() ?? { top: 0, bottom: 0 };
        const premise = rect(sections.premise);
        const world = rect(sections.world);
        place.premiseTop = premise.top + y;
        place.premiseBottom = premise.bottom + y;
        place.worldTop = world.top + y;
        place.worldBottom = world.bottom + y;
        place.closeTop = rect(sections.close).top + y;
    };

    const fit = () => {
        const cssWidth = window.innerWidth;
        const cssHeight = canvas.parentElement?.clientHeight || window.innerHeight;
        const scale = Math.max(2, Math.round(cssWidth / 480)) + quality;
        const width = Math.ceil(cssWidth / scale);
        const height = Math.ceil(Math.max(cssHeight, window.innerHeight) / scale);
        place.bar = (parseFloat(getComputedStyle(root).getPropertyValue("--bar")) || 0) / scale;
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
            canvas.style.width = `${width * scale}px`;
            canvas.style.height = `${height * scale}px`;
        }
        measure();
        dirty = true;
    };

    const onScroll = () => {
        lastScrollAt = performance.now();
        wake?.();
    };

    const frameAt = (now: number): boolean => {
        const y = smoothed;
        const viewport = place.viewport;
        const w = canvas.width;
        const h = canvas.height;
        const inView = (top: number, bottom: number) => top < y + viewport && bottom > y;

        const inClose = inView(place.closeTop, Infinity);
        const inWorld = inView(place.worldTop, place.worldBottom);
        const inOpening = y < place.premiseBottom;
        if (!inClose && !inWorld && !inOpening) return false;

        const time = still ? 12 : now / 1000;
        const span = Math.max(1, place.premiseBottom - place.premiseTop - viewport);
        const progress = still ? 0.5 : Math.max(0, Math.min(1, (y - place.premiseTop) / span));
        const parallax = [Math.floor(y * 0.03), Math.floor(y * 0.012)] as const;

        if (inWorld && !inClose) {
            const shot = worldShot(w, h, place.bar);
            const world = terraformed(shownTerraform);
            painter.draw({
                time,
                planet: [shot.x, shot.y, shot.r],
                spin: [time * 0.022 + 1.4, time * 0.03],
                world: world.world,
                ice: world.ice,
                seed: world.seed,
                lights: 0,
                moonA: NO_MOON,
                moonB: NO_MOON,
                fleet: NO_FLEET,
                parallax,
                nebula: 0.75,
                lightZ: 0.85,
            });
            return true;
        }

        const hero = heroShot(w, h);
        const orbital = orbitShot(w, h, place.bar);
        // The pull-back: from the horizon of the menu to the whole planet, as the story begins.
        const pull = inClose ? 0 : still ? (y > place.premiseTop - viewport * 0.5 ? 1 : 0) : smooth(0, place.premiseTop + span * 0.22, y);
        const radius = Math.exp(mix(Math.log(hero.r), Math.log(orbital.r), pull));
        const camera = { x: mix(hero.x, orbital.x, pull), y: mix(hero.y, orbital.y, pull), r: radius };

        const turn = progress * Math.PI * 2;
        const a = orbit(orbital, 2.2 + turn * 1.5, 1.95, 0.27, -0.16);
        const b = orbit(orbital, 0.4 + turn * 2.5, 2.75, 0.115, -0.16);
        const place2 = (from: readonly [number, number, number], to: { x: number; y: number; r: number; front: boolean }) =>
            [Math.round(mix(from[0], to.x, pull)), Math.round(mix(from[1], to.y, pull)), Math.max(2, mix(from[2], to.r, pull)), pull > 0.5 && to.front ? 1 : 0] as const;

        // The colonies go dark during the first line, and the fleet leaves during the second.
        const lights = inClose || pull < 0.6 ? 0 : still ? 0.35 : 1 - smooth(0.1, 0.42, progress);
        const leaving = inClose ? -1 : still ? 0.55 : (progress - 0.4) / 0.6;
        const fleet: readonly [number, number, number] =
            leaving < 0
                ? NO_FLEET
                : w >= h
                  ? [mix(orbital.x - orbital.r * 0.5, w * 0.04, leaving), mix(orbital.y - orbital.r * 1.05, h * 0.14, leaving), 7]
                  : [mix(orbital.x - orbital.r * 0.9, -w * 0.3, leaving), mix(orbital.y - orbital.r * 1.2, h * 0.34, leaving), 7];

        painter.draw({
            time,
            planet: [camera.x, camera.y, camera.r],
            spin: [time * 0.01745 + y * 0.0009, time * 0.02513 + y * 0.0013],
            world: MENU_WORLD.world,
            ice: MENU_WORLD.ice,
            seed: MENU_WORLD.seed,
            lights,
            moonA: place2(hero.moonA, a),
            moonB: place2(hero.moonB, b),
            fleet,
            parallax,
            nebula: mix(1, 1.45, pull),
            veil: w >= h ? [mix(0.92, 0.5, pull), 0.5] : undefined,
        });

        if (!still && lines.length) {
            const current = progress < 0.36 ? 0 : progress < 0.7 ? 1 : 2;
            lines.forEach((line, i) => line.classList.toggle("on", i === current));
        }
        return true;
    };

    const tick = (now: number) => {
        if (!running) return;
        raf = requestAnimationFrame(tick);
        const target = window.scrollY;
        const moving = Math.abs(target - smoothed) > 0.4;
        smoothed = still ? target : moving ? smoothed + (target - smoothed) * 0.16 : target;

        const easing = Math.abs(terraformTarget - shownTerraform) > 0.001;
        shownTerraform = easing ? shownTerraform + (terraformTarget - shownTerraform) * 0.14 : terraformTarget;

        // While nothing moves the planet turns so slowly that a dozen frames a second is plenty.
        const busy = moving || easing || dirty || now - lastScrollAt < 200;
        if (still && !busy) return;
        if (!busy && now - lastDraw < 80) return;

        // A device that can't keep up gets bigger pixels instead of a slideshow.
        if (lastTick && busy) {
            slow = now - lastTick > 42 ? slow + 1 : Math.max(0, slow - 1);
            if (slow > 36 && quality < 3) {
                quality++;
                slow = 0;
                fit();
            }
        }
        lastTick = now;
        if (frameAt(now)) lastDraw = now;
        dirty = false;
    };

    const onLost = (event: Event) => {
        event.preventDefault();
        running = false;
        cancelAnimationFrame(raf);
    };

    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    wake = () => {
        dirty = true;
    };
    fit();
    window.addEventListener("resize", fit);
    window.addEventListener("scroll", onScroll, { passive: true });
    canvas.addEventListener("webglcontextlost", onLost);
    frameAt(performance.now());
    root.classList.add("sky-on");
    raf = requestAnimationFrame(tick);

    return {
        stop() {
            running = false;
            cancelAnimationFrame(raf);
            observer.disconnect();
            window.removeEventListener("resize", fit);
            window.removeEventListener("scroll", onScroll);
            canvas.removeEventListener("webglcontextlost", onLost);
            wake = null;
        },
    };
}

// One still, for the pictures that are baked ahead of time (see tools/bake.mjs).
export function renderStill(canvas: HTMLCanvasElement, kind: string, t = 0) {
    const painter = createPainter(canvas, { alpha: true, preserveDrawingBuffer: true, premultipliedAlpha: false });
    if (!painter) throw new Error("no webgl2");
    const w = canvas.width;
    const h = canvas.height;
    const base: Frame = { time: 12, planet: [0, 0, 0], spin: [0, 0], world: MENU_WORLD.world, ice: MENU_WORLD.ice, seed: 0, lights: 0, moonA: NO_MOON, moonB: NO_MOON, fleet: NO_FLEET, parallax: [0, 0], nebula: 1 };
    if (kind === "poster") {
        const shot = heroShot(w, h);
        painter.draw({ ...base, planet: [shot.x, shot.y, shot.r], spin: [0.2, 0.3], moonA: [Math.round(shot.moonA[0]), Math.round(shot.moonA[1]), shot.moonA[2], 0], moonB: [Math.round(shot.moonB[0]), Math.round(shot.moonB[1]), shot.moonB[2], 0], veil: w >= h ? [0.92, 0.5] : undefined });
    } else if (kind === "world") {
        const world = terraformed(t);
        painter.draw({ ...base, ...world, planet: [w / 2, h / 2, w / 2 - 2], spin: [1.4, 0.4], cutout: true, lightZ: 0.85 });
    } else if (kind === "moon") {
        painter.draw({ ...base, moonA: [w / 2, h / 2, w / 2 - 1, 1], cutout: true, lightZ: 0.5 });
    } else if (kind === "icon") {
        painter.draw({ ...base, planet: [w * 0.4, h * 0.62, w * 0.34], spin: [0.9, 0.4], moonA: [Math.round(w * 0.82), Math.round(h * 0.26), w * 0.14, 1], moonB: [Math.round(w * 0.52), Math.round(h * 0.12), w * 0.07, 1], cutout: true });
    }
}
