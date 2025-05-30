/**
 * ColorBlind Filters
 * extension.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022-2024
 * @license    GPL-3.0
 */
'use strict';

import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as Slider from 'resource:///org/gnome/shell/ui/slider.js';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import * as Effects from './effects.js';

const PANEL_ICON_SIZE = 18; // default +2 looks better
const EFFECT_NAME = 'colorblind';
let _;

export default class CBFilters extends Extension {
    enable() {
        _ = this.gettext.bind(this);
        this._menu = new MenuButton(this);
        Main.panel.addToStatusArea(this.name, this._menu, 0, 'right');
    }

    disable() {
        this._menu.destroy();
        this._menu = null;
        _ = null;
    }
}

const MenuButton = GObject.registerClass(
    class MenuButton extends PanelMenu.Button {
        _init(me) {
            super._init(0.5, 'ColorblindMenu', false);
            const settings = me.getSettings();
            this._settings = settings;

            const bin = new St.BoxLayout();
            const panelLabel = new St.Label({ y_align: Clutter.ActorAlign.CENTER });

            bin.add_child(panelLabel);
            this.add_child(bin);

            this._panelLabel = panelLabel;
            this._panelBin = bin;

            const switchOff = new PopupMenu.PopupSwitchMenuItem('', false);
            this._switch = switchOff;
            this._activeLabel = switchOff.label;

            const strengthSlider = new Slider.Slider(0);
            const sliderMenuItem = new PopupMenu.PopupBaseMenuItem();
            sliderMenuItem._slider = true;
            const label = new St.Label({ text: _('Strength:') });
            sliderMenuItem.add_child(label);
            sliderMenuItem.add_child(strengthSlider);
            this._strengthSlider = strengthSlider;

            this._menuItems = [];
            const effects = Effects.getEffectGroups();
            const addEffectsToMenu = (effects, menu) => {
                for (const e of effects) {
                    const item = new PopupMenu.PopupMenuItem(_(e.description));
                    item.setOrnament(PopupMenu.Ornament.NONE);
                    item.connect('activate', () => settings.set_string('filter-name', e.name));
                    item._effect = e;
                    this._menuItems.push(item);
                    menu.addMenuItem(item);
                }
            };

            const correctionsExpander = new PopupMenu.PopupSubMenuMenuItem(_('Color Blindness - Corrections'));
            addEffectsToMenu(effects.corrections, correctionsExpander.menu);
            this.menu.connect('open-state-changed', (_menu, opened) => {
                if (opened) {
                    correctionsExpander.setSubmenuShown(true);
                }
            });

            const simulationsExpander = new PopupMenu.PopupSubMenuMenuItem(_('Color Blindness - Simulations'));
            addEffectsToMenu(effects.simulations, simulationsExpander.menu);

            const otherExpander = new PopupMenu.PopupSubMenuMenuItem(_('Other Effects'));
            addEffectsToMenu(effects.others, otherExpander.menu);

            this.menu.addMenuItem(switchOff);
            this.menu.addMenuItem(sliderMenuItem);
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            this.menu.addMenuItem(correctionsExpander);
            this.menu.addMenuItem(simulationsExpander);
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            this.menu.addMenuItem(otherExpander);

            const setEffect = (effectName) => {
                const selectedItem = this._menuItems.find((i) => i._effect.name == effectName);
                this._setSelected(selectedItem, false);
            };
            settings.connect('changed::filter-name', (s, k) => setEffect(s.get_string(k)));
            setEffect(settings.get_string('filter-name'));

            strengthSlider.connect('notify::value', () => this._setStrength(strengthSlider.value));
            settings.bind('filter-strength', strengthSlider, 'value', 0);

            switchOff.connect('notify::state', () => this._setEnabled(this._switch.state));
            settings.bind('filter-active', this._switch, 'state', 0);
        }

        destroy() {
            if (this._shader) {
                Main.uiGroup.remove_effect_by_name(EFFECT_NAME);
            }

            if (this._labelTimeoutId) {
                GLib.source_remove(this._labelTimeoutId);
            }

            super.destroy();
        }

        _setSelected(item) {
            if (this._selectedItem) {
                this._selectedItem.setOrnament(PopupMenu.Ornament.NONE);
            }

            item.setOrnament(PopupMenu.Ornament.DOT);

            const effect = item._effect;
            this._strengthSlider.visible = effect.properties.factor !== undefined;
            this._activeLabel.text = effect.description;

            this._changeEffect(item);
        }

        _setEnabled(enabled) {
            if (this._panelIcon) {
                this._panelBin.remove_child(this._panelIcon);
                this._panelIcon.destroy();
            }

            const iconName = enabled ? 'reveal' : 'conceal';
            const gicon = Gio.icon_new_for_string(`view-${iconName}-symbolic`);
            this._panelIcon = new St.Icon({ gicon, icon_size: PANEL_ICON_SIZE });
            this._panelBin.add_child(this._panelIcon);

            this._changeEffect();
        }

        _setStrength(_strength) {
            this._changeEffect();
        }

        _changeEffect(newItem = this._selectedItem) {
            const oldShader = this._shader ? this._selectedItem._effect.shader : null;
            const newShader = this._switch.state ? newItem._effect.shader : null;
            this._selectedItem = newItem;
            const newEffect = newItem._effect;

            if (oldShader !== null && oldShader !== newShader) {
                Main.uiGroup.remove_effect_by_name(EFFECT_NAME);
                this._shader = null;
            }
            if (newShader !== null) {
                if (newEffect.properties.factor !== undefined) {
                    newEffect.properties.factor = this._strengthSlider.value;
                }
                if (oldShader != newShader) {
                    this._shader = Effects.makeShader(newEffect);
                    Main.uiGroup.add_effect_with_name(EFFECT_NAME, this._shader);
                } else {
                    this._shader.updateEffect(newEffect.properties);
                }
            }
        }

        vfunc_event(event) {
            if (event.type() === Clutter.EventType.BUTTON_RELEASE)
                return Clutter.EVENT_PROPAGATE;

            // scrolling over panel btn switches between all cb correction filters except inversions
            if (this._switch.state && event.type() === Clutter.EventType.SCROLL) {
                const direction = event.get_scroll_direction();

                if (direction === Clutter.ScrollDirection.SMOOTH)
                    return Clutter.EVENT_STOP;

                const numItems = this._menuItems.length;
                const step = direction === Clutter.ScrollDirection.UP ? numItems - 2 : 1;
                const index = (this._menuItems.indexOf(this._selectedItem) + step) % (numItems - 1);
                const item = this._menuItems[index];
                this._settings.set_string('filter-name', item._effect.name);
                this._setPanelLabel(item._effect.shortName);

                return Clutter.EVENT_STOP;
            }

            if (event.type() === Clutter.EventType.BUTTON_PRESS && (event.get_button() === Clutter.BUTTON_PRIMARY || event.get_button() === Clutter.BUTTON_MIDDLE)) {
                // primary button toggles active filter on/off
                if (event.get_button() === Clutter.BUTTON_PRIMARY) {
                    this._switch.toggle();
                    return Clutter.EVENT_STOP;
                }
            } else if (event.type() === Clutter.EventType.TOUCH_BEGIN || (event.type() === Clutter.EventType.BUTTON_PRESS && event.get_button() === Clutter.BUTTON_SECONDARY)) {
                this.menu.toggle();
                return Clutter.EVENT_STOP;
            }

            return Clutter.EVENT_PROPAGATE;
        }

        _setPanelLabel(label) {
            if (label != '') {
                this._panelLabel.text = label;
                this._panelBin.set_style('spacing: 3px;');
                this._resetLabelTimeout();
            } else {
                this._panelBin.set_style('spacing: 0;');
                this._panelLabel.text = '';
            }
        }

        _resetLabelTimeout() {
            if (this._labelTimeoutId)
                GLib.source_remove(this._labelTimeoutId);

            this._labelTimeoutId = GLib.timeout_add_seconds(
                GLib.PRIORITY_DEFAULT,
                2,
                () => {
                    this._setPanelLabel('');

                    this._labelTimeoutId = 0;
                    return GLib.SOURCE_REMOVE;
                }
            );
        }
    });
