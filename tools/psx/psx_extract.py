#!/usr/bin/env python3
"""Ekstrak isi disk PS1 (.bin raw 2352 byte/sektor, atau .iso 2048) ke folder.

Pakai:  python3 psx_extract.py team-buddies.bin  out/disc
Hanya untuk disk milik sendiri. Hasil ekstraksi JANGAN di-commit / dibagikan.
"""
import os
import struct
import sys


class Disc:
    def __init__(self, path):
        self.f = open(path, 'rb')
        size = os.path.getsize(path)
        self.f.seek(0)
        head = self.f.read(16)
        sync = b'\x00' + b'\xff' * 10 + b'\x00'
        self.raw = head[:12] == sync and size % 2352 == 0
        self.ssize = 2352 if self.raw else 2048
        self.count = size // self.ssize

    def sector(self, lba):
        """Kembalikan (data, form2). Mode2 Form2 (audio XA / video STR) = 2324 byte."""
        self.f.seek(lba * self.ssize)
        s = self.f.read(self.ssize)
        if not self.raw:
            return s, False
        mode = s[15]
        if mode == 1:
            return s[16:16 + 2048], False
        if mode == 2:
            submode = s[18]
            if submode & 0x20:
                return s[24:24 + 2324], True
            return s[24:24 + 2048], False
        return s[16:16 + 2048], False


def parse_dir(disc, lba, size, prefix, out):
    data = b''
    for i in range((size + 2047) // 2048):
        data += disc.sector(lba + i)[0][:2048]
    pos = 0
    while pos < size:
        ln = data[pos]
        if ln == 0:  # record tidak melintasi batas sektor
            pos = (pos // 2048 + 1) * 2048
            continue
        rec = data[pos:pos + ln]
        ext = struct.unpack_from('<I', rec, 2)[0]
        fsize = struct.unpack_from('<I', rec, 10)[0]
        flags = rec[25]
        nlen = rec[32]
        name = rec[33:33 + nlen]
        pos += ln
        if name in (b'\x00', b'\x01'):
            continue
        name = name.decode('ascii', 'replace').split(';')[0]
        path = prefix + '/' + name if prefix else name
        if flags & 2:
            out.append(('dir', path, ext, fsize))
            parse_dir(disc, ext, fsize, path, out)
        else:
            out.append(('file', path, ext, fsize))


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    disc = Disc(sys.argv[1])
    outdir = sys.argv[2] if len(sys.argv) > 2 else 'disc'
    pvd = disc.sector(16)[0]
    if pvd[1:6] != b'CD001':
        sys.exit('Bukan ISO9660 (Primary Volume Descriptor tidak ditemukan di sektor 16).')
    vol = pvd[40:72].decode('ascii', 'replace').strip()
    root = pvd[156:156 + 34]
    entries = []
    parse_dir(disc, struct.unpack_from('<I', root, 2)[0], struct.unpack_from('<I', root, 10)[0], '', entries)
    print(f'Volume: {vol}  |  format: {"raw 2352" if disc.raw else "iso 2048"}  |  {disc.count} sektor')
    os.makedirs(outdir, exist_ok=True)
    for kind, path, lba, size in entries:
        dst = os.path.join(outdir, *path.split('/'))
        if kind == 'dir':
            os.makedirs(dst, exist_ok=True)
            continue
        nsec = (size + 2047) // 2048
        if lba + nsec > disc.count:  # mis. file yang menunjuk ke track audio CD-DA berikutnya
            print(f'{size:>10}  LBA {lba:>6}  {path}  [dilewati: di luar track data, kemungkinan CD-DA]')
            continue
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        form2 = False
        with open(dst, 'wb') as w:
            for i in range(nsec):
                d, f2 = disc.sector(lba + i)
                form2 |= f2
                w.write(d)
            if not form2:
                w.truncate(size)
        tag = '  [Form2: XA/STR, ditulis per-sektor 2324 byte]' if form2 else ''
        print(f'{size:>10}  LBA {lba:>6}  {path}{tag}')
    cnf = os.path.join(outdir, 'SYSTEM.CNF')
    if os.path.exists(cnf):
        print('\nSYSTEM.CNF:\n' + open(cnf, 'rb').read().decode('ascii', 'replace').strip())


if __name__ == '__main__':
    main()
