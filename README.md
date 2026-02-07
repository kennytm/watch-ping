# watch-ping

Sample GNOME Shell extension project.

## Extension

Path: `watch-ping@example.com`

This extension adds `Hello world` to the GNOME top bar.

## Local install (for testing)

```bash
mkdir -p ~/.local/share/gnome-shell/extensions
cp -r watch-ping@example.com ~/.local/share/gnome-shell/extensions/
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
