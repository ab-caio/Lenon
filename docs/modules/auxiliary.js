
export function clamp(value) {
    return Math.max(0, Math.min(255, Math.round(value)));
}





// deprecated. They stay for method studying purposes
/*
export function textToBits(text) {
    let bits = '';
    let textWithNull = text + '\0';
    for (let i = 0; i < textWithNull.length; ++i) {
        let bin = textWithNull.charCodeAt(i).toString(2).padStart(8, '0');
        bits += bin;
    }
    return bits;
}
*/

/*
export function bitsToText(bits) {
    let text = '';
    for (let i = 0; i < bits.length; i += 8) {
        let byteStr = bits.slice(i, i+8);
        if (byteStr.length < 8) break;
        let charCode = parseInt(byteStr, 2);
        if (charCode === 0) break;
        text += String.fromCharCode(charCode);
    }
    return text;
}
*/
