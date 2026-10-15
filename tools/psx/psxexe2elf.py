#!/usr/bin/env python3
"""Bungkus executable PS1 (PS-X EXE, mis. SCES_xxx.xx) menjadi ELF32 MIPS little-endian
supaya bisa dianalisis REA (lane Ghidra MIPS) atau Ghidra/objdump biasa.

Pakai:  python3 psxexe2elf.py SCES_012.34  team-buddies.elf

Header yang dihasilkan: ET_EXEC, EM_MIPS, e_flags = EF_MIPS_ARCH_32 tanpa deklarasi ABI
(lane "recordless legacy" REA -> Ghidra MIPS:LE:32:default). Simbol _start dan _gp ikut
ditulis supaya Ghidra langsung tahu entry point dan nilai register $gp.

Catatan: CPU PS1 = R3000A (MIPS I) + GTE (COP2). Instruksi dasar MIPS I terbaca oleh
dekoder MIPS32, tetapi instruksi GTE akan tampil sebagai COP2 generik/tak dikenal.
"""
import struct
import sys

EF_MIPS_ARCH_32 = 0x50000000


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    src = open(sys.argv[1], 'rb').read()
    if src[:8] != b'PS-X EXE':
        sys.exit('Bukan PS-X EXE (magic "PS-X EXE" tidak ada).')
    pc0, gp0, t_addr, t_size, d_addr, d_size, b_addr, b_size = struct.unpack_from('<8I', src, 0x10)
    text = src[0x800:0x800 + t_size]
    if len(text) < t_size:
        text += b'\0' * (t_size - len(text))
    print(f'entry=0x{pc0:08x} gp=0x{gp0:08x} text=0x{t_addr:08x}+0x{t_size:x} bss=0x{b_addr:08x}+0x{b_size:x}')

    # tata letak file
    text_off = 0x1000 + (t_addr & 0xfff)
    shstr = b'\0.text\0.bss\0.symtab\0.strtab\0.shstrtab\0'
    n = lambda s: shstr.index(s.encode() + b'\0')
    strtab = b'\0_start\0_gp\0'
    syms = b''.join([
        struct.pack('<IIIBBH', 0, 0, 0, 0, 0, 0),
        struct.pack('<IIIBBH', 1, pc0, 0, 0x12, 0, 1),           # _start: GLOBAL FUNC di .text
        struct.pack('<IIIBBH', 8, gp0, 0, 0x10, 0, 0xfff1),       # _gp: GLOBAL NOTYPE ABS
    ])
    off = text_off + len(text)
    symtab_off = (off + 3) & ~3
    strtab_off = symtab_off + len(syms)
    shstr_off = strtab_off + len(strtab)
    sh_off = (shstr_off + len(shstr) + 3) & ~3

    has_bss = b_size > 0
    phnum = 2 if has_bss else 1
    shdrs = [struct.pack('<10I', *([0] * 10)),
             struct.pack('<10I', n('.text'), 1, 0x7, t_addr, text_off, len(text), 0, 0, 16, 0)]
    if has_bss:
        shdrs.append(struct.pack('<10I', n('.bss'), 8, 0x3, b_addr, sh_off, b_size, 0, 0, 16, 0))
    symtab_idx = len(shdrs)
    shdrs.append(struct.pack('<10I', n('.symtab'), 2, 0, 0, symtab_off, len(syms), symtab_idx + 1, 1, 4, 16))
    shdrs.append(struct.pack('<10I', n('.strtab'), 3, 0, 0, strtab_off, len(strtab), 0, 0, 1, 0))
    shdrs.append(struct.pack('<10I', n('.shstrtab'), 3, 0, 0, shstr_off, len(shstr), 0, 0, 1, 0))

    ehdr = b'\x7fELF' + bytes([1, 1, 1, 0]) + b'\0' * 8
    ehdr += struct.pack('<HHIIIIIHHHHHH', 2, 8, 1, pc0, 52, sh_off, EF_MIPS_ARCH_32, 52, 32, phnum, 40, len(shdrs), len(shdrs) - 1)
    phdrs = struct.pack('<8I', 1, text_off, t_addr, t_addr, len(text), len(text), 7, 0x1000)
    if has_bss:
        phdrs += struct.pack('<8I', 1, 0, b_addr, b_addr, 0, b_size, 6, 0x1000)

    out = bytearray(sh_off + 40 * len(shdrs))
    out[0:52] = ehdr
    out[52:52 + len(phdrs)] = phdrs
    out[text_off:text_off + len(text)] = text
    out[symtab_off:symtab_off + len(syms)] = syms
    out[strtab_off:strtab_off + len(strtab)] = strtab
    out[shstr_off:shstr_off + len(shstr)] = shstr
    out[sh_off:] = b''.join(shdrs)
    open(sys.argv[2], 'wb').write(out)
    print('ELF ditulis ke', sys.argv[2])


if __name__ == '__main__':
    main()
