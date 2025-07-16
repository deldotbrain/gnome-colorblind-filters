/**
 * ColorBlind Filters
 * filter.js
 *
 * @author     A. Pennucci <apennucci@protonmail.com>
 * @copyright  2025
 * @license    GPL-3.0
 */

import * as Shaders from './shaders.js';
import * as Opponent from './opponent.js';

export const FilterMode = {
    CORRECTION: {
        name: _ => _('Color Blindness Correction'),
        cfgString: 'correction',
        isColorBlindness: true,
        properties: { isCorrection: true },
    },
    SIMULATION: {
        name: _ => _('Color Blindness Simulation'),
        cfgString: 'simulation',
        isColorBlindness: true,
        properties: { isCorrection: false },
    },
    EFFECT: {
        name: _ => _('Other Effects'),
        cfgString: 'effect',
        isColorBlindness: false,
        properties: {},
    },
};

export const EffectAlgorithm = {
    MIX_GBR: {
        name: _ => _('Channel Mixer - GBR'),
        cfgString: 'mixgbr',
        effect: Shaders.ColorMixerEffect,
        properties: { mode: 0 },
        usesFactor: true,
    },
    MIX_BRG: {
        name: _ => _('Channel Mixer - BRG'),
        cfgString: 'mixbrg',
        effect: Shaders.ColorMixerEffect,
        properties: { mode: 1 },
        usesFactor: true,
    },
    DESATURATE: {
        name: _ => _('Desaturation'),
        cfgString: 'desaturate',
        effect: Shaders.DesaturateEffect,
        properties: {},
        usesFactor: true,
    },
    LIGHT_INVERT: {
        name: _ => _('Lightness Inversion'),
        cfgString: 'lightinvert',
        effect: Shaders.InversionEffect,
        properties: { mode: 0 },
        usesFactor: false,
    },
    COLOR_INVERT: {
        name: _ => _('Color Inversion'),
        cfgString: 'colorinvert',
        effect: Shaders.InversionEffect,
        properties: { mode: 2 },
        usesFactor: false,
    },
};

export const ColorBlindnessType = {
    PROTAN: {
        name: _ => _('Protanopia'),
        cfgString: 'protanopia',
        properties: { whichCone: 0 },
    },
    DEUTAN: {
        name: _ => _('Deuteranopia'),
        cfgString: 'deuteranopia',
        properties: { whichCone: 1 },
    },
    TRITAN: {
        name: _ => _('Tritanopia'),
        cfgString: 'tritanopia',
        properties: { whichCone: 2 },
    },
};

export const ColorBlindnessAlgorithm = {
    OCS: {
        name: _ => _('Opponent Color Solver'),
        cfgString: 'ocs',
        correctionEffect: Opponent.OpponentCorrectionEffect,
        simulationEffect: Opponent.OpponentSimulationEffect,
        properties: {},
        usesFactor: true,
        usesTritanHack: false,
    },
    ES: {
        name: _ => _('Error Steering'),
        cfgString: 'es',
        correctionEffect: Shaders.DaltonismEffect,
        simulationEffect: null,
        properties: {
            transform: 'HPE',
            errorSteering: true,
        },
        usesFactor: true,
        usesTritanHack: true,
    },
    HPE: {
        name: _ => _('Daltonize'),
        cfgString: 'hpe',
        correctionEffect: Shaders.DaltonismEffect,
        simulationEffect: Shaders.DaltonismEffect,
        properties: {
            transform: 'HPE',
            errorSteering: false,
        },
        usesFactor: true,
        usesTritanHack: true,
    },
    AOSP: {
        name: _ => _('Android'),
        cfgString: 'aosp',
        correctionEffect: Shaders.DaltonismEffect,
        simulationEffect: Shaders.DaltonismEffect,
        properties: {
            transform: 'AOSP',
            errorSteering: false,
        },
        usesFactor: true,
        usesTritanHack: true,
    },
};

export const TritanHackEnable = {
    ENABLE: {
        name: _ => _('Modified Transform'),
        cfgString: 'typical',
        properties: { tritanHack: true },
    },
    DISABLE: {
        name: _ => _('Typical Transform'),
        cfgString: 'modified',
        properties: { tritanHack: false },
    },
};

export function tritan_hack_allowed(algorithm, color_blindness_type) {
    return algorithm.usesTritanHack && color_blindness_type === ColorBlindnessType.TRITAN;
}

function getProperties(kind) {
    // Returns properties with string keys in creation order.
    return Object.getOwnPropertyNames(kind).map(n => kind[n]);
}

export function get_algorithms(mode) {
    if (mode === FilterMode.CORRECTION || mode === FilterMode.SIMULATION) {
        let cb_algs = getProperties(ColorBlindnessAlgorithm);
        if (mode === FilterMode.SIMULATION) {
            cb_algs = cb_algs.filter(a => a.simulationEffect !== null);
        }
        return cb_algs;
    } else if (mode === FilterMode.EFFECT) {
        return getProperties(EffectAlgorithm);
    } else {
        return null;
    }
}

