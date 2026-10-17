import "https://cdn.jsdelivr.net/npm/jimp@0.22.12/browser/lib/jimp.js"; // Jimp library
import {clamp} from "./auxiliary.js"; // Clamps and rounds between 0 and 255


// ===============================================================================
// GRAY-SCALE TRANSFORMATIONS / FUNCTIONS


export async function inversion(img) {
    // The inverse of a pixel intensity, if interpreted as a value in a numerical rule, 
    // is given by the distance between it and the opposite extreme, which is 255 here.
    // For example, the inverse of 10 is 255 - 10 = 245

    const lut = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; ++i) {
        lut[i] = 255 - i;
    }

    const data = img.bitmap.data;
    img.scan(0, 0, img.bitmap.width, img.bitmap.height, function(x, y, idx) {
        data[idx + 0] = lut[data[idx + 0]];
        data[idx + 1] = lut[data[idx + 1]];
        data[idx + 2] = lut[data[idx + 2]];
    });
    return img;
}


export async function threshold(img, limit) {
    // Given a limit value as a threshold, every pixel whose intensity is lower
    // than the limit is nullified, and every pixel whose intensity is greater
    // than or equal to the limit is pushed to the maximum value

    const lut = new Uint8ClampedArray(256);
    for(let i = 0; i < 256; ++i) {
        lut[i] = i < limit ? 0 : 255;
    }

    const data = img.bitmap.data;
    img.scan(0, 0, img.bitmap.width, img.bitmap.height, function(x, y, idx) {
        const R = img.bitmap.data[idx + 0];
        const G = img.bitmap.data[idx + 1];
        const B = img.bitmap.data[idx + 2];

        const luminance = Math.round(0.299*R + 0.587*G + 0.114*B);

        data[idx + 0] = lut[luminance];
        data[idx + 1] = lut[luminance];
        data[idx + 2] = lut[luminance];
    });
    return img;
}


export function brightness(img, value) {
    // Simply an addition of a given real value to the pixel intensity 

    if (value === 0) return img;

    const lut = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; ++i) {
        lut[i] = i + value;
    }

    const data = img.bitmap.data;
    img.scan(0, 0, img.bitmap.width, img.bitmap.height, function(x, y, idx) {
        data[idx + 0] = lut[data[idx + 0]];
        data[idx + 1] = lut[data[idx + 1]];
        data[idx + 2] = lut[data[idx + 2]];
    });
    return img;
}


export async function gammaCorrection(img, gamma, constant = 1) {
    // The exponential function, whose expoent is named gamma here, serves for contrast stretching or compresion
    // For gamma > 1, the exponential curve maps a narrow range of high values to a wider range of dark values
    // Contrarily, gamma < 1 maps a narrow range of dark values into a wider range of higher values
    // Gamma values lower than one transform the image in a similar way to logarithmic transformations 

    const lut = new Uint8ClampedArray(256);

    if (gamma === 1 && constant === 1) return img;

    for(let i = 0; i < 256; ++i) {
        const normalized = i / 255;
        const corrected = Math.pow(normalized, gamma);
        lut[i] = clamp(constant * corrected * 255);
    }

    img.scan(0, 0, img.bitmap.width, img.bitmap.height, function(x, y, idx) {
        img.bitmap.data[idx + 0] = lut[img.bitmap.data[idx + 0]];
        img.bitmap.data[idx + 1] = lut[img.bitmap.data[idx + 1]];
        img.bitmap.data[idx + 2] = lut[img.bitmap.data[idx + 2]];
    });
    return img;
}


export async function pieceWise(img, rPoints, sPoints) {
    // Given a s = T(r) piece-wise linear transformation, s and r indexed by the set {1, 2, ..., k},
    // the interval [r_k, r_{k+1}] limits a specific transformation to the pixel intensities contained in it.

    // Given an input value r between r_k and r_{k+1}, its output value s will be contained in the line segment that connects r_k and r_{k+1}
    // From this, the slope is the quotient (s_{k+1} - s_k) / (r_{k+1} - r_k), the line equation is
    // s - s_k = (s_{k+1} - s_k) / (r_{k+1} - r_k) * (r - r_k)

    if (rPoints.length != sPoints.length || rPoints.length < 2) {
        throw new Error("Mapping error: rPoints.length != sPoints.length || rPoints.length < 2 ")
    }

    const lut = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i++) {
        let value = sPoints[0];
        for (let j = 0; j < rPoints.length - 1; j++) {
            if (i >= rPoints[j] && i <= rPoints[j + 1]) {
                let slope = rPoints[j] === rPoints[j + 1] ? 0 : (sPoints[j + 1] - sPoints[j]) / (rPoints[j + 1] - rPoints[j]);
                value = Math.round(slope * (i - rPoints[j]) + sPoints[j]);
                break;

            } else if (i > rPoints[j + 1]) {
                value = sPoints[j + 1];
            }
        }
        lut[i] = value;
    }

    const data = img.bitmap.data;
    img.scan(0, 0, img.bitmap.width, img.bitmap.height, function(x, y, idx) {

        data[idx + 0] = lut[data[idx + 0]];
        data[idx + 1] = lut[data[idx + 1]];
        data[idx + 2] = lut[data[idx + 2]];
    });
    return img;
}


