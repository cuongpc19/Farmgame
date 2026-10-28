# Quarry Crush (prototype)

Arcade-idle mining in 3D (Three.js). Smash a quarry, smelt ore, sell ingots to trucks,
upgrade, rent machines, hire workers, clear the stage.

```bash
npm install
npm run dev      # http://localhost:5173 — open the Network URL on a phone (same wifi)
npm run build    # dist/ (~1 MB)
```

Controls: drag anywhere (floating joystick) or WASD. Stand on a white pad to use it.

Prototype status: stages 1–2 complete; economy numbers temporarily copied from the reference
game (`src/data/orig`, see `docs/ORIGINAL_DATA.md`). Rewarded ads are simulated (2-second overlay).
