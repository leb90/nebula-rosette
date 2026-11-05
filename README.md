# Rosette Nebula: la página

La página de [Rosette Nebula](https://leb90.github.io/nebula-rosette/), un RPG espacial de ciencia ficción dura, para un jugador y en pixel art. Está hecha en [ArtScript](https://artscript.dev).

## Abrir el Patreon

Cuando la campaña exista, pegá su dirección en `src/config.art`:

```
const PATREON_URL = "https://www.patreon.com/..."
```

Con eso, todos los botones que dicen que abre pronto pasan a apoyar y llevan a Patreon.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | La página en local, con recarga al guardar. |
| `npx art check --ai` | Revisa el código. |
| `npx art test` | Corre las pruebas de `src/tests.art`. |
| `npm run build` | Compila para GitHub Pages en `dist/`. |
| `node tools/serve-dist.mjs` | Sirve `dist/` bajo `/nebula-rosette/`, como GitHub Pages, en el puerto 4173. |

Cada push a `main` revisa, prueba y publica la página (`.github/workflows/pages.yml`).

## Dónde está cada cosa

| Qué | Dónde |
|---|---|
| Los textos en español e inglés, la dirección de Patreon y la versión | `src/config.art` |
| La página, que junta las secciones | `src/app.art` |
| Cada sección | `src/components/` |
| Tipografías, colores y maquetación | `src/styles/site.css` |
| El cielo: el planeta, las lunas y el mundo que se terraforma (WebGL) | `src/scene/space.ts` |

## Las imágenes

Se generan con código y quedan en `public/`:

- `node tools/bake.mjs`: el fondo fijo, las etapas del mundo, la luna y los íconos, con el mismo shader que corre en vivo. Necesita Chrome.
- `python3 tools/draw_ship.py public/img/ship.png`: el plano de la nave. Necesita Pillow.
- `python3 tools/dither_nebula.py <foto> public/img/nebula.png 480 --gamma 0.85`: la foto de la nebulosa con la paleta del juego. Necesita Pillow y numpy.
- `tools/og.html`: la imagen para compartir en redes (`public/og.png`), capturada a 1200×630.

## Créditos

- Pixelify Sans (The Pixelify Sans Project Authors) y Rajdhani (Indian Type Foundry), con licencia SIL OFL 1.1; las licencias están en `public/fonts/`.
- Foto de la Nebulosa Roseta: [Dylan O'Donnell](https://commons.wikimedia.org/wiki/File:The_Rosette_Nebula_Caldwell_49_50_Broadband.jpg), CC0.
