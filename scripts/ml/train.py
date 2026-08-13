"""El clasificador espacial: dónde se quema esta isla.

QUÉ APRENDE, EXACTAMENTE. Dado que en La Palma se declara un gran incendio,
¿qué celdas alcanza? Eso y no otra cosa. No aprende cuándo empieza un incendio,
ni cada cuánto, ni qué probabilidad hay de que arda un punto este verano:
aprende la geografía de lo que ya se quemó.

CÓMO. Un conjunto de árboles con potenciación del gradiente sobre las 16.277
celdas de tierra con combustible clasificado —de 17.545 que tiene la isla; las
1.268 restantes, el 7,2 %, no las clasifica ninguna de las dos cartografías y se
quedan fuera del ajuste y fuera del mapa. La variable a explicar es «esta
celda entró en el perímetro de alguno de los cinco incendios»; las explicativas
son el modelo de combustible, la pendiente, la orientación, la altitud y la
distancia a la vía más cercana.

POR QUÉ ÁRBOLES Y NO UNA REGRESIÓN LOGÍSTICA. Porque se midió, y salió al revés
de lo que uno esperaría de un problema con cinco episodios. Con el protocolo
duro —esconder un incendio entero— la logística da 0,735 de AUC media y **0,513
en el peor pliegue**, que es no distinguir nada; el conjunto de árboles da 0,834
y 0,653. La tabla completa la deja `sweep.py` y está en el README.

La explicación de por qué la recta se queda corta se ve en el propio mapa: la
relación entre altitud y quemarse **no es monótona**. Arde la banda del pinar,
entre unos 800 y 1.500 m; no arde la costa regada, y no arde la cumbre pelada
por encima del pinar. Una regresión logística solo puede decir «cuanto más
alto, más» o «cuanto más alto, menos», y las dos son falsas a la vez. Un árbol
parte en dos sitios y ya está.

Un bosque aleatorio saca prácticamente lo mismo de media —0,833 contra 0,834—
pero es **peor donde importa**, 0,611 en el peor pliegue contra 0,653, y ocupa
trescientos árboles sin podar en vez de ciento cincuenta tocones.

Se elige la variante de **profundidad 2 y 150 árboles**. Las más profundas dan
una décima más en el peor pliegue —0,662 con profundidad 4— y esa décima está
dentro del ruido de tener cinco pliegues, mientras que la profundidad 4 sí
permite interacciones de cuatro variables ajustadas sobre cinco incendios, que
es exactamente cómo se memoriza un perímetro. Con profundidad 2 el modelo solo
puede combinar predictores de dos en dos, son 1.050 nodos, y cabe en un JSON de
108 KB que el navegador recorre sin ninguna biblioteca.

LA VALIDACIÓN ES LA PARTE SERIA, y es donde casi todos los mapas de riesgo de
incendio que circulan hacen trampa sin querer. Repartir las celdas al azar entre
entrenamiento y prueba da un AUC magnífico y **falso**: las celdas de un mismo
incendio son vecinas, así que la mitad de prueba está rodeada de celdas de
entrenamiento y al modelo le basta con interpolar. Medido con este mismo
conjunto de árboles: **0,903 repartiendo al azar contra 0,833 escondiendo un
incendio entero**. Esos siete centésimas son el tamaño del autoengaño, y lo que
se publica es el segundo número.

Con cinco episodios, además, la media tiene su propia incertidumbre. Se publican
**los cinco pliegues**, no solo la media, porque uno de ellos —Garafía 2020— es
mucho peor que los demás y esconderlo detrás de un promedio sería la otra forma
de hacer trampa.
"""

from __future__ import annotations

from dataclasses import dataclass, field as dc_field

import numpy as np
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score

from fuel import NFFL_PRESENT

#: El modelo de combustible que hace de referencia en la codificación
#: disyuntiva. Se deja fuera el 0 —«sin combustible»—, de modo que el resto se
#: lee como «cuánto más que la roca desnuda».
REFERENCE_FUEL = 0

#: Las celdas que ninguna de las dos cartografías clasifica se quedan fuera del
#: ajuste. No es lo mismo que asignarles «sin combustible»: eso sería afirmar
#: que no arden, y lo que pasa es que no se sabe.
DROP_UNKNOWN_FUEL = True

#: Profundidad y número de árboles. La justificación, medida, está arriba.
MAX_DEPTH = 2
N_ESTIMATORS = 150
LEARNING_RATE = 0.1


def make_model() -> GradientBoostingClassifier:
    return GradientBoostingClassifier(
        max_depth=MAX_DEPTH,
        n_estimators=N_ESTIMATORS,
        learning_rate=LEARNING_RATE,
        random_state=0,
    )


