// hash polinomial base 31, pelo método de Horner: h = h * 31 + código da letra.
// o ">>> 0" corta em 32 bits (módulo 2^32).
// o for...of anda letra por letra igual o python, então os dois dão o mesmo número
function hashPolinomial(texto) {
    let h = 0;
    for (const letra of texto) {
        h = (h * 31 + letra.codePointAt(0)) >>> 0;
    }
    return h;
}
