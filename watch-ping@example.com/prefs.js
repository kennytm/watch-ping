import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const SETTINGS_SCHEMA = 'org.gnome.shell.extensions.watch-ping';
const DEFAULT_HOST = '1.1.1.1';
const DEFAULT_INTERVAL_SECONDS = 5;
const MIN_INTERVAL_SECONDS = 1;
const MAX_INTERVAL_SECONDS = 3600;

export default class WatchPingPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings(SETTINGS_SCHEMA);

        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup({
            title: _('Watch Ping'),
        });
        page.add(group);

        const hostRow = new Adw.EntryRow({
            title: _('Ping Host'),
            text: settings.get_string('host') || DEFAULT_HOST,
        });
        hostRow.connect('notify::text', row => {
            const host = row.text.trim();
            settings.set_string('host', host || DEFAULT_HOST);
        });
        settings.connect('changed::host', () => {
            const host = settings.get_string('host') || DEFAULT_HOST;
            if (hostRow.text !== host)
                hostRow.text = host;
        });
        group.add(hostRow);

        const intervalRow = new Adw.ActionRow({
            title: _('Interval'),
            subtitle: _('Seconds between pings'),
        });
        const intervalSpin = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower: MIN_INTERVAL_SECONDS,
                upper: MAX_INTERVAL_SECONDS,
                step_increment: 1,
                page_increment: 10,
                value: settings.get_int('interval-seconds') || DEFAULT_INTERVAL_SECONDS,
            }),
            digits: 0,
            numeric: true,
            valign: Gtk.Align.CENTER,
        });
        intervalSpin.connect('value-changed', spin => {
            settings.set_int('interval-seconds', spin.get_value_as_int());
        });
        settings.connect('changed::interval-seconds', () => {
            const intervalSeconds = Math.max(MIN_INTERVAL_SECONDS, settings.get_int('interval-seconds'));
            if (intervalSpin.get_value_as_int() !== intervalSeconds)
                intervalSpin.set_value(intervalSeconds);
        });

        intervalRow.add_suffix(intervalSpin);
        intervalRow.activatable_widget = intervalSpin;
        group.add(intervalRow);

        window.add(page);
    }
}
