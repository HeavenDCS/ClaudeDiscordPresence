# Assets

This folder is for the image(s) your Discord Rich Presence shows.

## The zero-upload path (the default)

This build already does this: a square **`claude.png`** lives in this folder and
`largeImage` points at its raw GitHub URL, so the logo shows with **no Discord
asset upload**. To use your own art, replace `claude.png` (512×512 recommended)
and keep the URL, or point `largeImage` at any public `https://` PNG/JPG:

```jsonc
{
  "presence": {
    "largeImage": "https://raw.githubusercontent.com/HeavenDCS/claude-discord-presence/main/assets/claude.png"
  }
}
```

Discord proxies the image, so any publicly-reachable `https://` PNG/JPG URL works.

## The classic path (art assets)

Alternatively, upload images in the **Discord Developer Portal → your app →
Rich Presence → Art Assets** and reference them by key:

| Asset key | Used for |
|---|---|
| `claude_logo` | the large icon |
| `active` | small overlay when Claude is focused |
| `idle` | small overlay when Claude is backgrounded |

Then set `"largeImage": "claude_logo"` and so on.

> The bundled `claude.png` is the image this build ships with. Replace it with
> your own art any time, or switch `largeImage` to an asset key as above.
