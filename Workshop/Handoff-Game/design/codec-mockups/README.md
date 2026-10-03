# Codec-style mockups (v2 look)

Three canvas mockups of the same G3 moment, drawn in code (no image files). Published together at https://claude.ai/artifact/LsTKsM1Wu8fwcQKiCweG9S

- `shared.js`: the scene data every variant draws (do not edit when comparing variants)
- `variant-c.js`: Soliton (recommended), `variant-a.js`: Codec '98, `variant-b.js`: Transceiver '90
- `node shot.mjs variant-c.js` renders t=3 and t=8 PNGs (needs `NODE_EXTRA_CA_CERTS` + `NODE_USE_ENV_PROXY=1` in the cloud box for fonts)
- `node build.mjs` assembles the gallery page `handoff-codec.html`

Reference screenshots from Metal Gear are not committed (Konami art).
