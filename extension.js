/**
 * ColorBlind Filters
 * extension.js
 *
 * @author     A. Pennucci <apennucci@protonmail.com>
 * @copyright  2025
 * @license    GPL-3.0
 */
'use strict';

// FIXME: I'd really prefer that the menu not collapse after every action (yes,
// reviewer, I'm well aware that this is complicated enough to have a dedicated
// preferences dialog, to which I say: meh.)

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import GObject from 'gi://GObject';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js';
import { Slider } from 'resource:///org/gnome/shell/ui/slider.js';

import {
    Filter, FilterMode, EffectAlgorithm, ColorBlindnessType,
    ColorBlindnessAlgorithm, TritanHackEnable,
    get_algorithms, tritan_hack_allowed,
} from './filter.js';

export default class ColorblindFilters extends Extension {
    enable() {
        const _ = this.gettext.bind(this);
        const settings = this.getSettings();

        this.destroyer = new DestroyAllTheThings();
        this.destroyer.construct(FilterManager, this.metadata.name, settings);
        const indicator = this.destroyer.construct(FilterIndicator, settings);
        indicator.attach(new FilterQuickSettingsMenu(_, settings));
        indicator.register();
    }

    disable() {
        this.destroyer.destroy();
        this.destroyer = null;
    }
}

class FilterManager {
    constructor(effect_name, settings) {
        this.effect_name = effect_name;
        this.settings = settings;
        this.destroyer = new DestroyAllTheThings();
        const settings_proxy = this.destroyer.settings_proxy(settings);

        this.effect_cache = new Map();

        this.filter = null;
        this.configured_filter = null;

        settings_proxy.connect('filter-active', 'boolean', () => this.update_filter());
        settings_proxy.connect('filter-strength', 'double', () => this.update_filter());
        settings_proxy.connect_eager('filter-name', 'string', cfg_string => {
            this.configured_filter = Filter.fromString(cfg_string);
            this.update_filter();
        });
    }

    destroy() {
        this.settings = null;
        this.destroyer.destroy();

        if (this.filter !== null) {
            Main.uiGroup.remove_effect_by_name(this.effect_name);
        }
    }

    update_filter() {
        const configured = this.settings.get_boolean('filter-active')
            ? this.configured_filter : null;

        const enabled = configured !== null;
        const changed_effect = this.filter?.effect !== configured?.effect;

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

            this.destroyer = new DestroyAllTheThings();

            this.indicator = this._addIndicator();

            this.destroyer.settings_proxy(settings).connect_eager(
                'filter-active',
                'boolean',
                active => { this.indicator.icon_name = pick_icon(active); });

            this.indicator.visible = true;
        }

        destroy() {
            this.quickSettingsItems.forEach(i => i.destroy());
            this.quickSettingsItems = [];
            this.destroyer.destroy();
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
    if (filter) {
        return filter.mode.isColorBlindness
            ? filter.color_blindness_type.name(_)
            : filter.algorithm.name(_);
    } else {
        return '';
    }
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

            this.title = _('Colorblind Filters');

            this.destroyer = new DestroyAllTheThings();
            const settings_proxy = this.destroyer.settings_proxy(settings);

            settings_proxy.connect_eager('filter-active', 'boolean', active => {
                const icon = pick_icon(active);
                this.icon_name = icon;
                this.menu.setHeader(icon, this.title);
            });
            settings_proxy.connect_eager('filter-name', 'string', cfg_string => {
                const filter = Filter.fromString(cfg_string);
                this.subtitle = get_label_for_filter(filter, this.gettext);
            });

            settings.bind('filter-active', this, 'checked', 0);

            this.config_menu = new FilterConfigMenu(_, settings, this.menu, false, true);
        }

        destroy() {
            this.config_menu?.destroy();
            this.destroyer.destroy();
            super.destroy();
        }
    });

class FilterConfigMenu {
    constructor(_, settings, menu, with_toggle, with_slider) {
        this.gettext = _;
        this.settings = settings;

        this.thing_destroyer_9000 = new DestroyAllTheThings();
        const destroyer = this.thing_destroyer_9000;
        const construct = destroyer.construct.bind(destroyer);

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
            const enable_switch = construct(PopupMenu.PopupSwitchMenuItem, _('Enable Filter'), false);
            settings.bind('filter-active', enable_switch, 'state', 0);
            menu.addMenuItem(enable_switch);
        }

