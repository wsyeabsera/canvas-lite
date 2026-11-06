---
sidebar_position: 22
slug: /tvdash-shader-variants
---

# tvdash: shader effects on the real screens

How to add GPU shader effects to the tvdash screens that exist today, in their own code. This is not a redesign and not a second implementation of the screens: every section names the real file and composable or stylesheet the effect goes into, what it replaces, and what stays as the fallback. The screens themselves are inventoried in [the TV screens](./tvdash-tv-screens.md) and [the phone and browser pages](./tvdash-phone-screens.md). The phone and extension headings below carry the phone inventory's item numbers ("Phone 5 to 8", "Extension 42"); the TV headings (TV 1 to TV 6) are numbered in this document's own order and each names the TV inventory's screen (TV 1 is its screen 1, TV 2 its screens 3 and 4, TV 3 its 7 to 9, TV 4 its 10 and 11, TV 5 its 13 to 20, TV 6 its 35 and 36).

Sources read (all in `/Users/yab/Hobby/tvdash`, read-only): `tv/app/build.gradle.kts`, `tv/gradle/libs.versions.toml`, `tv/app/src/main/kotlin/dev/tvdash/ui/Aurora.kt`, `ui/Components.kt` (`GlassPanel`, `StatusPill`, `KindGlyph`), `ui/TvdashScreen.kt`, `ui/Browser.kt` (`TvdashApp`'s layer order), `ui/Steps.kt` (`TimerRing`), `player/PlayerScreen.kt` (`Spinner`, `ContentFrame`), `README.md`, `hub/src/remote.html`, `hub/src/remote.ts`, `extension/manifest.json`, `extension/popup.html`, `popup.css`, `home.html`, `home.css`, `extension/package.json`. From this repo: the `shaders` skill (`.agents/skills/shaders/SKILL.md`, `components.md`) and the installed `node_modules/shaders` (version 4.0.6). No Shaders account was used and the Shaders CLI was not run.

## The two facts that decide everything

### 1. The TV app's SDK levels, and the owner's own TV

From `tv/app/build.gradle.kts` and `tv/gradle/libs.versions.toml`:

| Setting | Value |
|---|---|
| `minSdk` | **28** (Android 9) |
| `targetSdk` | 36 |
| `compileSdk` | 37 |
| Compose BOM | `2026.09.00` (`compose-ui`, `compose-foundation`) |
| `androidx.tv:tv-material` | 1.1.0 |
| `androidx.activity:activity-compose` | 1.13.0 |
| `androidx.core:core-ktx` | 1.19.1 |
| Media3 (ExoPlayer, `media3-ui-compose`) | 1.11.1 |
| AGP / Kotlin | 9.5.0 / 2.4.21 |

The APIs a shader needs on Android:

| API | Needs | What it gives |
|---|---|---|
| `android.graphics.RuntimeShader` (AGSL), used as a Compose `ShaderBrush` | **API 33** (Android 13) | a custom fragment shader as a paint: draw a generator (a gradient, noise, a glow) |
| `RenderEffect.createRuntimeShaderEffect(shader, "content")` in `Modifier.graphicsLayer { renderEffect = ... }` | **API 33** | a custom filter over a composable's already-drawn content (grain, distortion) |
| `RenderEffect.createBlurEffect` / Compose `Modifier.blur` | API 31 (Android 12) | a Gaussian blur of the composable's own content (not of what is behind it) |
| `BitmapShader` / Compose `ImageShader`, `Brush.radialGradient`, `Brush.sweepGradient` | every API the app supports | what `Aurora.kt` already uses, plus tiled bitmaps (for grain and dither) |

`README.md` (Network notes) says the owner's TV is a **TCL running Android TV 12**. Android TV 12 is built on Android 12, which is **API 31**. So:

- **No AGSL code path would ever run on the owner's own TV.** Anything written with `RuntimeShader` must sit behind `Build.VERSION.SDK_INT >= 33` and needs an Android 13 or newer device or emulator to be seen at all.
- Blur (`RenderEffect.createBlurEffect`, API 31) does run on it.
- Everything the app supports below 33 (minSdk 28, so Android 9 to 12 devices, which includes many Google TV and Android TV boxes still in use) keeps the existing `Canvas` path. That path is not a degraded copy: it is the real `AuroraBackground` as it is today, and the improvements in section TV 1 below that need no AGSL go into it first.
- Which Google TV devices ship or update to Android TV 13 or 14 was not verified here (see the last section). Plan as if a large share of real TVs stay on the fallback for years.

### 2. The `shaders` library is WebGPU and big

The `shaders` npm package (MIT, the one the skill describes) renders only with WebGPU ("Shaders needs a browser with WebGPU", `SKILL.md`). In this repo's `node_modules/shaders` (4.0.6), `dist/js` (the vanilla `shaders/js` entry with `createShader`) is **2.6 MB on disk**, and `dist/core` (the per-component chunks) 12 MB; imported through `createShader`, the lazy chunk is about 0.7 MB gzip (figure given for this task; the gzip size was not re-measured here). That is:

- too heavy for the extension popup, which is 380 px wide, opens and closes many times a day, and has to show the TV state at once;
- too heavy for the phone remote's first load: `remote.html` is one self-contained file served with `Cache-Control: no-cache` and no service worker (phone inventory, "Offline support"), so a 0.7 MB chunk would be fetched again on every open;
- unavailable wherever WebGPU is missing (older phones, some Android GPUs, browsers with it switched off), which means a fallback is needed anyway.

For every web surface below, the recommendation is therefore a **hand-written fragment shader of a few KB** (WebGL 1 or 2, which every target browser has; WebGPU and WGSL only if a page is desktop-only and the code is kept as small), or **CSS only**. The library stays the right tool for prototyping a look in this repo, not for shipping inside tvdash.

## TV app (Compose for TV)

### TV 1. App frame: the aurora backdrop

**Today** (`ui/Aurora.kt`, `AuroraBackground(tint, modifier)`): a `Canvas` at a quarter of the screen's resolution (`DOWNSCALE = 4f`, so 480 x 270 px on a 1080p TV), scaled up 4x through `graphicsLayer`, redrawn 15 times a second (`STEPS_PER_SECOND`) over a 60 s loop (`PERIOD_MS`). `drawAurora` paints a vertical `inkRaised` to `ink` gradient, three radial fields (the scene tint at 30%, `purple` at 14%, `teal` at 8%) drifting on circles, and a vignette. The tint animates over 1200 ms. `TvdashScreen` (`ui/TvdashScreen.kt`) draws it under every scene.

**Effect, in plain words:** the same three colour fields, but as a soft mesh gradient whose edges wander slowly instead of being perfect circles, with a fine grain that stops the dark gradients from banding into visible rings on an 8-bit TV panel. On every new scene, a one-shot bloom of the scene's accent from behind the panel (see TV 3), so a pushed card is noticed from across the room without anything moving on the card itself.

**Why it suits this screen:** the backdrop is the only thing that is always on screen, it is meant to be ambient, and it is already a generator (no image input), which is the cheapest kind of shader. Banding is the visible flaw of the current approach: two-stop radial gradients at 8 to 30% alpha over near-black are exactly where banding shows, and the 4x upscale does not hide it.

**How, step 1: no AGSL, works on minSdk 28 and on the owner's TV.**

- Grain and dither: build one small noise bitmap once (for example 128 x 128 px, random luminance at about plus or minus 1.5/255), wrap it in `ImageShader(bitmap, TileMode.Repeated, TileMode.Repeated)` and draw it over the aurora with `drawRect(ShaderBrush(...), alpha = ...)`. It must be drawn at full resolution, so outside the quarter-size `Canvas`: a second, full-size `Canvas` (or a `drawWithContent` on the outer `Box`) in `AuroraBackground`. It is static, so it costs one textured full-screen quad per frame and never needs redrawing on its own.
- Accent bloom: one more `field(...)` call in `drawAurora`, at the panel's centre, whose alpha is driven by an `Animatable` that runs 0 to 1 to 0 over about 1.2 s when the scene key changes (`Scene.key()` is in `ui/TvdashScreen.kt`). Pass it into `AuroraBackground` as a new parameter next to `tint`.
- Pause while hidden: `TvdashApp` (`ui/Browser.kt`) keeps `TvdashScreen` composed under the full-screen player, the browser and the wall, and only sets `LocalScreenInFront` to false. `AuroraBackground` does not read it, so (inferred from the code, not measured) the backdrop keeps redrawing 15 times a second under a playing video. Make the drift loop's `LaunchedEffect` depend on `LocalScreenInFront.current` as it already depends on `LocalReduceMotion.current`. This is the cheapest performance win in this whole document.

**How, step 2: AGSL for Android 13 and newer.** A `RuntimeShader` drawn as a `ShaderBrush` replaces the four `drawCircle`/`drawRect` calls in `drawAurora` with one full-rect draw, and adds the domain warp. It plugs into `AuroraBackground` in `ui/Aurora.kt`: keep the `BoxWithConstraints`, the quarter-size `requiredSize`, the `graphicsLayer` scale and the `phase` loop exactly as they are, and choose what is drawn inside the `Canvas`:

```kotlin
// ui/Aurora.kt, inside AuroraBackground, replacing the existing Canvas's draw lambda
val shaderAurora = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) rememberAuroraShader() else null
Canvas(
    Modifier
        .requiredSize(small.first, small.second)
        .graphicsLayer {
            scaleX = DOWNSCALE
            scaleY = DOWNSCALE
            compositingStrategy = CompositingStrategy.Offscreen
        },
) {
    if (shaderAurora != null) shaderAurora.draw(this, accent, phase.floatValue)
    else drawAurora(accent, phase.floatValue) // today's code, unchanged: the fallback
}

@RequiresApi(Build.VERSION_CODES.TIRAMISU)
private class AuroraShader {
    val shader = RuntimeShader(AURORA_AGSL)
    val brush = ShaderBrush(shader)
    fun draw(scope: DrawScope, accent: Color, phase: Float) = with(scope) {
        shader.setFloatUniform("resolution", size.width, size.height)
        shader.setFloatUniform("time", phase * 60f) // seconds into the 60 s loop
        shader.setColorUniform("accent", accent.toArgb())
        shader.setColorUniform("purple", Palette.purple.toArgb())
        shader.setColorUniform("teal", Palette.teal.toArgb())
        shader.setColorUniform("ink", Palette.ink.toArgb())
        shader.setColorUniform("inkRaised", Palette.inkRaised.toArgb())
        drawRect(brush)
    }
}

@RequiresApi(Build.VERSION_CODES.TIRAMISU)
@Composable
private fun rememberAuroraShader() = remember { runCatching { AuroraShader() }.getOrNull() }
```

The `runCatching` matters: if the shader fails to compile on a vendor's driver, `rememberAuroraShader` returns null and the existing `drawAurora` runs. Reading `phase.floatValue` and `accent` inside the draw lambda keeps today's property that nothing recomposes: each tick only redraws, and each redraw sets fresh uniforms. A debug flag (for example a `--ez legacyAurora true` extra next to the existing `--es demo`) that forces the fallback lets one Android 13 device check both paths.

The AGSL. It reproduces `drawAurora` (same centres, radii, alphas, speeds and phase offsets, linear falloff like a two-stop `radialGradient`, the vignette at 65% over 75% of the larger side) and adds a slow low-frequency warp. Dither is left to the full-resolution grain layer of step 1, because dither computed here would be magnified into 4 x 4 px blocks by the upscale.

```glsl
// AURORA_AGSL: a Kotlin raw string constant in ui/Aurora.kt
uniform float2 resolution;
uniform float time; // seconds, 0..60, wraps
layout(color) uniform half4 accent;
layout(color) uniform half4 purple;
layout(color) uniform half4 teal;
layout(color) uniform half4 ink;
layout(color) uniform half4 inkRaised;

const float TAU = 6.2831853;

float hash(float2 p) {
    return fract(sin(dot(p, float2(127.1, 311.7))) * 43758.5453);
}

// Value noise, smooth enough for a 270 px tall buffer.
float noise(float2 p) {
    float2 i = floor(p);
    float2 f = fract(p);
    float2 u = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + float2(1.0, 0.0));
    float c = hash(i + float2(0.0, 1.0));
    float d = hash(i + float2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// One colour field: centre (cx, cy) in fractions of the screen, drifting on a circle.
float3 field(float3 col, float2 p, float3 tint, float alpha,
             float cx, float cy, float radius, float speed, float offset) {
    float turn = time / 60.0 * TAU;
    float2 c = resolution * float2(cx + 0.08 * cos(turn * speed + offset),
                                   cy + 0.10 * sin(turn * speed + offset));
    float w = alpha * clamp(1.0 - length(p - c) / (resolution.x * radius), 0.0, 1.0);
    return mix(col, tint, w);
}

half4 main(float2 fragCoord) {
    float2 uv = fragCoord / resolution;
    // Slow domain warp: the fields' edges wander instead of being perfect circles.
    float t = time / 60.0 * TAU;
    float2 q = uv * 2.5 + float2(cos(t), sin(t)) * 0.6;
    float2 warp = (float2(noise(q), noise(q + 7.3)) - 0.5) * 0.06 * resolution.x;
    float2 p = fragCoord + warp;

    float3 col = mix(float3(inkRaised.rgb), float3(ink.rgb), uv.y);
    col = field(col, p, float3(accent.rgb), 0.30, 0.78, 0.12, 0.55, 1.0, 0.0);
    col = field(col, p, float3(purple.rgb), 0.14, 0.12, 0.95, 0.50, 1.0, 2.1);
    col = field(col, p, float3(teal.rgb),   0.08, 0.40, 0.55, 0.40, 2.0, 4.2);

    float v = clamp(length(fragCoord - resolution * 0.5) / (max(resolution.x, resolution.y) * 0.75), 0.0, 1.0);
    col = mix(col, float3(ink.rgb), 0.65 * v);
    return half4(half3(col), 1.0);
}
```

This was written against the AGSL reference, not compiled: no Android 13 device or emulator was run for this document. The `time` uniform wraps at 60 s, so with `speed` 1 and 2 the drift is seamless, as in today's code; the noise warp jumps slightly at the wrap (rotate `q` by a whole number of turns per loop, as written, and the jump is small, but check it on a device).

**Hardware cost.** The code itself says what the TV is: "Built for a modest 32-bit TV GPU" (`Aurora.kt`), and the WebView's inline video "crawls on this TV (about 5 fps at 1080p)" (`ui/TvBrowser.kt`). Budget accordingly:

- Fragment cost scales with pixels. The quarter-size buffer is 129,600 px; a full 1080p buffer is 2,073,600 px, 16 times more. Keep `DOWNSCALE = 4`: the backdrop is soft, and the shader above (about 25 noise and math operations per pixel) is trivial at that size even on Mali-G31/G52-class GPUs common in TV SoCs. At full resolution the same shader would be a real load on those GPUs.
- Frame rate: keep the 15 Hz drift. The UI composites at the panel's 60 Hz, and the scene transition, focus rings and lift animations (`FocusRing`, 150 ms) must keep their frames; the backdrop only has to update often enough that a sub-pixel drift looks continuous, and 15 Hz already does. A backdrop redraw is the first thing to drop when a frame is late, never a focus animation.
- Thermal, not battery: a TV box is mains-powered, but it is passively cooled in a closed cabinet, and it is on for hours. Sustained GPU load throttles the SoC, and the first thing that suffers is what this app most needs: video decode handoff, the WebView, and D-pad latency. That is why the "pause while hidden" change in step 1 comes before any visual change, and why nothing here runs at full resolution or full rate.
- `RenderEffect.createRuntimeShaderEffect` (a filter over content) is avoided on purpose: it forces an offscreen render of everything inside the layer every frame. A generator drawn as a `ShaderBrush` adds no extra pass.

**Verdict: do it.** Step 1 first (it is visible on the owner's TV and on every device); step 2 behind the version check, tested on an Android 13+ device. One file, one composable.

### TV 2. Idle home (clock, prompt, toolbar, Recent)

**Effect:** none of its own. The idle home (`IdleScene` in `ui/TvdashScreen.kt`, and `HomeScene` in `ui/Home.kt`) is the backdrop plus text, so it gets TV 1 for free. One optional extra: on idle, let the tint settle to a slightly cooler, darker field than blue (a new idle colour in `Scene.tint()`), so the room-filling idle screen is calmer at night.

**Why:** the 312 px Thin clock is the whole design; an effect on the text itself (shimmer, glow) would fight the 10-foot legibility the Theme comment asks for, and the toolbar's focus look must stay the single white ring.

**How:** `Scene.tint()` in `ui/TvdashScreen.kt` (one `when` branch). No shader code.

**Verdict: do it (it rides on TV 1).** No separate effect on the clock, toolbar or Recent panel.

### TV 3. Cards: info, success, warning

**Today:** `CardScene` in `ui/TvdashScreen.kt`, a centred `GlassPanel` (`ui/Components.kt`: translucent fill, a white 5% to transparent vertical sheen, a 1 dp gradient hairline; no blur) with `KindGlyph` and the kind label; the aurora tint moves to the accent over 1200 ms.

**Effect, in plain words:** the card's arrival is told by light, not by motion of the card: a bloom of the accent rising behind the panel and fading over about 1.2 s (TV 1, step 1). Per kind: info one soft bloom; success one bloom with a brighter core; warning two slower pulses, then steady. Optionally, a single light sweep along the panel's top hairline when it lands, drawn in `GlassPanel`'s border brush.

**Why:** cards are glanced at from across the room. The scene transition already moves the panel (scale from 0.94, slide up); a second motion on the panel would be noise, but a change of light behind it is noticed in peripheral vision. Warning deserves the most persistent signal.

**How:** the bloom is the extra field in `drawAurora` (and the matching extra `field(...)` line in the AGSL with a `pulse` uniform), driven by an `Animatable` keyed on the scene key, its curve chosen by `Scene.Card.kind`. All APIs, no AGSL needed. The hairline sweep: animate the start offset of the existing `Brush.verticalGradient` in `GlassPanel`'s `border(...)` as a `Brush.linearGradient` for 600 ms; again no shader. Respect `LocalReduceMotion` (no bloom, tint change only).

**Not recommended:** real refractive or frosted glass (`Glass`, `Frost` in the `shaders` library, or an AGSL refraction). On Android it means `RenderEffect` over a layer that includes the aurora behind the panel, every frame, on an API 33+ device only; and over a backdrop this soft, refraction shows almost nothing. A real backdrop blur behind `GlassPanel` is also not available as a Compose primitive: `Modifier.blur` blurs the panel's own content.

**Verdict: do it** (the bloom); the hairline sweep is a maybe.

### TV 4. Link card and GitHub PR / issue card

**Today:** `LinkScene` (`ui/TvdashScreen.kt`) and `GithubScene` (`ui/Github.kt`): glass panel, title, QR tile (`ui/Qr.kt`, white with `#0B0B0F` modules), and for GitHub the state chip, checks and diff blocks; the aurora takes the state colour.

**Effect:** for the GitHub card only, while checks are running, a slow orange shimmer across the "running" dot in `ChecksSummary`, and when a PR state is Merged, a one-shot purple bloom (TV 3's mechanism). Nothing on the link card beyond TV 1.

**Why:** the QR code must stay untouched: no grain, no glow, no tint, no shader anywhere over the QR tile, or phones fail to scan it (the app's own `scripts/verify.sh` decodes the QR from TV screenshots, which would also catch it). The rest of the card is text to read.

**How:** the running dot is a 10 dp `Box`; animate its alpha or a tiny `Brush.sweepGradient`. No AGSL.

**Verdict: link card: skip** (TV 1 is enough). **GitHub card: maybe** (small, but only if `checksVerdict`, which is computed and never drawn, gets a visual first).

### TV 5. Player: controls overlay, and loading / buffering

**Today:** `PlayerScreen` (`player/PlayerScreen.kt`) draws the video with Media3's `ContentFrame(player, Modifier.fillMaxSize())`; the overlay is a 260 dp bottom scrim (transparent to black 78%), title, hint, progress bar; `Spinner` is a 56 dp white 90% arc, one turn per 900 ms.

**Effect:**

- Overlay: none on the video. A dithered scrim (the grain tile from TV 1 under the scrim gradient) would remove the banding a black-to-transparent gradient shows over dark video. Maybe.
- Loading and buffering: replace the bare arc with a soft glowing ring: the same arc plus a blurred copy under it (`Modifier.blur(8.dp)` on a second `Canvas`, API 31, so it works on the owner's TV; on 28 to 30, no glow), the head brighter than the tail via `Brush.sweepGradient`.

**Why:** the video is the content; nothing may cost it frames. `ContentFrame` does not set a surface type here, and Media3's default for it is a `SurfaceView` (stated from the library's defaults, not verified in this checkout): the video is then on its own hardware plane, which no `RenderEffect` can touch, so effects "on the video" are not possible anyway, only over it, and any full-screen GPU work over a decoding video is exactly where a weak TV SoC drops frames or heats up. The spinner is 56 dp (112 px square): any effect there is free.

**How:** `Spinner` in `player/PlayerScreen.kt` (one composable). The note in the TV inventory that its stroke is in raw px, not dp, is worth fixing at the same time.

**Verdict: controls overlay: skip** (the dithered scrim is a maybe). **Loading / buffering: maybe** (cheap and safe, but low value: it is on screen for a second or two).

### TV 6. Steps: the timer ring

**Today:** `TimerRing` in `ui/Steps.kt`: 220 dp (440 px) ring, a `glassFocused` track and an `orange` arc with a round cap, redrawn 4 times a second; the done banner and chime live in `ui/Browser.kt`.

**Effect, in plain words:** the remaining arc glows softly, brightest at its moving head; while running, the glow breathes very slowly; in the last 10 seconds the glow warms and pulses once a second; when the timer reaches zero the whole ring flashes once before the "Timer done" banner.

**Why:** steps are followed from the kitchen or the sofa. The timer's state (running or paused, nearly done) is the one thing on this screen that must read from a distance and without focus, and a glow carries that better than the small "running" / "paused" caption. The area is small, so the cost is negligible even on weak GPUs.

**How:** in `TimerRing`: draw the arc twice, the lower copy wider and blurred with `Modifier.blur(12.dp)` (API 31: works on the owner's TV; on API 28 to 30, `blur` does nothing and the ring looks as it does today), and use `Brush.sweepGradient` rotated to the arc's head for the bright head. The "last 10 s" and "done" pulses are an `Animatable` on the glow's alpha. On API 33+ the glow and head could be one AGSL `ShaderBrush` over the 440 px square, but the blur version already reaches the owner's TV, so AGSL is not needed here. Keep the 4 Hz redraw for the arc; run the pulse through Compose animation (it only affects one small layer).

**Verdict: do it.** Small, visible from across the room, runs on the TV the owner has.

## Phone remote (`hub/src/remote.html`)

The page is one self-contained file: inline CSS, an inline SVG sprite, one inline script, served by `hub/src/remote.ts` with only `Content-Type` and `Cache-Control: no-cache` headers. **There is no Content-Security-Policy header**, so an inline `<script>` with a WebGL shader works as the page's existing script does. If a CSP is added later, the shader code must be inside a script the policy already allows (a hash, or a file under `/remote/`), and WebGL shader compilation itself needs no `unsafe-eval`.

### Phone 1. Shell: header and backdrop

**Today:** body `#05060A` plus a fixed `body::before` with three static radial glows (blue at 12% / -8%, indigo at 105% / 28%, purple at 30% / 112%), and glass panels with `backdrop-filter: blur(28px) saturate(150%)`.

**Effect:** the same slow aurora as the TV, so the phone visibly belongs to the TV it steers: the three glows drift over a minute, and the top glow takes the colour of what is on the TV (blue for the player, orange for a card or link, teal for the browser, the same kind colours as the Now playing art).

**Why, and the catch:** it ties the remote to the TV's look with almost no layout change. The catch is the glass: every `.glass` panel blurs what is behind it, so an animated backdrop makes the browser recompute every panel's 28 px blur on every frame. On a phone that is the real cost (and here, unlike the TV, battery matters), much more than the shader itself.

**How:**

- CSS first: register the glow centres as custom properties with `@property` (type `<percentage>`, written in code here) and animate them with a 60 s keyframe loop at a very slow pace; colour changes go through a `data-kind` attribute on `body` that the existing render code sets. Measure the glass repaint cost on a mid-range Android phone before keeping it.
- If CSS is not enough: a `<canvas>` fixed at `inset: 0; z-index: -1` in place of `body::before`, drawn by a WebGL 1 fragment shader of about 2 to 3 KB (the TV's AGSL ported almost line for line: `half4 main(float2 fragCoord)` becomes `void main()` writing `gl_FragColor` from `gl_FragCoord.xy`), rendered at a quarter of the CSS size and scaled up, at 15 to 20 fps through `requestAnimationFrame` with a frame skip.
- Fallback: keep `body::before` exactly as it is; the canvas covers it only after a WebGL context was created and the first frame drew. No canvas when `prefers-reduced-motion: reduce` matches (the page already turns transitions off there), when `getContext("webgl")` returns null, or on `webglcontextlost`. Stop the loop on `visibilitychange` (the page already stops polling when hidden).
- Not the `shaders` library: it needs WebGPU (not on every phone) and adds the 0.7 MB gzip chunk to a page with no cache and no service worker.

**Verdict: maybe.** Do the CSS version and measure; ship the WebGL canvas only if the glass panels stay smooth on a mid-range phone.

### Phone 5 to 8. Now playing card

**Today:** the 64 x 64 px art tile (`.art`, radius 18 px) has a static gradient by kind (player `#1B5FD9` to `#5E5CE6`, card and link orange, browser teal-blue, app pink-purple) and a coloured shadow; state is shown by the `.state` label and its dot.

**Effect:** the art tile becomes a small living gradient while the TV is actually playing: its colours slowly rotate; while buffering, a soft light passes across it; paused, ended, offline: it stands still (offline already fades the card to 50%).

**Why:** the tile is the first thing the eye lands on, and "is it playing right now" is the question the card answers. A tile that moves only when the TV plays answers it without reading.

**How:** CSS only, in the inline stylesheet. Give `.art` a second gradient layer and animate a registered `@property` angle (a `conic-gradient` or a rotated `linear-gradient`) with a keyframe of about 8 s, scoped to `[data-state="playing"] .art` (or whatever attribute the render code at `remote.html:1188` sets for the state tone; add one if needed). Buffering: a translucent white `linear-gradient` stripe moved by `background-position`. 64 px is so small that this costs nothing, but it sits inside a `backdrop-filter` panel: only the tile repaints, not the blur, because the tile is in front of the panel's backdrop, not behind it. Reduced motion: no animation.

**Verdict: do it** (CSS only; no shader at all needed for a 64 px tile).

## Browser extension (`extension/`, Manifest V3)

Constraints that apply to both pages:

- **No build step.** `extension/package.json` has only a test script and Playwright; the popup and home page load plain ES modules (`popup.js`, `home.js`) and CSS files. Any shader code is a hand-written file in `extension/`, or a vendored copy of a library.
- **No remote code.** MV3 forbids loading script from the network; everything must ship inside the extension. The manifest declares no `content_security_policy`, so Chrome's default extension-page policy applies (`script-src 'self'`; whether `'wasm-unsafe-eval'` is part of the default on the current Chrome was not checked here). No `eval` and no `new Function`. Compiling a GLSL or WGSL shader (`gl.compileShader`, `device.createShaderModule`) is not script evaluation and is allowed under that policy.
- **WebGPU in an extension page:** `navigator.gpu` is expected in Chrome's extension pages on desktop (they are a secure context), but it was not tested in this popup, and Brave's default for WebGPU was not checked. WebGL is the safe choice. Either way, a missing context must leave the page as it is today.
- **The `shaders` library here** would mean vendoring at least `dist/js` (2.6 MB) plus the component chunks into the extension, for a page that should paint in a frame. Not worth it.

### Extension 32. Popup header

**Today:** `popup.html` header: a 20 x 20 px blue square mark (radius 6 px, empty), "tvdash", the connection pill (dot `--text-3`, `--green` or `--red`), Home link, Options button. No shadows, no blur (`popup.css`).

**Effect:** the mark becomes a tiny version of the TV's aurora (a static blue-to-indigo gradient like the phone's `#g-mark`, with a slow drift when the TV is playing), and the pill's green dot gets the phone's soft glow when connected.

**Why it is only cosmetic here:** the popup is a tool that opens for a few seconds; it must paint instantly. A WebGL context, let alone a WebGPU adapter and pipeline, costs tens of milliseconds before the first frame and is pure overhead for a 20 px square.

**How:** CSS only in `popup.css`: `.mark { background: linear-gradient(...) }`, an optional `@keyframes` on `background-position` gated by a `data-playing` attribute that `popup.js` sets from the status it already polls, and `box-shadow` on `.pill[data-state="ok"] .dot`. No canvas.

**Verdict: skip** the shader. The CSS touches are a maybe and take minutes.

### Extension 42. Home page (`home.html`)

**Today:** a full tab meant as the browser's home or startup page: a 72 px clock, a search box, a grid of `--card` panels on a flat `--ink #0d0f0e`, with its own green and grey palette.

**Effect:** an ambient backdrop behind the grid, the TV's aurora at low strength, tinted by what is on the TV (green when idle, to keep this page's palette; blue while the player plays; orange for a card or link), so the laptop's start page shows at a glance that the TV is busy.

**Why it suits this page:** of all the web surfaces, this one has the room (a full desktop tab), a desktop GPU, no glass panels (cards are opaque `--card`, so no blur is recomputed), and it is looked at often but briefly, which is what an ambient backdrop is for.

**How:** a new `home-backdrop.js` module of a few KB in `extension/`, imported by `home.js`: a `<canvas>` inserted first in `body`, `position: fixed; inset: 0; z-index: -1`, a WebGL 1 fragment shader (the TV's AGSL ported), rendered at half or a quarter of the CSS size, 20 to 30 fps, `requestAnimationFrame` (Chrome already throttles it in background tabs) plus a stop on `visibilitychange`. The tint uniform is set from the status `home.js` already fetches every 3 s. Fallback: the flat `--ink` background, which stays as `body`'s background; no canvas when `prefers-reduced-motion: reduce` matches or the context fails. If the owner prefers the library's look here, `shaders/js` could render it (`createShader(canvas, { components: [{ type: 'MeshGradient', props: { colorA: '#0d0f0e', colorB: '#30d158', colorSpace: 'oklab', speed: 0.3 }, children: [] }] })`, with props as in the skill's recipe), but only by vendoring the package into the extension and only with WebGPU, so the hand-written shader remains the recommendation.

**Verdict: do it.**

## Verdicts

| Screen | Verdict | Why, in one line |
|---|---|---|
| TV 1, app frame / aurora backdrop | **do** | Always on screen; step 1 (grain, bloom, pause while hidden) works on minSdk 28 and the owner's API 31 TV; AGSL only behind an API 33 check. |
| TV 2, idle home | **do** (rides on TV 1) | Gets the backdrop for free; nothing on the clock or toolbar. |
| TV 3, cards (info, success, warning) | **do** | An accent bloom behind the panel is seen from across the room and needs no AGSL. |
| TV 4, link card | **skip** | The QR must stay clean; TV 1 already tints it. |
| TV 4, GitHub card | **maybe** | A running-checks shimmer is small value until `checksVerdict` is drawn. |
| TV 5, player controls overlay | **skip** | The video is on its own plane; GPU work over decoding video costs frames and heat. |
| TV 5, player loading / buffering | **maybe** | A glowing spinner is free but on screen for seconds. |
| TV 6, steps timer | **do** | Small area, state readable from the kitchen, blur glow works on API 31. |
| Phone 1, remote shell | **maybe** | Ties phone to TV, but an animated backdrop under 28 px glass blur costs every frame on phones. |
| Phone 5 to 8, Now playing card | **do** | CSS-only living art tile answers "is it playing" at a glance. |
| Extension 32, popup header | **skip** | A popup must paint instantly; CSS touches at most. |
| Extension 42, home page | **do** | Full tab, desktop GPU, opaque cards: the best web place for an ambient shader. |

## Order

1. **TV 1, step 1, pause while hidden:** gate the aurora's drift loop on `LocalScreenInFront` (`ui/Aurora.kt`). Pure win, frees GPU for everything after.
2. **TV 1, step 1, grain:** the full-resolution noise tile over the aurora. Fixes banding on every device.
3. **TV 3, accent bloom** (through `AuroraBackground`). Cards are the most frequent push.
4. **TV 6, timer glow** (`TimerRing`, `ui/Steps.kt`).
5. **Phone 5 to 8, living art tile** (CSS in `remote.html`).
6. **Extension 42, home backdrop** (`home-backdrop.js`, WebGL).
7. **TV 1, step 2, AGSL aurora** behind `SDK_INT >= 33`, once an Android 13+ TV or emulator is at hand to see it; the owner's TV will keep showing steps 1 to 3.
8. **Phone 1, shell backdrop:** CSS version, then measure on a phone before any canvas.
9. Maybes as time allows: TV 5 spinner glow, TV 4 running-checks shimmer, TV 3 hairline sweep, popup CSS touches.

Each step is one file or one composable, and each keeps today's drawing as the path that runs when the new one cannot.

## Unclear or not found

- **The owner's TV's API level** is taken from `README.md` ("TCL, Android TV 12"); the device itself was not queried (`adb` was not run, as tvdash is read-only here). Android TV 12 maps to API 31; if the TV was updated since, re-check with `adb shell getprop ro.build.version.sdk`.
- **Which Google TV and Android TV devices run Android TV 13 or newer** (and so can run AGSL) was not verified. Older Chromecast with Google TV, many TCL, Hisense and Sony sets, and Android TV boxes run Android 9 to 12.
- **The TV's GPU** is described in the code only as "a modest 32-bit TV GPU"; the SoC and GPU model were not identified, so the cost estimates above are by pixel count, not measured.
- **The AGSL sketch was not compiled** or run on a device; it follows AGSL's documented syntax (`layout(color) uniform half4`, `half4 main(float2 fragCoord)`).
- **Whether the aurora keeps redrawing under the full-screen player** is inferred from `TvdashApp` keeping `TvdashScreen` composed and `AuroraBackground` not reading `LocalScreenInFront`; not measured with a GPU profiler.
- **`ContentFrame`'s surface type** is not set in `PlayerScreen.kt`; that Media3 1.11.1 defaults it to a `SurfaceView` is from the library's documentation as remembered, not checked in this checkout.
- **The `shaders` gzip size** (about 0.7 MB for the lazy chunk) is the figure given for this task; only the on-disk 2.6 MB of `dist/js` in version 4.0.6 was checked here.
- **MV3 default CSP details** (whether `'wasm-unsafe-eval'` is in the default) and **WebGPU availability in Chrome and Brave extension popups** were not tested.
- **The attribute that carries the playback state** on the phone's Now playing card was not read line by line (`remote.html:1188` sets the state tone); the CSS selector above may need a new attribute.
- **Banding on the current aurora** is expected from the technique (low-alpha two-stop radial gradients over near-black, upscaled 4x), not observed on the TV; check a screenshot from `scripts/verify.sh` before and after.
