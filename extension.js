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
let _;

export default class CBFilters extends Extension {
    enable() {
        _ = this.gettext.bind(this);
        this._menu = new MenuButton(this);
        Main.panel.addToStatusArea('ColorBlindFilters', this._menu, 0, 'right');
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
            this._settings = me.getSettings();
            this._filterName = 'colorblind';

            this._actionTime = 0;
            this._activeItem = null;
            this._activeData = null;
            this._filterStrength = 1;
            this._menuItems = [];

            const bin = new St.BoxLayout();
            const panelLabel = new St.Label({ y_align: Clutter.ActorAlign.CENTER });

            bin.add_child(panelLabel);
            this.add_child(bin);

            this._panelLabel = panelLabel;
            this._panelBin = bin;

            this._menuItems = [];

            const switchOff = new PopupMenu.PopupSwitchMenuItem('', false);
            switchOff.connect('toggled', () => {
                this._switchToggled();
            });
            this._switch = switchOff._switch;
            this._activeLabel = switchOff.label;

            const strengthSlider = new Slider.Slider(0);
            const sliderMenuItem = new PopupMenu.PopupBaseMenuItem();
            sliderMenuItem._slider = true;
            const label = new St.Label({ text: _('Strength:') });
            sliderMenuItem.add_child(label);
            sliderMenuItem.add_child(strengthSlider);
            this._strengthMenuItem = sliderMenuItem;
            this._strengthSlider = strengthSlider;

            const effects = Effects.getEffectGroups();
            const addEffectsToMenu = (effects, menu) => {
                for (const e of effects) {
                    const item = new PopupMenu.PopupMenuItem(_(e.description));
                    item.connect('activate', this._switchFilter.bind(this, item));
                    item._effect = e;
                    this._menuItems.push(item);
                    menu.addMenuItem(item);
                }
            };

            const correctionsExpander = new PopupMenu.PopupSubMenuMenuItem(_('Color Blindness - Corrections'));
            this._correctionsExpander = correctionsExpander;
            addEffectsToMenu(effects.corrections, correctionsExpander.menu);

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

            this._loadSettings();
            this._setShaderEffect();

            strengthSlider.connect('notify::value', this._switchFilter.bind(this, strengthSlider));
            this.connect('destroy', () => {
                this._removeEffect();
                this._activeEffect = null;

                if (this._labelTimeoutId)
                    GLib.source_remove(this._labelTimeoutId);

                if (this._delayedSaveId) {
                    GLib.source_remove(this._delayedSaveId);
                    this._delayedSaveId = 0;
                }
                this._settings = null;
            });
        }

        _switchToggled() {
            if (this._switch.state) {
                if (this._activeEffect)
                    this._addEffect(this._activeEffect);
                else
                    this._setShaderEffect();
            } else {
                this._removeEffect();
            }
            this._setPanelIcon();
            this._saveSettings();
        }

        _switchFilter(activeItem) {
            this._saveSettings();
            this._setPanelIcon();
            this._setOrnament();

            if (activeItem.value === undefined) {
                // active item is filter
                const sameShader = activeItem._effect.effect === this._activeData.effect;
                this._activeItem = activeItem;
                this._activeData = activeItem._effect;
                if (sameShader)
                    this._updateEffect();
                else
                    this._setShaderEffect();
            } else {
                // activeItem is strength slider
                // for some reason 0 and 1 don't update the shader
                // Math.Clamp is not supported in older versions og gjs
                // this._filterStrength = Math.clamp(0.001, activeItem.value, 0.999);
                this._filterStrength = activeItem.value;
                if (this._filterStrength === 0)
                    this._filterStrength += 0.001;
                else if (this._filterStrength === 1)
                    this._filterStrength -= 0.001;
                this._updateEffect();
            }
        }

        _setOrnament() {
            for (const item of this._menuItems)
                item.setOrnament(PopupMenu.Ornament.NONE);


            const item = this._activeItem;
            const slider = this._strengthMenuItem;
            item.setOrnament(PopupMenu.Ornament.DOT);

            if (item._effect.sliderEnabled)
                slider.visible = true;
            else
                slider.visible = false;

            this._activeLabel.text = item.label.text;
        }

        _updateEffect() {
            this._updateExtension();
            const properties = this._getProperties();
            this._activeEffect.updateEffect(properties);
        }

        _getProperties() {
            const effectData = this._activeData;
            const properties = effectData.properties;
            if (properties.factor !== undefined)
                properties.factor = this._filterStrength;

            return properties;
        }

        _updateExtension() {
            this._setPanelIcon();
            this._setOrnament();
        }

        _setShaderEffect() {
            this._removeEffect();
            this._updateExtension();

            if (!this._switch.state)
                return;


            const properties = this._getProperties();

            const effectData = this._activeData;
            const effect = new effectData.effect(properties);
            this._addEffect(effect);
        }

        _addEffect(effect) {
            Main.uiGroup.add_effect_with_name(this._filterName, effect);
            this._activeEffect = effect;
        }