@dataclass
class Features:
    """La matriz de diseño y el nombre de cada columna, que viajan juntos.

    Van juntos porque el JSON que exporta esto guarda los árboles por ÍNDICE de
    columna: si alguna vez el nombre y la columna se separan, el mapa saldría
    plausible y equivocado sin que falle nada.
    """

    x: np.ndarray
    names: list[str] = dc_field(default_factory=list)
    center: np.ndarray | None = None
    scale: np.ndarray | None = None


def build_features(
    fuel: np.ndarray,
    slope: np.ndarray,
    southness: np.ndarray,
    westness: np.ndarray,
    elevation: np.ndarray,
    distance: np.ndarray,
    mask: np.ndarray,
) -> Features:
    """Las columnas del modelo, en el orden en que las escribe el JSON."""
    cols: list[np.ndarray] = []
    names: list[str] = []

    for model in NFFL_PRESENT:
        if model == REFERENCE_FUEL:
            continue
        cols.append((fuel[mask] == model).astype(float))
        names.append(f"fuel{model}")

    cols.append(slope[mask].astype(float))
    names.append("slope")
    cols.append(southness[mask].astype(float))
    names.append("southness")
    cols.append(westness[mask].astype(float))
    names.append("westness")
    cols.append(elevation[mask].astype(float) / 1000.0)
    names.append("elevation_km")
    # La distancia entra en logaritmo porque lo que separa 50 m de 250 no es lo
    # mismo que lo que separa 1.200 de 1.400: la primera diferencia es «hay un
    # camino aquí mismo» y la segunda es ruido.
    cols.append(np.log1p(distance[mask].astype(float)))
    names.append("log_distance")

    return Features(x=np.column_stack(cols), names=names)


def standardize(f: Features) -> Features:
    """Tipifica las columnas continuas; las disyuntivas se dejan como están.

    A un conjunto de árboles la tipificación le da exactamente igual —parte por
    umbrales, no por magnitudes— y se mantiene por una razón práctica: la
    comparación con la regresión logística de `sweep.py` tiene que correr sobre
    la MISMA matriz, y a la logística no le da igual en absoluto.
    """
    center = np.zeros(f.x.shape[1])
    scale = np.ones(f.x.shape[1])
    for k, name in enumerate(f.names):
        if name.startswith("fuel"):
            continue
        center[k] = f.x[:, k].mean()
        s = f.x[:, k].std()
        scale[k] = s if s > 1e-9 else 1.0
    return Features(x=(f.x - center) / scale, names=list(f.names), center=center, scale=scale)


def leave_one_fire_out(f: Features, fire_masks: list[np.ndarray], labels: list[str]) -> list[dict]:
    """Un pliegue por incendio. Entrena con los demás y puntúa sobre el escondido.

    La sutileza está en qué es un negativo. En el pliegue que esconde el
    incendio de 2016, sus celdas **no pueden contar como «no se quemó»** al
    entrenar: se quemaron, solo que el modelo no tiene derecho a saberlo
    todavía. Así que se sacan del ajuste por completo. Meterlas como negativas
    enseñaría al modelo que el sitio donde de verdad ardió es un sitio que no
    arde, y hundiría el resultado por un error de contabilidad, no por falta de
    señal.
    """
    out = []
    for k, held in enumerate(fire_masks):
        others = np.zeros_like(held)
        for i, m in enumerate(fire_masks):
            if i != k:
                others |= m

        rows = ~(held & ~others)  # fuera las celdas que SOLO quemó el escondido
        model = make_model()
        model.fit(f.x[rows], others[rows].astype(int))

        # Se puntúa sobre el incendio escondido contra todo lo que no se ha
        # quemado nunca. Es la pregunta operativa: entre una celda que ardió y
        # una que no, ¿el modelo ordena bien las dos?
        never = ~(others | held)
        test = held | never
        score = model.predict_proba(f.x[test])[:, 1]
        out.append(
            {
                "fire": labels[k],
                "heldCells": int(held.sum()),
                "auc": round(float(roc_auc_score(held[test].astype(int), score)), 4),
            }
        )
    return out


def shuffled_auc(f: Features, burned: np.ndarray, seed: int = 0) -> float:
    """El AUC que saldría repartiendo las celdas al azar. La cifra que NO se publica.

    Se calcula a propósito y se enseña al lado de la buena, porque es la cifra
    que da cualquiera que no repare en que las celdas de un incendio son
    vecinas. Tenerla delante es lo que convierte «hemos validado» en una
    afirmación con contenido.
    """
    rng = np.random.default_rng(seed)
    y = burned.astype(int)
    order = rng.permutation(len(y))
    cut = len(y) // 2
    model = make_model()
    model.fit(f.x[order[:cut]], y[order[:cut]])
    return float(roc_auc_score(y[order[cut:]], model.predict_proba(f.x[order[cut:]])[:, 1]))


