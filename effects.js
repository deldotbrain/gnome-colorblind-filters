/**
 * ColorBlind Filters
 * effects.js
 *
 * @author     A. Pennucci <apennucci@protonmail.com>
 * @copyright  2025
 * @license    GPL-3.0
 */

import * as Shaders from './shaders.js';

function getOtherEffects() {
    return [
        {
            description: 'Channel Mixer - GBR',
            name: 'ColorMixerGBR',
            shortName: 'GBR',
            properties: {
                mode: 0,
                factor: 1,
            },
            shader: Shaders.ColorMixerEffect,
        },
        {
            description: 'Channel Mixer - BRG',
            name: 'ColorMixerBRG',
            shortName: 'BRG',
            properties: {
                mode: 1,
                factor: 1,
            },
            shader: Shaders.ColorMixerEffect,
        },
        {
            description: 'Desaturation',
            name: 'Desaturation',
            shortName: 'D',
            properties: {
                factor: 1,
            },
            shader: Shaders.DesaturateEffect,
        },
        {
            description: 'Lightness Inversion',
            name: 'LightnessInversion',
            shortName: 'LI',
            properties: {
                mode: 0,
            },
            shader: Shaders.InversionEffect,
        },
        {
            description: 'Color Inversion',
            name: 'ColorInversion',
            shortName: 'CI',
            properties: {
                mode: 2,
            },
            shader: Shaders.InversionEffect,
        },
    ];
}

function getColorblindEffects(mode) {
    const types = [
        {
            longName: 'Protanopia',
            name: 'Protan',
            short: 'P',
            whichCone: 0,
        },
        {
            longName: 'Deuteranopia',
            name: 'Deuter',
            short: 'D',
            whichCone: 1,
        },
        {
            longName: 'Tritanopia',
            name: 'Tritan',
            short: 'T',
            whichCone: 2,
        },
        {
            longName: 'Modified Tritanopia',
            name: 'ModTritan',
            short: 'MT',
            whichCone: 2,
            tritanHack: true,
        }
    ];
    const transforms = [
        {
            name: 'HPE',
            short: 'H',
        },
        {
            name: 'AOSP',
            short: 'A',
        },
    ];

    return transforms.flatMap((x) => types.map((t) => ({
        description: `${t.longName} ${mode.name} (${x.name})`,
        name: `${t.name}${mode.name}${x.name}`,
        shortName: `${t.short}${mode.short}${x.short}`,
        properties: {
            tritanHack: t.tritanHack || false,
            whichCone: t.whichCone,
            transform: x.name,
            isCorrection: mode.name === 'Correction',
            factor: 1,
        },
        shader: Shaders.DaltonismEffect,
    })));
}

let allEffects = null;

export function getEffectGroups() {
    if (allEffects === null) {
        allEffects = {
            corrections: getColorblindEffects({
                name: 'Correction',
                short: 'C',
            }),
            simulations: getColorblindEffects({
                name: 'Simulation',
                short: 'S',
            }),
            others: getOtherEffects(),
        };
    }

    return allEffects;
}

export function getEffectByName(name) {
    for (const [_, effects] of Object.entries(getEffectGroups())) {
        for (const e of effects) {
            if (e.name == name) {
                return e;
            }
        }
    }
}

const shader_cache = new Map();

export function makeShader(effect) {
    const shaderClass = effect.shader;

    const cached = shader_cache.get(shaderClass);
    if (cached) {
        cached.updateEffect(effect.properties);
        return cached;
    } else {
        const shader = new shaderClass(effect.properties);
        shader_cache.set(shaderClass, shader);
        return shader;
    }
}
