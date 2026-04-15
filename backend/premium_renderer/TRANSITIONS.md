# Premium Reel Effects

Current premium reel transitions are implemented in:

- `backend/premium_renderer/src/root.jsx`
- `backend/app/services/premium_reel_renderer.py`

## Current Transition Types

These are the transition values the premium renderer accepts directly:

- `hard_cut_blur`
- `masked_push`
- `light_sweep_dissolve`
- `scale_through_zoom`
- `depth_blur_handoff`
- `vertical_reveal`
- `horizontal_reveal`
- `soft_flash_cut`
- `glass_warp`
- `radial_focus_pull`
- `split_panel_wipe`
- `film_burn_edge`
- `depth_parallax_snap`
- `ghost_trail_crossfade`
- `iris_close_open`

## Current Motion Presets

These are the scene motion presets currently used:

- `hero_push`
- `parallax_rise`
- `tracking_drift`
- `micro_jolt`
- `slow_push`

## Where They Are Used

`backend/app/services/premium_reel_renderer.py`

- Normalizes old scene effect names into the premium transition vocabulary.
- Chooses a matching motion preset for each premium transition.

`backend/premium_renderer/src/root.jsx`

- `transitionDurationFor()`: sets timing per transition.
- `SceneAsset`: applies push, drift, blur, and zoom behavior.
- `TransitionOverlay`: defines the visible transition treatment.
- `SceneLayer`: combines opacity / clip-path / blur logic for the handoff.

## Current Limitation

The premium set is still small, so repetition is expected.

Common repetition points:

- many legacy transition names collapse into the same premium transition
- background-video flows often default to `tracking_drift`
- fallback scenes default to `depth_blur_handoff`

## Expansion Notes

The premium renderer now covers a wider mix of:

- reveals: `vertical_reveal`, `horizontal_reveal`, `iris_close_open`
- punchier impact cuts: `soft_flash_cut`, `depth_parallax_snap`
- more editorial / textured handoffs: `glass_warp`, `film_burn_edge`, `ghost_trail_crossfade`
- structured wipes: `split_panel_wipe`
- focal transitions: `radial_focus_pull`

## Official References

- Remotion homepage: <https://www.remotion.dev/>
- Remotion v4 docs hub: <https://v4.remotion.dev/>
- Remotion renderer docs: <https://www.remotion.dev/docs/renderer>
- Remotion showcase / examples: <https://www.remotion.dev/showcase>
