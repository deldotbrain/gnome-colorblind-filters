/**
 * ColorBlind Filters
 * extension.js
 *
 * @author     A. Pennucci <apennucci@protonmail.com>
 * @copyright  2025
 * @license    GPL-3.0
 */
'use strict';

// FIXME: clean up metadata json; does version-name do anything?
// FIXME: enable/disable leaks memory, but that might be unavoidable when doing
// Quick Settings things? The QS example code on gjs.guide leaks, too.
// ...oh what the absolute fuck? apparently it's considered correct that JS objects leak their reference if .destroy() isn't manually called????
// TODO: verify that separate this.getSettings() helps limit leaks and/or works for different lifecycles
// FIXME: I'd really prefer that the menu not collapse after every action

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import GObject from 'gi://GObject';
import St from 'gi://St';
import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js';
import { Slider } from 'resource:///org/gnome/shell/ui/slider.js';

import {
    Filter, FilterMode, EffectAlgorithm, ColorBlindnessType,
    ColorBlindnessAlgorithm, TritanHackEnable,
    get_algorithms, tritan_hack_allowed
} from './filter.js';

function connect_setting_eager(settings, type_name, name, callback) {
    const getter = Gio.Settings.prototype['get_' + type_name];
    settings.connect('changed::' + name, (s, k) => callback(getter.call(s, k)));
    callback(getter.call(settings, name));
}

export default class ColorblindFilters extends Extension {
    enable() {
        const _ = this.gettext.bind(this);
        const settings = this.getSettings();

        this.manager = new FilterManager(this.metadata.name, settings);

        this.indicator = new FilterIndicator(settings);
        this.indicator.attach(new FilterQuickSettingsMenu(_, settings));
        this.indicator.register();
    }

    disable() {
        this.manager?.destroy();
        this.manager = null;

        this.indicator?.destroy();
        this.indicator = null;
    }
}

class FilterManager {
    constructor(effect_name, settings) {
        this.effect_name = effect_name;
        this.settings = settings;

        this.effect_cache = new Map();

        this.filter = null;
        this.configured_filter = null;

        settings.connect('changed::filter-active', this.update_filter.bind(this));
        settings.get_boolean('filter-active');
        settings.connect('changed::filter-strength', this.update_filter.bind(this));
        settings.get_double('filter-strength');
        connect_setting_eager(settings, 'string', 'filter-name',
            (cfg) => {
                this.configured_filter = Filter.fromString(cfg);
                this.update_filter();
            });
    }

    destroy() {
        this.settings = null;

        if (this.filter !== null) {
            Main.uiGroup.remove_effect_by_name(this.effect_name);
        }
    }

    update_filter() {
        const configured = this.settings.get_boolean('filter-active')
            ? this.configured_filter : null;

        const enabled = configured !== null;
        const changed_effect = this.filter?.effect !== configured?.effect

        if (changed_effect) {
            Main.uiGroup.remove_effect_by_name(this.effect_name);
        }

        if (enabled) {
            configured.factor = this.settings.get_double('filter-strength');

            const effect = this.get_effect(configured);
            if (changed_effect) {
                Main.uiGroup.add_effect_with_name(this.effect_name, effect);
            }
        }

        if (enabled || changed_effect) {
            Main.uiGroup.queue_redraw();
        }

        this.filter = configured;
    }

    get_effect(filter) {
        const effect_type = filter.effect;

        // Avoid a warning from GNOME Shell about creating an excessive
        // number of shaders by caching them.
        const cached = this.effect_cache.get(effect_type);
        if (cached !== undefined) {
            cached.updateEffect(filter.properties);
            return cached;
        } else {
            const effect = new effect_type(filter.properties);
            this.effect_cache.set(effect_type, effect);
            return effect;
        }
    }
}

function pick_icon(enabled) {
    return `view-${enabled ? 'reveal' : 'conceal'}-symbolic`;
}

const FilterIndicator = GObject.registerClass(
    class FilterIndicator extends QuickSettings.SystemIndicator {
        _init(settings) {
            super._init();

            this.settings = settings;
            this.indicator = this._addIndicator();
            connect_setting_eager(settings, 'boolean', 'filter-active', (active) => {
                this.indicator.icon_name = pick_icon(active);
            });

            this.indicator.visible = true;
        }

        destroy() {
            this.settings = null;
            this.quickSettingsItems.forEach((i) => i.destroy());
            this.quickSettingsItems = [];
            super.destroy();
        }

        attach(item) {
            this.quickSettingsItems.push(item);
        }

        register() {
            Main.panel.statusArea.quickSettings.addExternalIndicator(this);
        }
    });

function get_label_for_filter(filter, _) {
    return filter
        ? filter.mode.isColorBlindness
            ? filter.color_blindness_type.name(_)
            : filter.algorithm.name(_)
        : '';
}

// At one point, I was going to have a toggle to display a slider instead of a
// toggle, so I made all the menu logic reusable. As it turns out, QuickSlider
// was not able to do what I wanted, so I decided against it (/diplomatic).
const FilterQuickSettingsMenu = GObject.registerClass(
    class FilterQuickSettingsMenu extends QuickSettings.QuickMenuToggle {
        _init(_, settings) {
            super._init({
                toggleMode: true,
            });

            this.gettext = _;
            this.settings = settings;

            this.title = _('Colorblind Filters');

            connect_setting_eager(settings, 'boolean', 'filter-active',
                this.update_enabled.bind(this));
            connect_setting_eager(settings, 'string', 'filter-name',
                this.update_effect_name.bind(this));
            settings.bind('filter-active', this, 'checked', 0);

            this.config_menu = new FilterConfigMenu(_, settings, this.menu, false, true);
        }

        destroy() {
            this.settings = null;
            this.config_menu?.destroy();
            super.destroy();
        }

        update_effect_name(cfg_string) {
            const filter = Filter.fromString(cfg_string);
            this.subtitle = get_label_for_filter(filter, this.gettext);
        }

        update_enabled(enable) {
            const icon = pick_icon(enable);
            this.icon_name = icon;
            this.menu.setHeader(icon, this.title);
        }
    });