export function get_color_blindness_types(mode, _algorithm) {
    if (mode === FilterMode.SIMULATION || mode === FilterMode.CORRECTION) {
        return getProperties(ColorBlindnessType);
    } else {
        return null;
    }
}

export function get_tritan_hack_opts(mode, algorithm, color_blindness_type) {
    if ((mode === FilterMode.CORRECTION || mode === FilterMode.SIMULATION) &&
        algorithm !== null && color_blindness_type !== null &&
        tritan_hack_allowed(algorithm, color_blindness_type)) {
        return getProperties(TritanHackEnable);
    } else {
        return null;
    }
}

function lookupString(choices, str) {
    if (choices !== null) {
        for (const c of choices) {
            if (c.cfgString === str) {
                return c;
            }
        }
    }

    return null;
}

function findValid(choices, requested, current, fallback = null) {
    if (choices === null) {
        return null;
    }

    const find = v => choices.find(c => c === v) || null;
    return find(requested) || find(current) || find(fallback) || choices[0];
}

// Always describes a valid filter and can be used to authoritatively validate a
// filter configuration.
export class Filter {
    constructor(mode = null,
        algorithm = null,
        color_blindness_type = null,
        tritan_hack = null) {
        // A known-good default configuration to start from
        this._mode = FilterMode.CORRECTION;
        this._algorithm = ColorBlindnessAlgorithm.OCS;
        this._color_blindness_type = ColorBlindnessType.DEUTAN;
        this._tritan_hack = null;
        this._factor = 0.5;

        // Actually try to apply the requested configuration
        this.mode = mode;
        this.algorithm = algorithm;
        this.color_blindness_type = color_blindness_type;
        this.tritan_hack = tritan_hack;
    }

    static fromString(str) {
        const fields = str.split('-');

        const mode = lookupString(getProperties(FilterMode), fields.shift());
        if (mode === null) {
            return null;
        }

        const algorithm = lookupString(get_algorithms(mode), fields.shift());
        if (algorithm === null) {
            return null;
        }

        let color_blindness_type = null;
        let tritan_hack = null;
        if (mode.isColorBlindness) {
            color_blindness_type = lookupString(
                get_color_blindness_types(mode, algorithm),
                fields.shift());
            if (color_blindness_type === null) {
                return null;
            }

            if (tritan_hack_allowed(algorithm, color_blindness_type)) {
                tritan_hack = lookupString(
                    get_tritan_hack_opts(mode, algorithm, color_blindness_type),
                    fields.shift());
                if (tritan_hack === null) {
                    return null;
                }
            }
        }

        if (fields.length !== 0) {
            return null;
        }

        return new Filter(mode, algorithm, color_blindness_type, tritan_hack);
    }

    toString() {
        const fields = [];
        fields.push(this.mode.cfgString);
        fields.push(this.algorithm.cfgString);
        if (this.mode.isColorBlindness) {
            fields.push(this.color_blindness_type.cfgString);
            if (tritan_hack_allowed(this.algorithm, this.color_blindness_type)) {
                fields.push(this.tritan_hack.cfgString);
            }
        }

        return fields.join('-');
    }

    get effect() {
        if (this.mode === FilterMode.CORRECTION) {
            return this.algorithm.correctionEffect;
        } else if (this.mode === FilterMode.SIMULATION) {
            return this.algorithm.simulationEffect;
        } else {
            return this.algorithm.effect;
        }
    }

    get properties() {
        const properties = {};
        if (this.algorithm.usesFactor) {
            properties.factor = this.factor;
        }
        for (const field of [this.mode, this.algorithm, this.color_blindness_type, this.tritan_hack]) {
            if (field !== null) {
                Object.assign(properties, field.properties);
            }
        }
        return properties;
    }

    // Force dependent properties to be re-validated any time a property is changed

    get mode() { return this._mode; }
    set mode(new_mode) {
        this._mode = findValid(
            getProperties(FilterMode),
            new_mode,
            this._mode);
    }

    get algorithm() { return this._algorithm; }
    set algorithm(new_alg) {
        this._algorithm = findValid(
            get_algorithms(this.mode),
            new_alg,
            this._algorithm);
    }

    get color_blindness_type() { return this._color_blindness_type; }
    set color_blindness_type(new_type) {
        this._color_blindness_type = findValid(
            get_color_blindness_types(this.mode, this.algorithm),
            new_type,
            this._color_blindness_type,
            ColorBlindnessType.DEUTAN);
    }

    get tritan_hack() { return this._tritan_hack; }
    set tritan_hack(new_enable) {
        this._tritan_hack = findValid(
            get_tritan_hack_opts(this.mode, this.algorithm, this.color_blindness_type),
            new_enable,
            this._tritan_hack);
    }

    get factor() { return this._factor; }
    set factor(new_factor) {
        if (new_factor >= 0 && new_factor <= 1) {
            this._factor = new_factor;
        }
    }
}
