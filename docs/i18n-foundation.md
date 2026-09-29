# i18n foundation v0.1

## Locale model and routing

- Canonical locales are `zh-TW` (default) and `en`.
- Chinese routes retain their existing unprefixed URLs. A reviewed English counterpart is published below `/en/`, for example `/en/atmosphere-profile`.
- Locale comes only from the URL. There is no Accept-Language detection or redirect; a refresh therefore preserves the selected locale.
- A missing counterpart is unavailable. Do not create an English URL that renders Chinese content, redirect an English module to a Chinese module, or list it in an English catalog before its translation is reviewed.

## UI and content model

- `lib/i18n.ts` holds reviewed interface copy and module metadata. Science and model layers expose stable IDs, values, units, and colors rather than human-language labels.
- `StandardAtmosphereLab` demonstrates the boundary: its title, controls, chart labels, instructions, layer names, and source note are localized; `lib/science/standardAtmosphere.ts` remains language-independent.
- The Lab registry is not yet globally localized. Add locale-specific registry title/description/topic fields only when an actual module counterpart is ready.

## SEO

- Next.js proxy records the URL locale for the root layout, which emits the matching `<html lang>`.
- Every localized page has a self-canonical URL, localized title/description/Open Graph locale, and `hreflang` only for real paired routes. `x-default` is the Chinese URL.
- The app has no sitemap implementation today. Add both real counterparts to a sitemap when the first indexable English catalog surface is published; do not submit speculative `/en` paths.

## Adding a translated module

1. Keep the existing Chinese route and add its English peer at `/en/<route>`.
2. Add reviewed UI and module metadata to `lib/i18n.ts`; keep scientific calculation and state locale-free.
3. Add self-canonical and reciprocal `hreflang` metadata to both page files.
4. Render the switcher only when both peers exist, then build and test direct navigation and refresh.

## Terminology

| Term | English |
| --- | --- |
| Kakau | Kakau |
| Kakau Physics Academy | Kakau Physics Academy |
| Kakau Lab | Kakau Lab |
| Kakau Notes | Kakau Notes |
| 互動式科學模型 | interactive science model |
| 物理量 | physical quantity |
| 讀值游標 | readout cursor |
| 分層 | atmospheric layers |

## Known limitations

v0.1 validates only Model 05. Other modules remain Chinese-first and deliberately have no English fallback page or language switcher. Translating the catalogue, module long-form notes, and a sitemap are follow-on work, not implied by this foundation.
