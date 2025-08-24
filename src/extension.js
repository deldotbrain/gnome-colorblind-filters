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
// reviewer, I'm well aware that the settings UI is complicated enough to have a
// dedicated dialog, to which I say: meh.)
//
// TODO: open a bug with GNOME (if it's not already reported): enabling a screen
// filter (this extension, upstream, or e.g. the built-in wellbeing grayscale
// effect) and the screen magnifier, then opening the screen recorder app
// crashes gnome-shell.

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js';
import { Slider } from 'resource:///org/gnome/shell/ui/slider.js';

import {
    Filter, FilterMode, EffectAlgorithm, ColorBlindnessType,
    ColorBlindnessAlgorithm, TritanHackEnable, HighContrastEnable,
    get_algorithms, tritan_hack_allowed, high_contrast_allowed,
} from './filter.js';

/**
 * Set up and tear down the extension's actual functionality
 */
export default class ColorblindFilters extends Extension {
    enable() {
        const _ = this.gettext.bind(this);
        const settings = this.getSettings();

        // For dev builds, use the hacked extension name as a title
        const title = this.metadata.name === 'Colorblind Filters Advanced'
            ? _('Colorblind Filters')
            : this.metadata.name;

        this.destroyer = new DestroyAllTheThings();
        this.destroyer.construct(FilterManager, settings);
        const indicator = this.destroyer.construct(FilterIndicator, settings);
        indicator.attach(new FilterQuickSettingsMenu(_, title, settings));
        indicator.register();
    }

    disable() {
        this.destroyer.destroy();
    }
}

/**
 * Listen for changes in preferences and configure shaders appropriately
 */
class FilterManager {
    constructor(settings) {
        this.settings = settings;
        this.destroyer = new DestroyAllTheThings();
        const settings_proxy = this.destroyer.settings_proxy(settings);

        // all the shaders that we've applied since enabling
        this.effect_cache = new Map();
        // the user's filter configuration
        this.configured_filter = null;
        // the currently-applied effect, or null
        this.current_effect = null;
        // clone uiGroup when needed to avoid graphical glitches
        this.clipping_workaround = this.destroyer.construct(ClippingWorkaround);

        settings_proxy.connect('filter-active', 'boolean', () => this.update_filter());
        settings_proxy.connect('filter-strength', 'double', () => this.update_filter());
        settings_proxy.connect_eager('filter-name', 'string', cfg_string => {
            this.configured_filter = Filter.fromString(cfg_string);
            this.update_filter();
        });
    }

    destroy() {
        if (this.current_effect) {
            Main.uiGroup.remove_effect(this.current_effect);
            this.current_effect = null;
        }
        this.settings = null;
        this.destroyer.destroy();
    }

    update_filter() {
        const configured = this.settings.get_boolean('filter-active')
            ? this.configured_filter : null;

        const effect = configured ? this.get_effect(configured) : null;
        if (effect) {
            configured.factor = this.settings.get_double('filter-strength');
            effect.updateEffect(configured.properties);
        }

        if (this.current_effect !== effect) {
            this.clipping_workaround.set_enabled(effect !== null);

            if (this.current_effect) {
                Main.uiGroup.remove_effect(this.current_effect);
            }
            this.current_effect = effect;
            if (effect) {
                Main.uiGroup.add_effect(effect);
            }
        }
    }

    get_effect(filter) {
        const effect_type = filter.effect_class;

        // Avoid a warning from GNOME Shell about creating an excessive
        // number of shaders by caching them.
        const cached = this.effect_cache.get(filter.effect_class);
        if (cached !== undefined) {
            return cached;
        } else {
            const effect = new effect_type();
            this.effect_cache.set(effect_type, effect);
            return effect;
        }
    }
}

/**
 * Creates and displays a Clone of uiGroup
 *
 * An unfortunate optimization in Clutter makes screen recording and
 * multi-monitor very glitchy when effects are applied directly to uiGroup.
 * Displaying a clone of uiGroup disables that optimization.
 *
 * This class creates that clone and displays it whenever it's needed, i.e. when
 * an effect is enabled but the GNOME screen magnifier is not. The magnifier
 * makes its own clone.
 */
