# watch-ping

GNOME Shell extension that displays network latency in the top bar.

## Extension

Path: `watch-ping@example.com`

This extension pings `1.1.1.1` every 5 seconds and updates the label with the latest response time in milliseconds.
Host and interval can be changed in the extension preferences.

## Local install (for testing)

```bash
mkdir -p ~/.local/share/gnome-shell/extensions
cp -r watch-ping@example.com ~/.local/share/gnome-shell/extensions/
glib-compile-schemas ~/.local/share/gnome-shell/extensions/watch-ping@example.com/schemas
# Restart GNOME Shell session or log out/in, then enable the extension.
```

## Build installable bundle

```bash
./scripts/build-extension.sh
gnome-extensions install ./dist/watch-ping@example.com.v1.shell-extension.zip
```

## Testing

```bash
gnome-extensions install --force ./dist/watch-ping@example.com.v1.shell-extension.zip
dbus-run-session gnome-shell --devkit --wayland
```
