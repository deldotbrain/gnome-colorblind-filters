/**
 * ColorBlind Filters
 * matrix.js
 *
 * @author     A. Pennucci <apennucci@protonmail.com>
 * @copyright  2025
 * @license    GPL-3.0
 */

// There don't seem to be easy matrix methods within reach, so roll our own. I
// don't feel like writing the whole algorithm to find inverse matrices, so some
// things that AOSP calculated at runtime are now hardcoded.
//
// Convention: all matrices are 3x3 and are stored in a column-major array of 9
// elements; the value at row R, column C is mat[3*C+R]. All vectors are 1x3 or
// 3x1 and stored in an array of 3 elements.

'use strict';

export function gen3(fn) {
    const result = Array(3);
    for (let i = 0; i < 3; i++) {
        result[i] = fn(i);
    }
    return result;
}

export function gen3x3(fn) {
    const result = Array(9);
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
            result[c * 3 + r] = fn(r, c);
        }
    }
    return result;
}

function gen3x3ByIdx(fn) {
    const result = Array(9);
    for (let i = 0; i < 9; i++) {
        result[i] = fn(i);
    }
    return result;
}

export function transpose(mat) {
    return gen3x3((r, c) => mat[r * 3 + c]);
}

export function fromCols(a, b, c) {
    return [...a, ...b, ...c];
}

export function fromRows(a, b, c) {
    return transpose(fromCols(a, b, c));
}

export function diagonal(vec) {
    return [vec[0], 0, 0, 0, vec[1], 0, 0, 0, vec[2]];
}

export function identity3x3() {
    return diagonal([1, 1, 1]);
}

export function getRow3(mat, row) {
    return [mat[row], mat[row + 3], mat[row + 6]];
}

export function getCol3(mat, col) {
    const start = 3 * col;
    return mat.slice(start, start + 3);
}

export function setRow3(mat, row, vec) {
    return gen3x3((r, c) => r == row ? vec[c] : mat[c * 3 + r]);
}

export function setCol3(mat, col, vec) {
    return gen3x3((r, c) => c == col ? vec[r] : mat[c * 3 + r]);
}

export function add3(a, b) {
    return gen3((i) => a[i] + b[i]);
}

export function sub3(a, b) {
    return gen3((i) => a[i] - b[i]);
}

export function dot3(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function scale3(s, vec) {
    return vec.map((x) => x * s);
}

export function magnitude3(vec) {
    return Math.sqrt(dot3(vec, vec));
}

export function multiplyMatrixVec(mat, col_vec) {
    return gen3((i) => dot3(getRow3(mat, i), col_vec));
}

export function cross3(a, b) {
    return [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0]
    ];
}

export function add3x3(a, b) {
    return gen3x3ByIdx((i) => a[i] + b[i]);
}

export function sub3x3(a, b) {
    return gen3x3ByIdx((i) => a[i] - b[i]);
}

export function mult3x3(a, b) {
    return gen3x3((r, c) => dot3(getRow3(a, r), getCol3(b, c)));
}

export function scale3x3(s, mat) {
    return mat.map((x) => x * s);
}