class ClippingWorkaround {
    constructor() {
        this.enabled = false;

        // clone of uiGroup for cases when another clone (i.e. the screen
        // magnifier) isn't already being displayed
        this.ui_clone = new Clutter.Clone({
            source: Main.uiGroup,
            clip_to_allocation: true,
        });

        // Tracks both the magnifier's actor and the connection to its 'destroy'
        // signal.
        this.magnifier = null;

        // The screen magnifier gets its content directly from uiGroup, not our
        // filtered clone, and displays on top of uiGroup. To filter its
        // content, we need to intentionally attach to it.
        const global_stage = Shell.Global.get().stage;
        this.stage_add_conn = global_stage.connect(
            'child-added', (_stage, actor) => { this._on_stage_attach(actor); });
        global_stage.get_children().forEach(child => this._on_stage_attach(child));
    }

    destroy() {
        Shell.Global.get().stage.disconnect(this.stage_add_conn);
        if (this.magnifier) {
            const m = this.magnifier;
            m.actor.disconnect(m.destroy_conn);
        }
        this._update(false, null);
        this.ui_clone.destroy();
    }

    set_enabled(enabled) {
        this._update(enabled, this.magnifier);
    }

    _update(enabled, magnifier) {
        if (enabled === this.enabled && magnifier === this.magnifier) {
            return;
        }

        const clone_shown = this.enabled && this.magnifier === null;
        const show_clone = enabled && magnifier === null;

        if (show_clone && !clone_shown) {
            Shell.Global.get().stage.add_child(this.ui_clone);
        } else if (!show_clone && clone_shown) {
            Shell.Global.get().stage.remove_child(this.ui_clone);
        }

        this.enabled = enabled;
        this.magnifier = magnifier;
    }

    _on_stage_attach(actor) {
        if (!actor.style_class?.split(' ').some(s => s === 'magnifier-zoom-region')) {
            return;
        }

        const destroy_conn = actor.connect('destroy', () => {
            this._update(this.enabled, null);
        });
        this._update(this.enabled, { actor, destroy_conn });
    }
}

function pick_icon(enabled) {
    return `view-${enabled ? 'reveal' : 'conceal'}-symbolic`;
}

/**
 * Indicator icon in the Quick Settings area of the panel
 *
 * This is required to register anything into the Quick Settings menu, so it may
 * as well show an icon.
 */
class FilterIndicator extends QuickSettings.SystemIndicator {
    static {
        GObject.registerClass(this);
    }

    _init(settings) {
        super._init();

        this.destroyer = new DestroyAllTheThings();

        this.indicator = this._addIndicator();
        this.indicator.icon_name = pick_icon(true);

        this.destroyer.settings_proxy(settings).connect_eager(
            'filter-active',
            'boolean',
            active => { this.indicator.visible = active; });
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
}

function get_label_for_filter(filter, _) {
    if (filter) {
        return filter.mode.isColorBlindness
            ? filter.color_blindness_type.name(_)
            : filter.algorithm.name(_);
    } else {
        return '';
    }
}

/**
 * The actual Quick Settings toggle/menu button
 */
class FilterQuickSettingsMenu extends QuickSettings.QuickMenuToggle {
    static {
        GObject.registerClass(this);
    }

    _init(_, title, settings) {
        super._init({
            toggleMode: true,
        });

        this.title = title;

        this.destroyer = new DestroyAllTheThings();
        const settings_proxy = this.destroyer.settings_proxy(settings);

        settings_proxy.connect_eager('filter-active', 'boolean', active => {
            const icon = pick_icon(active);
            this.icon_name = icon;
            this.menu.setHeader(icon, this.title);
        });
        settings_proxy.connect_eager('filter-name', 'string', cfg_string => {
            const filter = Filter.fromString(cfg_string);
            this.subtitle = get_label_for_filter(filter, _);
        });

        settings.bind('filter-active', this, 'checked', 0);

        this.destroyer.construct(FilterConfigMenu, _, settings, this.menu, false, true);
    }

