import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const WatchPingIndicator = GObject.registerClass(
class WatchPingIndicator extends PanelMenu.Button {
    _init() {
        super._init(0.0, 'WatchPingIndicator');

        this._label = new St.Label({
            text: 'Hello world',
            y_align: St.Align.MIDDLE,
        });

        this.add_child(this._label);
    }
});

export default class WatchPingExtension extends Extension {
    enable() {
        this._indicator = new WatchPingIndicator();
        Main.panel.addToStatusArea(this.uuid, this._indicator, 0, 'center');
    }

    disable() {
        this._indicator?.destroy();
        this._indicator = null;
    }
}
