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

        this._pingSession = null;
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
            this._indicator.setText('ping err');
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

        this._pingSession = session;

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
        if (this._pingSession !== session || !this._indicator)
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

                    const latencyMs = this._extractLatency(line);
                    if (latencyMs !== null && this._indicator)
                        this._indicator.setText(`${latencyMs} ms`);

                    this._readNextPingLine(session);
                } catch (error) {
                    if (!this._isCancelledError(error))
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
