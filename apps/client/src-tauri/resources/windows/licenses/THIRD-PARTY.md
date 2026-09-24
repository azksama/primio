# Windows player components

Primio launches an unmodified mpv executable as a separate process using its JSON IPC protocol. The binary is renamed `primio-player.exe`. uosc provides the player's controls. Primio's own Lua integration is in `player/scripts/primio.lua`.

- mpv: `v0.41.0-1055-g6fd80b200`, Windows x86_64 build 20260923. GPL-2.0-or-later; see `mpv-Copyright` and `mpv-LICENSE.GPL`.
  - Source: https://github.com/mpv-player/mpv/tree/6fd80b2003
  - Build recipes and dependencies: https://github.com/shinchiro/mpv-winbuild-cmake/tree/20260923
  - Original binary: https://github.com/shinchiro/mpv-winbuild-cmake/releases/tag/20260923
  - FFmpeg version: N-126773-g7d14defcc. Sources: https://github.com/FFmpeg/FFmpeg/tree/7d14defcc
  - libplacebo version: v7.372.0. Sources: https://code.videolan.org/videolan/libplacebo
- uosc 5.13.0: LGPL-2.1-or-later. See `uosc-LICENSE.LGPL`.
  - Complete source and font assets: https://github.com/tomasklaen/uosc/tree/5.13.0

Pinned download hashes and preparation commands are in `scripts/prepare-windows.ps1` in the Primio source distribution. Neither the media player nor uosc is a proprietary Primio component.
