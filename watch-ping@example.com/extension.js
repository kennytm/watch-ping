import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Cairo from 'cairo';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const SETTINGS_SCHEMA = 'org.gnome.shell.extensions.watch-ping';
const DEFAULT_INTERVAL_SECONDS = 5;
const NO_PONG_TEXT = '?';
const PING_ERROR_TEXT = 'ping err';
const MAX_SPARKLINE_RECORDS = 20;
const SPARKLINE_WIDTH = 56;
const SPARKLINE_HEIGHT = 16;

const WatchPingIndicator = GObject.registerClass(
class WatchPingIndicator extends PanelMenu.Button {
    _init() {
        super._init(0.0, 'WatchPingIndicator');

        this._sparklineReadingsMs = [];
        this._sparklineIntervalSeconds = DEFAULT_INTERVAL_SECONDS;

        this._container = new St.BoxLayout();
        this._sparkline = new St.DrawingArea({
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._sparkline.set_width(SPARKLINE_WIDTH);
        this._sparkline.set_height(SPARKLINE_HEIGHT);
        this._sparkline.connect('repaint', area => this._onSparklineRepaint(area));

        this._label = new St.Label({
            text: 'ping...',
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._container.add_child(this._sparkline);
        this._container.add_child(this._label);
        this.add_child(this._container);
    }

    setText(text) {
        this._label.text = text;
    }

    setSparkline(readingsMs, intervalSeconds) {
        this._sparklineReadingsMs = readingsMs.slice(-MAX_SPARKLINE_RECORDS);
        this._sparklineIntervalSeconds = Math.max(1, intervalSeconds);
        this._sparkline.queue_repaint();
    }

    _onSparklineRepaint(area) {
        const cr = area.get_context();
        const [width, height] = area.get_surface_size();

        if (width <= 1 || height <= 1)
            return;

        cr.setSourceRGBA(1, 1, 1, 0.25);
        cr.setLineWidth(1);
        cr.moveTo(0, height - 0.5);
        cr.lineTo(width, height - 0.5);
        cr.stroke();

        const slots = new Array(MAX_SPARKLINE_RECORDS).fill(null);
        const recentReadings = this._sparklineReadingsMs.slice(-MAX_SPARKLINE_RECORDS);
        const startIndex = MAX_SPARKLINE_RECORDS - recentReadings.length;
        for (let i = 0; i < recentReadings.length; i++)
            slots[startIndex + i] = recentReadings[i];

        const validReadings = slots.filter(value => value !== null);
        if (validReadings.length === 0)
            return;

        const maxRecentMs = Math.max(...validReadings);
        const yMaxMs = Math.min(
            Math.max(1000, maxRecentMs),
            this._sparklineIntervalSeconds * 1000
        );
        if (yMaxMs <= 0)
            return;

        cr.setAntialias(Cairo.Antialias.BEST);
        cr.setSourceRGBA(0.35, 0.9, 0.55, 0.95);
        cr.setLineWidth(1.5);

        let previousValid = false;
        for (let i = 0; i < slots.length; i++) {
            const valueMs = slots[i];
            const x = i * (width - 1) / (MAX_SPARKLINE_RECORDS - 1);

            if (valueMs === null) {
                previousValid = false;
                continue;
            }

            const clampedMs = Math.min(valueMs, yMaxMs);
            const y = (height - 1) - (clampedMs / yMaxMs) * (height - 1);
            if (previousValid)
                cr.lineTo(x, y);
            else
                cr.moveTo(x, y);

            previousValid = true;
        }

        cr.stroke();

        if (validReadings.length === 1) {
            const pointIndex = slots.findIndex(value => value !== null);
            const valueMs = slots[pointIndex];
            const x = pointIndex * (width - 1) / (MAX_SPARKLINE_RECORDS - 1);
            const clampedMs = Math.min(valueMs, yMaxMs);
            const y = (height - 1) - (clampedMs / yMaxMs) * (height - 1);

            cr.arc(x, y, 1.5, 0, 2 * Math.PI);
            cr.fill();
        }
    }
});

class PingWatchdog {
    constructor(getIntervalSeconds, onTimeout) {
        this._getIntervalSeconds = getIntervalSeconds;
        this._onTimeout = onTimeout;
        this._sourceId = 0;
        this._lastPongMonotonicUs = 0;
    }

    start() {
        this._lastPongMonotonicUs = GLib.get_monotonic_time();
        this.stop();
        this._sourceId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            1,
            () => {
                const intervalUs = this._getIntervalSeconds() * 1000000;
                const elapsedUs = GLib.get_monotonic_time() - this._lastPongMonotonicUs;
                if (elapsedUs >= intervalUs)
                    this._onTimeout();
                return GLib.SOURCE_CONTINUE;
            }
        );
    }

    markPong() {
        this._lastPongMonotonicUs = GLib.get_monotonic_time();
    }

    stop() {
        if (this._sourceId) {
            GLib.source_remove(this._sourceId);
            this._sourceId = 0;
        }
    }
}

class PingMonitor {
    constructor(settings, callbacks = {}) {
        this._settings = settings;
        this._onTextUpdate = callbacks.onTextUpdate ?? (() => {});
        this._onLatency = callbacks.onLatency ?? (() => {});
        this._onHostActivated = callbacks.onHostActivated ?? (() => {});
        this._pingSession = null;
        this._activeHost = null;
        this._watchdog = new PingWatchdog(
            () => this._getIntervalSeconds(),
            () => this._onTextUpdate(NO_PONG_TEXT)
        );
    }

    start() {
        this._startPingProcess();
    }

    restart() {
        this._stopPingProcess();
        this._startPingProcess();
    }

    stop() {
        this._stopPingProcess();
    }

    _startPingProcess() {
        const host = this._getHost();
        const intervalSeconds = this._getIntervalSeconds();
        if (!this._isValidIpAddress(host)) {
            this._onTextUpdate(NO_PONG_TEXT);
            return;
        }

        const cancellable = new Gio.Cancellable();
        let process;

        try {
            process = Gio.Subprocess.new(
                ['ping', '-n', '-i', `${intervalSeconds}`, '-W', '2', host],
                Gio.SubprocessFlags.STDOUT_PIPE |
                Gio.SubprocessFlags.SEARCH_PATH
            );
        } catch (error) {
            logError(error, 'Failed to start ping process');
            this._onTextUpdate(PING_ERROR_TEXT);
            return;
        }

        const session = {
            cancellable,
            process,
            stdoutStream: new Gio.DataInputStream({
                base_stream: process.get_stdout_pipe(),
                close_base_stream: true,
            }),
        };

        const hostChanged = host !== this._activeHost;
        this._activeHost = host;
        this._pingSession = session;
        if (hostChanged)
            this._onHostActivated(host);
        this._watchdog.start();

        this._readNextPingLine(session);

        process.wait_check_async(
            cancellable,
            (subprocess, result) => {
                if (this._pingSession !== session)
                    return;

                try {
                    subprocess.wait_check_finish(result);
                } catch (error) {
                    if (!this._isCancelledError(error))
                        logError(error, 'Ping process exited unexpectedly');
                }
            }
        );
    }

    _readNextPingLine(session) {
        if (this._pingSession !== session)
            return;

        session.stdoutStream.read_line_async(
            GLib.PRIORITY_DEFAULT,
            session.cancellable,
            (stream, result) => {
                if (this._pingSession !== session)
                    return;

                try {
                    const [line] = stream.read_line_finish_utf8(result);
                    if (line === null)
                        return;

                    const latency = this._extractLatency(line);
                    if (latency !== null) {
                        this._watchdog.markPong();
                        this._onLatency(latency.valueMs);
                        this._onTextUpdate(`${latency.textMs} ms`);
                    }

                    this._readNextPingLine(session);
                } catch (error) {
                    if (!this._isCancelledError(error))
                        logError(error, 'Failed to read ping output');
                }
            }
        );
    }

    _stopPingProcess() {
        this._watchdog.stop();

        const session = this._pingSession;
        this._pingSession = null;

        if (!session)
            return;

        session.cancellable.cancel();

        try {
            session.process.force_exit();
        } catch (error) {
            logError(error, 'Failed to stop ping process');
        }
    }

    _isCancelledError(error) {
        return error instanceof GLib.Error &&
            error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED);
    }

    _isValidIpAddress(host) {
        return GLib.hostname_is_ip_address(host);
    }

    _getHost() {
        const host = this._settings?.get_string('host') ?? '';
        return host.trim();
    }

    _getIntervalSeconds() {
        const intervalSeconds = this._settings?.get_int('interval-seconds') ?? DEFAULT_INTERVAL_SECONDS;
        return Math.max(1, intervalSeconds);
    }

    _extractLatency(pingOutput) {
        const match = pingOutput.match(/time[=<]([\d.]+)\s*ms/i);
        if (!match)
            return null;

        const valueMs = Number.parseFloat(match[1]);
        if (!Number.isFinite(valueMs))
            return null;

        return {
            valueMs,
            textMs: match[1],
        };
    }
}

export default class WatchPingExtension extends Extension {
    enable() {
        this._indicator = new WatchPingIndicator();
        Main.panel.addToStatusArea(this.uuid, this._indicator, 0, 'center');

        this._settings = this.getSettings(SETTINGS_SCHEMA);
        this._recentLatenciesMs = [];
        this._monitor = new PingMonitor(this._settings, {
            onTextUpdate: text => this._indicator?.setText(text),
            onLatency: latencyMs => this._recordLatency(latencyMs),
            onHostActivated: () => this._clearSparkline(),
        });
        this._settingsChangedIds = [
            this._settings.connect('changed::host', () => this._handleHostChanged()),
            this._settings.connect('changed::interval-seconds', () => this._handleIntervalChanged()),
        ];
        this._refreshSparkline();
        this._monitor.start();
    }

    disable() {
        this._monitor?.stop();
        this._monitor = null;

        if (this._settings) {
            for (const id of (this._settingsChangedIds ?? []))
                this._settings.disconnect(id);
        }
        this._settingsChangedIds = [];
        this._settings = null;
        this._recentLatenciesMs = [];

        this._indicator?.destroy();
        this._indicator = null;
    }

    _handleHostChanged() {
        this._monitor.restart();
    }

    _handleIntervalChanged() {
        this._monitor.restart();
        this._refreshSparkline();
    }

    _recordLatency(latencyMs) {
        this._recentLatenciesMs.push(latencyMs);
        if (this._recentLatenciesMs.length > MAX_SPARKLINE_RECORDS)
            this._recentLatenciesMs.splice(0, this._recentLatenciesMs.length - MAX_SPARKLINE_RECORDS);
        this._refreshSparkline();
    }

    _clearSparkline() {
        this._recentLatenciesMs = [];
        this._refreshSparkline();
    }

    _refreshSparkline() {
        this._indicator?.setSparkline(this._recentLatenciesMs, this._getIntervalSeconds());
    }

    _getIntervalSeconds() {
        const intervalSeconds = this._settings?.get_int('interval-seconds') ?? DEFAULT_INTERVAL_SECONDS;
        return Math.max(1, intervalSeconds);
    }
}