    destroy() {
        this.destroyer.destroy();
        super.destroy();
    }
}

/**
 * The menu inside the menu button
 *
 * I keep wanting to provide other entry points into the menu: panel button,
 * quick settings slider, etc. And then I actually try to write and/or use them,
 * and I don't want that anymore. Still, keeping the menu logic separate isn't
 * the worst decision I've ever made.
 */
class FilterConfigMenu {
    constructor(_, settings, menu, with_toggle, with_slider) {
        this.gettext = _;
        this.settings = settings;

        this.destroyer = new DestroyAllTheThings();
        const destroyer = this.destroyer;
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
            high_contrast: null,
        };

        if (with_toggle) {
            const enable_switch = construct(PopupMenu.PopupSwitchMenuItem, _('Enable Filter'), false);
            settings.bind('filter-active', enable_switch, 'state', 0);
            menu.addMenuItem(enable_switch);
        }

        if (with_slider) {
            const menu_item = construct(PopupMenu.PopupBaseMenuItem);
            // Warning: destroying this object has a small chance of causing
            // GNOME Shell to crash if the extension is disabled after the
            // screen magnifier has been enabled. Just leak it. I'm not sorry.
            // https://gitlab.gnome.org/GNOME/gnome-shell/-/issues/8548
            const strength_slider = new Slider(0);
            strength_slider.accessible_name = _('Filter Strength');
            settings.bind('filter-strength', strength_slider, 'value', 0);

            menu_item.add_child(construct(St.Label, { text: _('Filter Strength') }));
            menu_item.add_child(strength_slider);
            // Warning: not removing this child ALSO has a small chance of
            // crashing under the same circumstances.
            this.destroyer.add_fn(() => {
                menu_item.remove_child(strength_slider);
            });
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

        this.high_contrast_switch =
            construct(PopupMenu.PopupSwitchMenuItem, _('High Contrast Mode'), false);
        destroyer.connect(this.high_contrast_switch, 'notify::state', s => {
            this.update_config('high_contrast', s.state
                ? HighContrastEnable.ENABLE
                : HighContrastEnable.DISABLE);
        });
        menu.addMenuItem(this.high_contrast_switch);

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
        this.high_contrast_switch = null;
        this.strength_slider = null;
        this.destroyer.destroy();
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
        if (filter.high_contrast) {
            fc.high_contrast = filter.high_contrast;
        }

        this.update_menus();
    }

    current_filter() {
        const fc = this.filter_config;
        return new Filter(
            fc.mode,
            fc.mode.isColorBlindness ? fc.cb_alg : fc.eff_alg,
            fc.color_blindness_type,
            fc.tritan_hack,
            fc.high_contrast);
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
            this.high_contrast_switch.visible = false;
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

        if (tritan_hack_allowed(validated.mode, validated.algorithm, validated.color_blindness_type)) {
            this.tritan_hack_switch.visible = true;
            this.tritan_hack_switch.state = validated.tritan_hack === TritanHackEnable.ENABLE;
        } else {
            this.tritan_hack_switch.visible = false;
        }

        if (high_contrast_allowed(validated.mode, validated.algorithm, validated.color_blindness_type)) {
            this.high_contrast_switch.visible = true;
            this.high_contrast_switch.state = validated.high_contrast === HighContrastEnable.ENABLE;
        } else {
            this.high_contrast_switch.visible = false;
        }
    }
}

// Manual memory management in GC languages isn't normal. But on projects with
// names that start with "G", it is. Projects with names that start with "G":
// not even once.

/**
 * Explicitly track resources that need to be cleaned up synchronously
 *
 * Basically, a big bucket to dump things that need destroy() into. Giving
 * things names and cleaning them up explicitly is boring.
 */
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

    add_fn(fn) {
        this.objects.push({ destroy: fn });
    }

    connect(instance, signal, callback) {
        const handler_id = instance.connect(signal, callback);
        this.add_fn(() => {
            instance.disconnect(handler_id);
        });
        return handler_id;
    }

    settings_proxy(settings) {
        return new SettingsProxy(this, settings);
    }
}

/**
 * Helper to connect to settings easily and disconnect automatically
 */
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
