# Colour-vision-deficiency check for branch palettes: simulates protan/deutan/tritan (Machado et al. 2009,
# severity 1.0, linear RGB) on the tile tint (colour at alpha over white) and prints the closest pair (CIE76).
# Run: python3 tools/lookahead/cvd.py
# Simulate colour-vision deficiency (Machado et al. 2009, severity 1.0, linear RGB) on the tile tints
# (colour at alpha over white) and report the smallest CIE76 Lab distance between any two palette colours.
import itertools, math
M = {
 "normal":  [[1,0,0],[0,1,0],[0,0,1]],
 "protan":  [[0.152286,1.052583,-0.204868],[0.114503,0.786281,0.099216],[-0.003882,-0.048116,1.051998]],
 "deutan":  [[0.367322,0.860646,-0.227968],[0.280085,0.672501,0.047413],[-0.011820,0.042940,0.968881]],
 "tritan":  [[1.255528,-0.076749,-0.178779],[-0.078411,0.930809,0.147602],[0.004733,0.691367,0.303900]],
}
lin = lambda c: (c/255/12.92) if c/255 <= 0.04045 else ((c/255+0.055)/1.055)**2.4
def lab(rgb):
    r, g, b = rgb
    X = 0.4124*r + 0.3576*g + 0.1805*b; Y = 0.2126*r + 0.7152*g + 0.0722*b; Z = 0.0193*r + 0.1192*g + 0.9505*b
    f = lambda t: t**(1/3) if t > 0.008856 else 7.787*t + 16/116
    fx, fy, fz = f(X/0.95047), f(Y/1.0), f(Z/1.08883)
    return (116*fy - 16, 500*(fx - fy), 200*(fy - fz))
def tint(c, a): return [lin(255*(1-a) + v*a) for v in c]
def sim(c, a, m):
    v = tint(c, a); out = [sum(m[i][j]*v[j] for j in range(3)) for i in range(3)]
    return [min(1, max(0, x)) for x in out]
def main():
    PALETTES = {
     "current (pink, teal, orange, lime)": {"pink": (236,72,153), "teal": (20,184,166), "orange": (249,115,22), "lime": (132,204,22)},
     "Okabe-Ito pick (orange, bluish green, blue, reddish purple)": {"orange": (230,159,0), "bluish green": (0,158,115), "blue": (0,114,178), "reddish purple": (204,121,167)},
     "Okabe-Ito alt (orange, sky blue, bluish green, reddish purple)": {"orange": (230,159,0), "sky blue": (86,180,233), "bluish green": (0,158,115), "reddish purple": (204,121,167)},
     "Okabe-Ito alt2 (vermillion, sky blue, bluish green, yellow)": {"vermillion": (213,94,0), "sky blue": (86,180,233), "bluish green": (0,158,115), "yellow": (240,228,66)},
    }
    SEL = {"selected tile (#a5b4fc)": (165,180,252)}
    for name, pal in PALETTES.items():
        print(f"\n{name}")
        for a in (0.4, 0.22):
            row = []
            for kind, m in M.items():
                labs = {k: lab(sim(c, a, m)) for k, c in pal.items()}
                (p, q), d = min(((pq, math.dist(labs[pq[0]], labs[pq[1]])) for pq in itertools.combinations(labs, 2)), key=lambda x: x[1])
                row.append(f"{kind}: {d:5.1f} ({p}/{q})")
            print(f"  alpha {a}: " + " | ".join(row))
        # how close is each colour's ring/tint to the selected-tile indigo (normal vision, tint 0.4)
        sel = lab([lin(v) for v in SEL["selected tile (#a5b4fc)"]])
        print("  vs selected indigo at 0.4: " + ", ".join(f"{k} {math.dist(lab(sim(c, .4, M['normal'])), sel):.0f}" for k, c in pal.items()))

if __name__ == '__main__':
    main()
