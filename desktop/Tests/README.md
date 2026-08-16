# Tests del escritorio

`golden-interpolation.json` lo genera `scripts/gen-golden.mjs` sobre el fixture
de la web (`src/lib/__fixtures__/weather-snapshot.json`). El test de UE
`TPJs.Golden.InterpolationParity` ejecuta el MISMO cálculo dentro de QuickJS y
exige igualdad con tolerancia 1e-6. Si la web cambia el motor, el golden se
regenera y se commitea junto con ella; nadie edita el golden a mano.
