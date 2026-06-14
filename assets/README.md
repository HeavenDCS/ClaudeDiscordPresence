# Assets

This folder is for the image(s) your Discord Rich Presence shows.

## The zero-upload path (easiest)

Drop a square **PNG** here named `claude.png` (512×512 recommended), commit and
push it, then point your config at the raw GitHub URL — no Discord asset upload
needed:

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

Then set `"largeImage": "claude_logo"` (the default) and so on.

> A real Claude logo PNG is intentionally **not** bundled here to avoid shipping
> trademarked artwork. Add your own image, or use an asset key as above.
