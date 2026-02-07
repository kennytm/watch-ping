import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const PING_HOST = '1.1.1.1';
const PING_INTERVAL_SECONDS = 5;

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

        this._pingSourceId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            PING_INTERVAL_SECONDS,
            () => {
                this._pingOnce();
                return GLib.SOURCE_CONTINUE;
            }
        );

        this._pingInFlight = false;
        this._pingCancellable = null;
        this._pingOnce();
    }

    disable() {
        if (this._pingSourceId) {
            GLib.source_remove(this._pingSourceId);
            this._pingSourceId = 0;
        }

        this._pingCancellable?.cancel();
        this._pingCancellable = null;
        this._pingInFlight = false;

        this._indicator?.destroy();
        this._indicator = null;
    }

    _pingOnce() {
        if (!this._indicator || this._pingInFlight)
            return;

        this._pingInFlight = true;
        this._pingCancellable = new Gio.Cancellable();

        let process;
        try {
            process = Gio.Subprocess.new(
                ['ping', '-n', '-c', '1', '-W', '2', PING_HOST],
                Gio.SubprocessFlags.STDOUT_PIPE |
                Gio.SubprocessFlags.STDERR_PIPE |
                Gio.SubprocessFlags.SEARCH_PATH
            );
        } catch (error) {
            this._pingInFlight = false;
            this._pingCancellable = null;
            logError(error, 'Failed to start ping process');
            return;
        }

        process.communicate_utf8_async(
            null,
            this._pingCancellable,
            (subprocess, result) => {
                try {
                    const [, stdout] = subprocess.communicate_utf8_finish(result);
                    const latencyMs = this._extractLatency(stdout);
                    if (latencyMs !== null && this._indicator)
                        this._indicator.setText(`${latencyMs} ms`);
                } catch (error) {
                    if (!(error instanceof GLib.Error) ||
                        !error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                        logError(error, 'Ping request failed');
                } finally {
                    this._pingInFlight = false;
                    this._pingCancellable = null;
                }
            }
        );
    }

    _extractLatency(pingOutput) {
        const match = pingOutput.match(/time[=<]([\d.]+)\s*ms/i);
        if (!match)
            return null;

        return match[1];
    }
}
