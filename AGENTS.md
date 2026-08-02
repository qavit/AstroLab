# AstroLab contributor instructions

- Use Conventional Commits for every commit (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`).
- Keep scientific calculations independent from Three.js and React whenever practical.
- Respect the one-way layering: `lib/science` and `lib/render` depend on nothing above them, `models` may import `lib/science` only, and `components` is the only layer that combines them. `lib/render` must stay model-agnostic — put geometry whose meaning belongs to one model in that model instead.
- Treat coordinate-system colors consistently: equatorial coordinates are red, ecliptic coordinates are yellow, horizontal coordinates are green.
- Avoid generic geometry wireframes. Construct coordinate grids explicitly so every visible line has scientific meaning.
- Preserve synchronized state across the geocentric view, observer view, controls, direct manipulation, animation, and export.
- Keep adaptive labels conservative; preventing overlap is more important than showing every value.
- Every export mode must keep the Sun visible, including black-and-white line art.
- Run `npm run lint` and `npm test` before publishing.
