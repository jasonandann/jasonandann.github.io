# Searches Okabe-Ito + Paul Tol colours for the 4 that stay most distinct under cvd.py's simulation.
# Run: python3 tools/lookahead/cvd_search.py
import itertools, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cvd import M, lab, sim, lin
CANDS = {  # Okabe-Ito (jfly.uni-koeln.de/color) + Paul Tol 'bright' (personal.sron.nl/~pault)
 "OI orange": (230,159,0), "OI sky blue": (86,180,233), "OI bluish green": (0,158,115), "OI yellow": (240,228,66),
 "OI blue": (0,114,178), "OI vermillion": (213,94,0), "OI reddish purple": (204,121,167),
 "Tol blue": (68,119,170), "Tol cyan": (102,204,238), "Tol green": (34,136,51), "Tol yellow": (204,187,68),
 "Tol red": (238,102,119), "Tol purple": (170,51,119),
}
SEL = lab([lin(v) for v in (165,180,252)])
def score(names, a=0.4, kinds=("normal", "protan", "deutan", "tritan")):
    worst = 1e9
    for k in kinds:
        L = [lab(sim(CANDS[n], a, M[k])) for n in names]
        worst = min(worst, min(math.dist(p, q) for p, q in itertools.combinations(L, 2)))
    return worst
ok = [n for n in CANDS if math.dist(lab(sim(CANDS[n], .4, M["normal"])), SEL) > 30]  # not close to selected indigo
best = None
for four in itertools.combinations(ok, 4):
    # rank: worst pair of all 4 (incl. tritan), then worst of the best first-two ordering
    s4 = score(four)
    pair = max(itertools.combinations(four, 2), key=lambda pq: score(pq))
    key = (round(s4, 1), round(score(pair), 1))
    if not best or key > best[0]: best = (key, four, pair)
(k4, k2), four, pair = best
rest = [n for n in four if n not in pair]
third = max(rest, key=lambda n: score(pair + (n,)))
order = list(pair) + [third] + [n for n in rest if n != third]
print("best 4 (order for branches 1..4):", order, [CANDS[n] for n in order])
for a in (0.4, 0.22):
    print(f"  alpha {a}: " + " | ".join(f"{k} {score(order, a, (k,)):.1f}" for k in M))
print("  first 2 only, alpha 0.4:", " | ".join(f"{k} {score(order[:2], .4, (k,)):.1f}" for k in M))
print("  first 3 only, alpha 0.4:", " | ".join(f"{k} {score(order[:3], .4, (k,)):.1f}" for k in M))
print("  vs selected indigo:", ", ".join(f"{n} {math.dist(lab(sim(CANDS[n], .4, M['normal'])), SEL):.0f}" for n in order))
