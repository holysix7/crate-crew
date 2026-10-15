#!/usr/bin/env python3
"""Konversi tekstur PS1 (.TIM) ke PNG. Bisa juga memindai file arsip apa pun
untuk TIM yang tertanam di dalamnya (banyak game membungkus tekstur dalam paket).

Pakai:  python3 tim2png.py FILE [FILE ...] --out out/tex [--scan]
  --scan  cari TIM di seluruh isi file (bukan hanya di offset 0)
Tanpa dependensi (PNG ditulis manual dengan zlib).
"""
import os
import struct
import sys
import zlib


def png(path, w, h, rgba):
    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    raw = b''.join(b'\0' + rgba[y * w * 4:(y + 1) * w * 4] for y in range(h))
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
                + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))


def c15(c):
    if c == 0:
        return (0, 0, 0, 0)  # 0x0000 = transparan di PS1
    r, g, b = c & 31, (c >> 5) & 31, (c >> 10) & 31
    return ((r << 3) | (r >> 2), (g << 3) | (g >> 2), (b << 3) | (b >> 2), 255)


def parse_tim(d, o):
    """Kembalikan (w, h, rgba_bytes, panjang_total) atau None jika bukan TIM valid."""
    if o + 8 > len(d) or struct.unpack_from('<I', d, o)[0] != 0x10:
        return None
    flags = struct.unpack_from('<I', d, o + 4)[0]
    if flags & ~0xb:
        return None
    bpp, has_clut = flags & 3, bool(flags & 8)
    p = o + 8
    clut = []
    if has_clut:
        if p + 12 > len(d):
            return None
        ln, _, _, cw, ch = struct.unpack_from('<IHHHH', d, p)
        if ln != 12 + cw * ch * 2 or cw == 0 or ch == 0 or p + ln > len(d):
            return None
        clut = [c15(v) for v in struct.unpack_from('<%dH' % (cw * ch), d, p + 12)]
        p += ln
    elif bpp < 2:
        return None
    if p + 12 > len(d):
        return None
    ln, _, _, iw, ih = struct.unpack_from('<IHHHH', d, p)
    if iw == 0 or ih == 0 or iw > 1024 or ih > 512 or ln != 12 + iw * ih * 2 or p + ln > len(d):
        return None
    px = d[p + 12:p + ln]
    p += ln
    out = bytearray()
    if bpp == 0:
        w = iw * 4
        for b in px:
            out += bytes(clut[b & 15] if (b & 15) < len(clut) else (255, 0, 255, 255))
            out += bytes(clut[b >> 4] if (b >> 4) < len(clut) else (255, 0, 255, 255))
    elif bpp == 1:
        w = iw * 2
        for b in px:
            out += bytes(clut[b] if b < len(clut) else (255, 0, 255, 255))
    elif bpp == 2:
        w = iw
        for (v,) in struct.iter_unpack('<H', px):
            out += bytes(c15(v))
    else:
        w = iw * 2 // 3
        for i in range(0, w * ih * 3, 3):
            out += bytes((px[i], px[i + 1], px[i + 2], 255))
    return w, ih, bytes(out), p - o


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    scan = '--scan' in sys.argv
    out = 'tex'
    if '--out' in sys.argv:
        out = sys.argv[sys.argv.index('--out') + 1]
        args.remove(out)
    if not args:
        print(__doc__)
        sys.exit(1)
    os.makedirs(out, exist_ok=True)
    total = 0
    for path in args:
        d = open(path, 'rb').read()
        base = os.path.basename(path)
        offs = range(0, len(d) - 8, 4) if scan else [0]
        o_iter = iter(offs)
        skip_to = 0
        for o in o_iter:
            if o < skip_to:
                continue
            r = parse_tim(d, o)
            if not r:
                continue
            w, h, rgba, ln = r
            name = f'{base}_{o:08x}_{w}x{h}.png'
            png(os.path.join(out, name), w, h, rgba)
            total += 1
            skip_to = o + ln
            print(f'{name}')
    print(f'{total} tekstur ditulis ke {out}/')


if __name__ == '__main__':
    main()