        _removeEffect() {
            Main.uiGroup.remove_effect_by_name(this._filterName);
            this._activeEffect = null;
        }

        _saveSettings() {
            // avoid unnecessary disk usage
            if (this._delayedSaveId)
                GLib.source_remove(this._delayedSaveId);


            this._delayedSaveId = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                200,
                () => {
                    const settings = this._settings;
                    settings.set_boolean('filter-active', this._switch.state);
                    settings.set_string('filter-name', this._activeData.name);
                    settings.set_int('filter-strength', Math.round(this._filterStrength * 100));
                    if (this._switch.state) {
                        // re-enabling the effect updates the whole screen immediately, otherwise it can flicker / partially apply on some portions of the screen
                        // but for a price of significant memory use (same as remove/add), which is often NOT released by the garbage collector
                        // this._activeEffect.set_enabled(false);
                        // this._activeEffect.set_enabled(true);
                    }
                    this._delayedSaveId = 0;
                    return GLib.SOURCE_REMOVE;
                }
            );
        }

        _loadSettings() {
            const settings = this._settings;
            const effectName = settings.get_string('filter-name');
            const item = this._getItemByName(effectName);
            this._activeItem = item ? item : this._getItemByName('DeuterCorrection');
            this._activeData = this._activeItem._effect;
            this._filterStrength = settings.get_int('filter-strength') / 100;
            // for some reason 0 and 1 don't update the shader
            // Math.Clamp is not supported in older versions og gjs
            // this._filterStrength = Math.clamp(0.01, this._filterStrength, 0.99);
            if (this._filterStrength === 0)
                this._filterStrength += 0.001;
            else if (this._filterStrength === 1)
                this._filterStrength -= 0.001;
            this._strengthSlider.value = this._filterStrength;
            this._switch.state = settings.get_boolean('filter-active');
        }

        _getItemByName(name) {
            for (const item of this._menuItems) {
                if (item._effect.name === name)
                    return item;
            }
            return null;
        }

        vfunc_event(event) {
            if (event.type() === Clutter.EventType.BUTTON_RELEASE)
                return Clutter.EVENT_PROPAGATE;

            // scrolling over panel btn switches between all cb correction filters except inversions
            if (this._switch.state && event.type() === Clutter.EventType.SCROLL && (Date.now() - this._actionTime) > 200) {
                const direction = event.get_scroll_direction();

                if (direction === Clutter.ScrollDirection.SMOOTH)
                    return Clutter.EVENT_STOP;


                const step = direction === Clutter.ScrollDirection.UP ? 10 : 1;
                const index = (this._menuItems.indexOf(this._activeItem) + step) % 11;
                const item = this._menuItems[index];
                this._switchFilter(item);
                this._setPanelLabel(item);

                return Clutter.EVENT_STOP;
            }

            if (event.type() === Clutter.EventType.BUTTON_PRESS && (event.get_button() === Clutter.BUTTON_PRIMARY || event.get_button() === Clutter.BUTTON_MIDDLE)) {
                // primary button toggles active filter on/off
                if (event.get_button() === Clutter.BUTTON_PRIMARY) {
                    this._switch.state = !this._switch.state;
                    // this._setShaderEffect();
                    this._switchToggled();
                    return Clutter.EVENT_STOP;
                }
            } else if (event.type() === Clutter.EventType.TOUCH_BEGIN || (event.type() === Clutter.EventType.BUTTON_PRESS && event.get_button() === Clutter.BUTTON_SECONDARY)) {
                this.menu.toggle();
                this._correctionsExpander.setSubmenuShown(true);
                return Clutter.EVENT_STOP;
            }

            return Clutter.EVENT_PROPAGATE;
        }

        _setPanelLabel(item) {
            if (!item)
                item = this._activeItem;


            if (this._switch.state) {
                this._panelLabel.text = this._activeData.shortName;
                this._panelBin.set_style('spacing: 3px;');
                this._resetLabelTimeout();
            } else {
                this._panelBin.set_style('spacing: 0;');
                this._panelLabel.text = '';
            }
        }

        _setPanelIcon() {
            if (this._icon) {
                this._panelBin.remove_child(this._icon);
                this._icon.destroy();
                this._icon = null;
            }

            const gicon = Gio.icon_new_for_string(`view-${this._switch.state ? 'reveal' : 'conceal'}-symbolic`);
            const icon = new St.Icon({ gicon, icon_size: PANEL_ICON_SIZE });

            this._panelBin.add_child(icon);
            this._icon = icon;
        }

        _resetLabelTimeout() {
            if (this._labelTimeoutId)
                GLib.source_remove(this._labelTimeoutId);


            this._labelTimeoutId = GLib.timeout_add_seconds(
                GLib.PRIORITY_DEFAULT,
                2,
                () => {
                    this._panelLabel.text = '';
                    this._panelBin.set_style('spacing: 0;');
                    this._icon.visible = true;
                    this._labelTimeoutId = 0;
                    return GLib.SOURCE_REMOVE;
                }
            );
        }
    });
