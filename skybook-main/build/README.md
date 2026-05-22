# Build Assets

Place the SkyBook app icon here before building the desktop app:

| File | Purpose | Min Size |
|------|---------|----------|
| `icon.png` | Linux + electron-builder source | 512×512 px |
| `icon.ico` | Windows installer & taskbar | Multi-size ICO |
| `icon.icns` | macOS Dock & Finder | Multi-size ICNS |

electron-builder will use `icon.ico` for Windows, `icon.icns` for macOS,
and `icon.png` as fallback. If only `icon.png` is provided, electron-builder
will attempt to auto-convert it (requires `wine` on Linux CI).

Download the SkyBook logo PNG from Supabase and save it here as `icon.png`,
then use a tool like https://www.icoconverter.com or ImageMagick to generate
the .ico and .icns variants.
