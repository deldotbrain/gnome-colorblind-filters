/**
 * ColorBlind Filters
 * effects.js
 *
 * @author     A. Pennucci <apennucci@protonmail.com>
 * @copyright  2025
 * @license    GPL-3.0
 */

import * as Shaders from './shaders.js';
import * as Opponent from './opponent.js';

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

    const isCorrection = mode.name === 'Correction'
    if (isCorrection) {
        transforms.unshift({
            name: 'ES',
            transform: 'HPE',
            short: 'E',
            errorSteering: true,
        });
    }

    const opponentCorrections = [
        {
            description: "Protanomaly Correction (OCS)",
            name: "ProtOC",
            shortName: "POC",
            properties: {
                whichCone: 0,
                factor: 1
            },
            shader: Opponent.OpponentCorrectionEffect,
        },
        {
            description: "Deuteranomaly Correction (OCS)",
            name: "DeuterOC",
            shortName: "DOC",
            properties: {
                whichCone: 1,
                factor: 1
            },
            shader: Opponent.OpponentCorrectionEffect,
        },
        {
            description: "Tritanomaly Correction (OCS)",
            name: "TritOC",
            shortName: "TOC",
            properties: {
                whichCone: 2,
                factor: 1
            },
            shader: Opponent.OpponentCorrectionEffect,
        },
    ];

    const opponentSimulations = [
        {
            description: "Protanomaly Simulation (OCS)",
            name: "SimProtOC",
            shortName: "SPOC",
            properties: {
                whichCone: 0,
                factor: 1
            },
            shader: Opponent.OpponentSimulationEffect,
        },
        {
            description: "Deuteranomaly Simulation (OCS)",
            name: "SimDeuterOC",
            shortName: "SDOC",
            properties: {
                whichCone: 1,
                factor: 1
            },
            shader: Opponent.OpponentSimulationEffect,
        },
        {
            description: "Tritanomaly Simulation (OCS)",
            name: "SimTritOC",
            shortName: "STOC",
            properties: {
                whichCone: 2,
                factor: 1
            },
            shader: Opponent.OpponentSimulationEffect,
        },
    ];

    return (isCorrection ? opponentCorrections : opponentSimulations).concat(
        transforms.flatMap((x) => types.map((t) => ({
            description: `${t.longName} ${mode.name} (${x.name})`,
            name: `${t.name}${mode.name}${x.name}`,
            shortName: `${t.short}${mode.short}${x.short}`,
            properties: {
                tritanHack: t.tritanHack || false,
                errorSteering: x.errorSteering || false,
                whichCone: t.whichCone,
                transform: x.transform || x.name,
                isCorrection,
                factor: 1,
            },
            shader: Shaders.DaltonismEffect,
        }))));
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