export function encode(img, message) {
    // altering the Least Siginifcant Bit to hide messages in an image bitmap.
    // the encoding is made in the order R -> G -> B

    const data = img.bitmap.data;
    const messageWithNull = message + '\0';
    const maxBits = img.bitmap.width * img.bitmap.height * 3;
    const totalBits = messageWithNull.length * 8;


    if (totalBits > maxBits) throw new Error("Message is too big for this image");


    let bitIndex = 0;
    for (let i = 0; i < data.length && bitIndex < totalBits; i += 4) {
        for (let c = 0; c < 3 && bitIndex < totalBits; ++c) {
            const charCode = messageWithNull.charCodeAt(Math.floor(bitIndex / 8));
            const bit = (charCode >> (7 - (bitIndex % 8))) & 1;
            data[i + c] = (data[i + c] & 0xFE) | bit;
            ++bitIndex;
        }
    }
    return img;
}


export function decode(img) {
    // reads the LSB of all hte pixels, till it encounters a null character/byte

    const data = img.bitmap.data;
    let message = '';
    let bitsCount = 0;
    let currentByte = 0;
    let finished = false;
    
    for (let i = 0; i < data.length; i += 4) {
        for (let p = 0; p < 3; ++p) {
            currentByte = (currentByte << 1) | (data[i + p] & 1);
            ++bitsCount;

            if (bitsCount === 8) {
                if (currentByte === 0) return message;
                message += String.fromCharCode(currentByte);
                currentByte = 0;
                bitsCount = 0;
            }
        }
    }
    return message;
}


export async function getHistogram(img) {
    // Given L as the total pixels intensity values, a histogram is a discrete function h(r_k) = n_k 
    // at the interval [0, L - 1] that tells the cardinality of pixels with r_k intensity.

    const histogram = new Uint32Array(256);

    img.scan(0, 0, img.bitmap.width, img.bitmap.height, function(x, y, idx) {

        const R = img.bitmap.data[idx + 0];
        const G = img.bitmap.data[idx + 1];
        const B = img.bitmap.data[idx + 2];

        const luminance = 0.299*R + 0.587*G + 0.114*B;
        ++histogram[Math.round(luminance)];
    });
    return histogram;
}


export async function equalizeHistogram(img) {

    // for this equalization it's used a discrete alternative to the Cumulative Distribution Function (CDF).
    // Basically, the equalized value of a given pixel value 'r' is the product between 255 and the sum of the 
    // density of r_j with j varying from 0 to r, such density that's defined by the quotient between the number n_j of 
    // occurrences of a r_j pixel intensity and the total cardinality of pixels

    const histogram = await getHistogram(img);
    const lut = new Uint8ClampedArray(256);

    let sum = 0;
    const factor = 255 / (img.bitmap.width * img.bitmap.height);
    // img.bitmap.width * img.bitmap.height = Total quantity of pixels in the image

    for (let j = 0; j < 256; ++j) {
        sum += histogram[j]
        lut[j] = clamp(factor * sum);
    }

    img.scan(0, 0, img.bitmap.width, img.bitmap.height, function(x, y, idx) {

        const R = img.bitmap.data[idx + 0];
        const G = img.bitmap.data[idx + 1];
        const B = img.bitmap.data[idx + 2];

        const luminance = Math.round(0.299*R + 0.587*G + 0.114*B);

        img.bitmap.data[idx + 0] = lut[luminance];
        img.bitmap.data[idx + 1] = lut[luminance];
        img.bitmap.data[idx + 2] = lut[luminance];
    });
    return img;
}