class FilterConfigMenu {
    constructor(_, settings, menu, with_toggle, with_slider) {
        this.gettext = _;
        this.settings = settings;

        // Whatever settings were most recently configured, either by menu or by
        // external process. No-longer-valid settings are kept in case they
        // become relevant again in the future.
        this.filter_config = {
            mode: null,
            color_blindness_type: null,
            cb_alg: null,
            eff_alg: null,
            tritan_hack: null,
        };

        if (with_toggle) {
            const enable_switch = new PopupMenu.PopupSwitchMenuItem(_('Enable Filter'), false);
            settings.bind('filter-active', enable_switch, 'state', 0);
            menu.addMenuItem(enable_switch);
        }

        if (with_slider) {
            const menu_item = new PopupMenu.PopupBaseMenuItem();
            const strength_slider = new Slider(0);
            settings.bind('filter-strength', strength_slider, 'value', 0);

            menu_item.add_child(new St.Label({ text: _('Filter Strength') }));
            menu_item.add_child(strength_slider);
            menu.addMenuItem(menu_item);
        }

        const get_variants = (group) => {
            const ret = [];
            for (const v in group) {
                ret.push(group[v]);
            }
            return ret;
        }
        const make_submenu = (title, property, contents) => {
            const submenu = new PopupMenu.PopupSubMenuMenuItem(title, false);
            const items = {};

            contents.forEach((c) => {
                items[c.cfgString] = submenu.menu.addAction(c.name(_), () => {
                    this.update_config(property, c);
                });
            });

            menu.addMenuItem(submenu);

            return { menu: submenu, items };
        };

        this.submenus = {
            modes: make_submenu(_('Filter Modes'), 'mode', get_variants(FilterMode)),
            cb_type: make_submenu(_('Color Blindness Types'), 'color_blindness_type',
                get_variants(ColorBlindnessType)),
            cb_alg: make_submenu(_('Filter Algorithms'), 'cb_alg',
                get_variants(ColorBlindnessAlgorithm)),
            eff_type: make_submenu(_('Other Effects'), 'eff_alg',
                get_variants(EffectAlgorithm)),
        };

        this.tritan_hack_switch = new PopupMenu.PopupSwitchMenuItem(_('Use Alternate Transform'), false);
        this.tritan_hack_switch.connect('notify::state', (s) => {
            this.update_config('tritan_hack', s.state
                ? TritanHackEnable.ENABLE
                : TritanHackEnable.DISABLE);
        });
        menu.addMenuItem(this.tritan_hack_switch);

        this.update_filter(new Filter());

        connect_setting_eager(settings, 'string', 'filter-name', (cfg_string) => {
            let filter = Filter.fromString(cfg_string);
            if (filter !== null) {
                this.update_filter(filter);
            }
        });
    }

    destroy() {
        this.settings = null;
        this.submenus = {};
        this.tritan_hack_switch = null;
    }

    update_config(field, value) {
        this.filter_config[field] = value;
        this.update_menus();
        this.emit_config();
    }

    update_filter(filter) {
        const fc = this.filter_config;
        fc.mode = filter.mode;
        fc[filter.mode.isColorBlindness ? 'cb_alg' : 'eff_al'] = filter.algorithm;
        if (filter.color_blindness_type) {
            fc.color_blindness_type = filter.color_blindness_type;
        }
        if (filter.tritan_hack) {
            fc.tritan_hack = filter.tritan_hack;
        }

        this.update_menus();
    }

    current_filter() {
        const fc = this.filter_config;
        return new Filter(
            fc.mode,
            fc.mode.isColorBlindness ? fc.cb_alg : fc.eff_alg,
            fc.color_blindness_type,
            fc.tritan_hack);
    }

    emit_config() {
        this.settings.set_string('filter-name', this.current_filter().toString());
    }

    update_menus() {
        const s = this.submenus;
        const validated = this.current_filter();

        const set_checked = (menu, selected) => {
            Object.entries(menu.items).forEach(
                ([name, item]) => item.setOrnament(name == selected.cfgString
                    ? PopupMenu.Ornament.CHECK
                    : PopupMenu.Ornament.NONE));
        };

        set_checked(s.modes, validated.mode);

        if (!validated.mode.isColorBlindness) {
            s.cb_type.menu.visible = false;
            s.cb_alg.menu.visible = false;
            s.eff_type.menu.visible = true;
            this.tritan_hack_switch.visible = false;
            set_checked(s.eff_type, validated.algorithm);
            return;
        }

        s.cb_type.menu.visible = true;
        s.cb_alg.menu.visible = true;
        s.eff_type.menu.visible = false;

        const allowed_algorithms = new Set(get_algorithms(validated.mode).map((a) => a.cfgString));
        Object.entries(this.submenus.cb_alg.items).forEach(
            ([name, item]) => item.visible = allowed_algorithms.has(name));

        set_checked(s.cb_type, validated.color_blindness_type);
        set_checked(s.cb_alg, validated.algorithm);

        if (tritan_hack_allowed(validated.algorithm, validated.color_blindness_type)) {
            this.tritan_hack_switch.visible = true;
            this.tritan_hack_switch.state = validated.tritan_hack === TritanHackEnable.ENABLE;
        } else {
            this.tritan_hack_switch.visible = false;
        }
    }
}
