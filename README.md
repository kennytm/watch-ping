# watch-ping

GNOME Shell extension that displays network latency in the top bar.

## Extension

Path: `watch-ping@example.com`

This extension pings `1.1.1.1` every 5 seconds and updates the label with the latest response time in milliseconds.

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
./scripts/test-extension.sh
```