def compare_families(f: Features, fire_masks: list[np.ndarray], labels: list[str]) -> list[dict]:
    """La comparación que sostiene la elección de familia, bajo el mismo protocolo."""
    from sklearn.ensemble import RandomForestClassifier

    candidates = {
        "logística": lambda: LogisticRegression(C=1.0, max_iter=2000, solver="liblinear"),
        "árboles (el publicado)": make_model,
        "bosque aleatorio": lambda: RandomForestClassifier(
            n_estimators=300, min_samples_leaf=20, random_state=0, n_jobs=-1
        ),
    }

    out = []
    for name, make in candidates.items():
        aucs = []
        for k, held in enumerate(fire_masks):
            others = np.zeros_like(held)
            for i, m in enumerate(fire_masks):
                if i != k:
                    others |= m
            rows = ~(held & ~others)
            model = make()
            model.fit(f.x[rows], others[rows].astype(int))
            never = ~(others | held)
            test = held | never
            score = model.predict_proba(f.x[test])[:, 1]
            aucs.append(float(roc_auc_score(held[test].astype(int), score)))
        out.append(
            {
                "family": name,
                "aucMean": round(float(np.mean(aucs)), 4),
                "aucWorst": round(float(min(aucs)), 4),
            }
        )
    return out


def fit_final(f: Features, burned: np.ndarray) -> GradientBoostingClassifier:
    """El modelo que se publica: ajustado con los cinco incendios."""
    model = make_model()
    model.fit(f.x, burned.astype(int))
    return model


def export_trees(model: GradientBoostingClassifier, f: Features) -> dict:
    """Los árboles en la forma exacta en que los recorrerá el navegador.

    Cada árbol va como cinco arrays paralelos —variable, umbral, hijo
    izquierdo, hijo derecho y valor— porque es la forma más compacta que sigue
    siendo legible en un diff. Una hoja se reconoce por tener la variable a −1.

    **La tasa de aprendizaje se multiplica aquí**, dentro del valor de cada
    hoja, en vez de dejarla como un factor aparte que el navegador tendría que
    acordarse de aplicar. Un factor que se puede olvidar es un factor que se
    olvida, y el síntoma sería un mapa entero desplazado hacia el centro sin que
    nada fallara.

    El punto de partida `init` es la probabilidad previa en log-odds: el modelo
    sin ningún árbol contesta la proporción de isla que se ha quemado alguna vez.
    """
    trees = []
    for stage in model.estimators_:
        t = stage[0].tree_
        leaf = t.children_left == -1
        trees.append(
            {
                "f": [int(-1 if leaf[i] else t.feature[i]) for i in range(t.node_count)],
                "t": [
                    (0.0 if leaf[i] else round(float(t.threshold[i]), 7))
                    for i in range(t.node_count)
                ],
                "l": [int(t.children_left[i]) for i in range(t.node_count)],
                "r": [int(t.children_right[i]) for i in range(t.node_count)],
                "v": [
                    (
                        round(float(t.value[i][0][0]) * model.learning_rate, 9)
                        if leaf[i]
                        else 0.0
                    )
                    for i in range(t.node_count)
                ],
            }
        )

    init = float(np.log(model.init_.class_prior_[1] / model.init_.class_prior_[0]))
    return {
        "kind": "gradient-boosting",
        "init": round(init, 8),
        "features": [
            {
                "name": name,
                "center": round(float(f.center[k]) if f.center is not None else 0.0, 6),
                "scale": round(float(f.scale[k]) if f.scale is not None else 1.0, 6),
                # La mediana de la isla, ya tipificada. Sirve para explicar el
                # resultado de una celda: un conjunto de árboles no tiene
                # coeficientes que leer, así que lo que la ficha del punto
                # enseña es cuánto cambia la cifra al sustituir ESE predictor
                # por el de una celda corriente, dejando los demás como están.
                "median": round(float(np.median(f.x[:, k])), 6),
            }
            for k, name in enumerate(f.names)
        ],
        "trees": trees,
    }


def importances(model: GradientBoostingClassifier, f: Features) -> list[dict]:
    """Cuánto usa el conjunto cada predictor, de 0 a 1 y sumando 1."""
    return [
        {"name": name, "importance": round(float(value), 4)}
        for name, value in sorted(
            zip(f.names, model.feature_importances_), key=lambda t: -t[1]
        )
    ]
