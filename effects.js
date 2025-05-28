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
            effect: Shaders.ColorMixerEffect,
            sliderEnabled: true,
        },
        {
            description: 'Channel Mixer - BRG',
            name: 'ColorMixerBRG',
            shortName: 'BRG',
            properties: {
                mode: 1,
                factor: 1,
            },
            effect: Shaders.ColorMixerEffect,
            sliderEnabled: true,
        },
        {
            description: 'Desaturation',
            name: 'Desaturation',
            shortName: 'D',
            properties: {
                factor: 1,
            },
            effect: Shaders.DesaturateEffect,
            sliderEnabled: true,
        },
        {
            description: 'Lightness Inversion',
            name: 'LightnessInversion',
            shortName: 'LI',
            properties: {
                mode: 0,
            },
            effect: Shaders.InversionEffect,
            sliderEnabled: false,
        },
        {
            description: 'Color Inversion',
            name: 'ColorInversion',
            shortName: 'CI',
            properties: {
                mode: 2,
            },
            effect: Shaders.InversionEffect,
            sliderEnabled: false,
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
            whichCone: t.whichCone,
            transform: x.name,
            isCorrection: mode.name === 'Correction',
            factor: 1,
        },
        effect: Shaders.DaltonismEffect,
        // FIXME: either check sliderEnabled or presence of properties.factor, not both
        sliderEnabled: true,
    })));
}

let allEffects = null

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
    for (const [_, effects] of getEffectGroups()) {
        for (const e of effects) {
            if (e.name == name) {
                return e;
            }
        }
    }
}
