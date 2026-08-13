"""La comparación de familias de modelo, bajo el mismo protocolo duro.

    .venv-ml/bin/python scripts/ml/sweep.py

Está aparte de `run.py` porque se corre una vez cada vez que se cambian los
predictores, no en cada entrenamiento. De aquí sale la decisión de qué modelo
publica `run.py`, y esa decisión tiene que estar sostenida por una tabla y no
por una preferencia estética.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import numpy as np
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score

import train
from access import distance_to_ways
from dem import cell_elevation, land_mask, load_heights, relief
from fuel import UNKNOWN, fuel_grid
from grid import load_grid
from perimeters import fires

CANDIDATES = {
    "logística": lambda: LogisticRegression(C=1.0, max_iter=2000, solver="liblinear"),
    "gbm d2 n60": lambda: GradientBoostingClassifier(max_depth=2, n_estimators=60, random_state=0),
    "gbm d2 n150": lambda: GradientBoostingClassifier(max_depth=2, n_estimators=150, random_state=0),
    "gbm d3 n100": lambda: GradientBoostingClassifier(max_depth=3, n_estimators=100, random_state=0),
    "gbm d3 n300 lr.05": lambda: GradientBoostingClassifier(
        max_depth=3, n_estimators=300, learning_rate=0.05, random_state=0
    ),
    "gbm d4 n200": lambda: GradientBoostingClassifier(max_depth=4, n_estimators=200, random_state=0),
    "bosque hoja20": lambda: RandomForestClassifier(
        n_estimators=300, min_samples_leaf=20, random_state=0, n_jobs=-1
    ),
    "bosque hoja50": lambda: RandomForestClassifier(
        n_estimators=300, min_samples_leaf=50, random_state=0, n_jobs=-1
    ),
}


def main() -> None:
    grid = load_grid()
    heights = load_heights(grid)
    elevation = cell_elevation(grid, heights)
    land = land_mask(elevation)
    slope, southness, westness = relief(grid, heights)
    fuel = fuel_grid(grid)
    distance = distance_to_ways(grid)

    fire_list = fires(grid)
    masks = [f["mask"] & land for f in fire_list]
    labels = [f["label"] for f in fire_list]
    burned = np.zeros_like(land)
    for m in masks:
        burned |= m

    usable = land & (fuel != UNKNOWN)
    feats = train.standardize(
        train.build_features(fuel, slope, southness, westness, elevation, distance, usable)
    )
    folds = [m[usable] for m in masks]

    def lofo(make) -> np.ndarray:
        aucs = []
        for k, held in enumerate(folds):
            others = np.zeros_like(held)
            for i, m in enumerate(folds):
                if i != k:
                    others |= m
            rows = ~(held & ~others)
            model = make()
            model.fit(feats.x[rows], others[rows].astype(int))
            never = ~(others | held)
            test = held | never
            score = model.predict_proba(feats.x[test])[:, 1]
            aucs.append(roc_auc_score(held[test].astype(int), score))
        return np.array(aucs)

    print(f"{'modelo':22} {'media':>6} {'peor':>6}   " + "  ".join(f"{l[:13]:>13}" for l in labels))
    for name, make in CANDIDATES.items():
        a = lofo(make)
        print(f"{name:22} {a.mean():6.3f} {a.min():6.3f}   " + "  ".join(f"{v:13.3f}" for v in a))

    print("\nreparto al azar en vez de por incendio, con el mismo modelo flexible:")
    rng = np.random.default_rng(0)
    y = burned[usable].astype(int)
    shuffled = rng.permutation(len(y))
    cut = len(y) // 2
    model = GradientBoostingClassifier(max_depth=3, n_estimators=100, random_state=0)
    model.fit(feats.x[shuffled[:cut]], y[shuffled[:cut]])
    naive = roc_auc_score(y[shuffled[cut:]], model.predict_proba(feats.x[shuffled[cut:]])[:, 1])
    print(f"   AUC con celdas repartidas al azar: {naive:.3f}  ← esto es lo que NO se publica")

    model = GradientBoostingClassifier(max_depth=3, n_estimators=100, random_state=0)
    model.fit(feats.x, y)
    print("\nimportancia de cada predictor (GBM d3 n100, ajustado con los cinco):")
    for name, imp in sorted(zip(feats.names, model.feature_importances_), key=lambda t: -t[1]):
        print(f"   {name:14} {imp:.3f}")
    nodes = sum(t[0].tree_.node_count for t in model.estimators_)
    print(f"nodos totales del conjunto: {nodes}")


if __name__ == "__main__":
    main()