        if (with_slider) {
            const menu_item = construct(PopupMenu.PopupBaseMenuItem);
            const strength_slider = construct(Slider, 0);
            settings.bind('filter-strength', strength_slider, 'value', 0);

            menu_item.add_child(construct(St.Label, { text: _('Filter Strength') }));
            menu_item.add_child(strength_slider);
            menu.addMenuItem(menu_item);

            this.strength_slider = menu_item;
        }

        const get_variants = group => {
            const ret = [];
            for (const v in group) {
                ret.push(group[v]);
            }
            return ret;
        };
        const make_submenu = (title, property, contents) => {
            const submenu = construct(PopupMenu.PopupSubMenuMenuItem, title, false);
            const items = {};

            contents.forEach(c => {
                items[c.cfgString] = destroyer.add(submenu.menu.addAction(c.name(_),
                    () => this.update_config(property, c)));
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

        this.tritan_hack_switch =
            construct(PopupMenu.PopupSwitchMenuItem, _('Use Alternate Transform'), false);
        destroyer.connect(this.tritan_hack_switch, 'notify::state', s => {
            this.update_config('tritan_hack', s.state
                ? TritanHackEnable.ENABLE
                : TritanHackEnable.DISABLE);
        });
        menu.addMenuItem(this.tritan_hack_switch);

        this.update_filter(new Filter());

        destroyer.settings_proxy(settings).connect_eager('filter-name', 'string',
            cfg_string => {
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
        this.strength_slider = null;
        this.thing_destroyer_9000.destroy();
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
                ([name, item]) => item.setOrnament(name === selected.cfgString
                    ? PopupMenu.Ornament.CHECK
                    : PopupMenu.Ornament.NONE));
        };

        if (this.strength_slider) {
            this.strength_slider.visible = validated.algorithm.usesFactor;
        }

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

        const allowed_algorithms = new Set(get_algorithms(validated.mode).map(a => a.cfgString));
        Object.entries(this.submenus.cb_alg.items).forEach(([name, item]) => {
            item.visible = allowed_algorithms.has(name);
        });

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

// Manual memory management in GC languages isn't normal. But on projects with
// names that start with "G", it is. Projects with names that start with "G":
// not even once.

// A big bucket to dunp things that need destroy() into. Giving things names and
// cleaning them up explicitly is for suckers.
class DestroyAllTheThings {
    constructor() {
        this.objects = [];
    }

    destroy() {
        this.objects.reverse();
        for (const obj of this.objects) {
            obj.destroy();
        }
        this.objects = [];
    }

    construct(cls, ...args) {
        return this.add(new cls(...args));
    }

    add(obj) {
        if (obj?.destroy) {
            this.objects.push(obj);
        }
        return obj;
    }

    connect(instance, signal, callback) {
        const handler_id = instance.connect(signal, callback);
        this.add(new Disconnecter(instance, handler_id));
        return handler_id;
    }

    settings_proxy(settings) {
        return new SettingsProxy(this, settings);
    }
}

// Connect to settings change events and disconnect automatically.
class SettingsProxy {
    constructor(destroyer, settings) {
        this.destroyer = destroyer;
        this.settings = settings;
    }

    _connect_impl(name, type_name, callback, eager) {
        const getter = this.settings[`get_${type_name}`];

        const handler_id = this.destroyer.connect(this.settings,
            `changed::${name}`,
            (s, k) => callback(getter.call(s, k)));

        const value = getter.call(this.settings, name);
        if (eager) {
            callback(value);
        }

        return handler_id;
    }

    connect_eager(name, type_name, callback) {
        return this._connect_impl(name, type_name, callback, true);
    }

    connect(name, type_name, callback) {
        return this._connect_impl(name, type_name, callback, false);
    }
}

// Disconnect automatically from connected signals
class Disconnecter {
    constructor(instance, handler_id) {
        this.instance = instance;
        this.handler_id = handler_id;
    }

    destroy() {
        this.instance.disconnect(this.handler_id);
    }
}
