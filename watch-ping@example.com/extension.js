import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const SETTINGS_SCHEMA = 'org.gnome.shell.extensions.watch-ping';
const DEFAULT_HOST = '1.1.1.1';
const DEFAULT_INTERVAL_SECONDS = 5;

const WatchPingIndicator = GObject.registerClass(
class WatchPingIndicator extends PanelMenu.Button {
    _init() {
        super._init(0.0, 'WatchPingIndicator');

        this._label = new St.Label({
            text: 'ping...',
            y_align: Clutter.ActorAlign.CENTER,
        });

        this.add_child(this._label);
    }

    setText(text) {
        this._label.text = text;
    }
});

export default class WatchPingExtension extends Extension {
    enable() {
        this._indicator = new WatchPingIndicator();
        Main.panel.addToStatusArea(this.uuid, this._indicator, 0, 'center');

        this._settings = this.getSettings(SETTINGS_SCHEMA);
        this._settingsChangedIds = [
            this._settings.connect('changed::host', () => this._restartPingProcess()),
            this._settings.connect('changed::interval-seconds', () => this._restartPingProcess()),
        ];

        this._pingProcess = null;
        this._pingStdoutStream = null;
        this._startPingProcess();
    }

    disable() {
        this._stopPingProcess();

        if (this._settings) {
            for (const id of (this._settingsChangedIds ?? []))
                this._settings.disconnect(id);
        }
        this._settingsChangedIds = [];
        this._settings = null;

        this._indicator?.destroy();
        this._indicator = null;
    }

    _startPingProcess() {
        if (!this._indicator)
            return;

        const host = this._getHost();
        const intervalSeconds = this._getIntervalSeconds();

        this._pingCancellable = new Gio.Cancellable();

        try {
            this._pingProcess = Gio.Subprocess.new(
                ['ping', '-n', '-i', `${intervalSeconds}`, '-W', '2', host],
                Gio.SubprocessFlags.STDOUT_PIPE |
                Gio.SubprocessFlags.SEARCH_PATH
            );
        } catch (error) {
            this._pingProcess = null;
            logError(error, 'Failed to start ping process');
            this._indicator.setText('ping err');
            return;
        }

        this._pingStdoutStream = new Gio.DataInputStream({
            base_stream: this._pingProcess.get_stdout_pipe(),
            close_base_stream: true,
        });

        this._readNextPingLine();

        this._pingProcess.wait_check_async(
            this._pingCancellable,
            (subprocess, result) => {
                try {
                    subprocess.wait_check_finish(result);
                } catch (error) {
                    if (!(error instanceof GLib.Error) ||
                        !error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                        logError(error, 'Ping process exited unexpectedly');
                }
            }
        );
    }

    _readNextPingLine() {
        if (!this._pingStdoutStream || !this._indicator)
            return;

        this._pingStdoutStream.read_line_async(
            GLib.PRIORITY_DEFAULT,
            this._pingCancellable,
            (stream, result) => {
                try {
                    const [line] = stream.read_line_finish_utf8(result);
                    if (line === null)
                        return;

                    const latencyMs = this._extractLatency(line);
                    if (latencyMs !== null && this._indicator)
                        this._indicator.setText(`${latencyMs} ms`);

                    this._readNextPingLine();
                } catch (error) {
                    if (!(error instanceof GLib.Error) ||
                        !error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                        logError(error, 'Failed to read ping output');
                }
            }
        );
    }

    _restartPingProcess() {
        this._stopPingProcess();
        this._startPingProcess();
    }

    _stopPingProcess() {
        this._pingCancellable?.cancel();
        this._pingCancellable = null;

        try {
            this._pingStdoutStream?.close(null);
        } catch (error) {
            logError(error, 'Failed to close ping output stream');
        }
        this._pingStdoutStream = null;

        if (this._pingProcess && !this._pingProcess.get_if_exited())
            this._pingProcess.force_exit();

        this._pingProcess = null;
    }

    _getHost() {
        const host = this._settings?.get_string('host') ?? '';
        return host.trim() || DEFAULT_HOST;
    }

    _getIntervalSeconds() {
        const intervalSeconds = this._settings?.get_int('interval-seconds') ?? DEFAULT_INTERVAL_SECONDS;
        return Math.max(1, intervalSeconds);
    }

    _extractLatency(pingOutput) {
        const match = pingOutput.match(/time[=<]([\d.]+)\s*ms/i);
        if (!match)
            return null;

        return match[1];
    }
}
