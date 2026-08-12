/**
 * Castellano. Única lengua poblada por ahora; la estructura está lista para
 * añadir más sin tocar los componentes.
 *
 * Regla que no se negocia en las cadenas de CO₂: aquí no aparece la palabra
 * «seguro» ni ninguna variante. Se dice el valor y la hora, nada más.
 */

export const es = {
  app: {
    name: 'Tiempo Palmero',
    tagline: 'Meteorología interpolada de La Palma',
    subtitle: 'Sensores del Cabildo Insular · malla interpolada',
  },

  loading: {
    dem: 'Cargando modelo de elevación',
    stations: 'Cargando estaciones',
    tiles: (done: number, total: number) => `Relieve: ${done}/${total} teselas`,
  },

  layers: {
    title: 'Capas',
    grid: 'Malla interpolada',
    stations: 'Estaciones meteorológicas',
    air: 'Calidad del aire',
    co2: 'Sensores de CO₂',
    sky: 'Calidad del cielo',
    trails: 'Senderos y puntos de interés',
    fire: 'Cámaras de incendios',
    hillshade: 'Relieve sombreado',
  },

  variables: {
    title: 'Variable',
    temperature: 'Temperatura',
    relativehumidity: 'Humedad relativa',
    dewpoint: 'Punto de rocío',
    derivedHint:
      'El punto de rocío se calcula a partir de la temperatura y la humedad, no se interpola por separado: solo 10 de las 52 estaciones lo publican con datos frescos. Aquí sale de las estimadas para este punto; en cada pin, de las que mide esa estación. Así las tres cifras nunca se contradicen entre sí.',
    wind: 'Viento',
    precipitation: 'Precipitación',
    pressure: 'Presión',
    uv: 'Índice UV',
  },

  units: {
    celsius: '°C',
    percent: '%',
    kmh: 'km/h',
    hpa: 'hPa',
    ppm: 'ppm',
    metres: 'm',
    km: 'km',
    magArcsec: 'mag/arcsec²',
  },

  point: {
    title: 'Punto seleccionado',
    elevation: 'Altitud',
    municipality: 'Municipio',
    outsideIsland: 'Fuera de la isla',
    estimated: 'estimado',
    derived: 'calculado',
    measured: 'medido',
    notAMeasurement: 'Valor estimado, no medido',
    uncertainty: 'Margen',
    measuredAt: 'Medido',
    measuredAtHint:
      'Antigüedad de las lecturas que sostienen esta cifra, ponderada igual que el valor. No es cuándo se descargaron los datos.',
    oldestContribution: 'la más antigua',
    staleWarning:
      'Las lecturas que sostienen esta cifra tienen más de una hora. El tiempo puede haber cambiado.',
    contributors: 'Estaciones que más contribuyen',
    distance: 'Distancia',
    elevationDelta: 'Δ altitud',
    weight: 'Peso',
    nearestOnly: 'Medido, no interpolado',
    islandMedian: 'niv. del mar, mediana de la red',
    pressureHint:
      'La presión reducida al nivel del mar apenas varía en 42 km de isla, pero los barómetros de la red se desvían entre sí hasta 39 hPa. Interpolarla dibujaría errores de calibración, no tiempo: se da la mediana, que es robusta a los sensores descalibrados.',
    uvHint:
      'El índice UV depende sobre todo de la nubosidad, que en esta isla cambia de una vertiente a otra. Se da la estación más cercana, sin interpolar.',
    noInterpolation:
      'No se interpola: el viento y la lluvia son locales. Se muestra la estación más cercana, tal cual.',
    extrapolated: 'Sin estaciones dentro de 15 km: valor extrapolado.',
    elevationExtrapolated:
      'La altitud de este punto queda fuera del rango que cubre la red de sensores.',
    close: 'Cerrar',
    searchPlaceholder: 'Buscar un lugar de la isla',
    noResults: 'Sin resultados',
    tapHint: 'Toca cualquier punto del mapa para calcular su tiempo',
  },

  nearby: {
    title: 'Cerca de aquí',
    loading: 'Buscando…',
    empty: 'No hay nada catalogado en el entorno de este punto.',
    showMore: (n: number) => (n === 1 ? 'Ver 1 más' : `Ver ${n} más`),
    kinds: {
      trail: 'Sendero',
      trailPoi: 'Punto del sendero',
      recreation: 'Zona recreativa',
      tourism: 'Interés turístico',
      culture: 'Interés cultural',
      history: 'Interés histórico',
      busStop: 'Parada de guagua',
      charging: 'Recarga eléctrica',
    } as Record<string, string>,
    guaguaNoTimetable: (until: string) =>
      `Se indican las líneas que paran, no los horarios: el archivo de horarios de TILP no se actualiza desde el ${until}. Consulta a TILP antes de contar con una guagua.`,
    guaguaSource: 'tilp.es',
    guaguaSourceUrl: 'https://www.tilp.es/',
  },

  station: {
    lastReading: 'Última lectura',
    age: 'Antigüedad',
    elevation: 'Altitud (modelo de elevación)',
    allValues: 'Valores registrados',
    derivedValue:
      'Esta estación no publica esta columna: la cifra sale de su propia temperatura y humedad, no de las estaciones vecinas.',
    fresh: 'En directo',
    recent: 'Hace horas',
    dead: 'Sin señal',
    pressureReduced:
      'Esta estación publica la presión absoluta de su altitud, no reducida al nivel del mar como el resto de la red. Aquí se muestra ya reducida, para que sea comparable.',
    excludedByQc: 'Excluida por el control de calidad',
    excludedReason: (sigmas: number) =>
      `Su lectura se desvía ${sigmas.toFixed(1)}σ del ajuste altitudinal. No entra en la interpolación.`,
  },

  model: {
    title: 'Modelo',
    stationsUsed: (used: number, total: number) => `${used} de ${total} estaciones activas`,
    dataAge: 'Medida más reciente',
    fetchAge: 'Última consulta',
    lapseRate: 'Gradiente medido',
    lapseRateUnit: '°C/km',
    r2: 'R² del ajuste',
    rmse: 'RMSE (validación)',
    rejected: (n: number) =>
      n === 1 ? '1 sensor descartado por anomalía' : `${n} sensores descartados por anomalía`,
    explainTitle: '¿Cómo se calcula?',
    explain:
      'Se mide el gradiente altitudinal real con las estaciones activas, se descartan las anómalas, ' +
      'se interpolan los residuos por distancia inversa y se devuelve la tendencia a la altitud del punto, ' +
      'tomada del modelo de elevación.',
    validationNote:
      'RMSE de validación leave-one-out sobre el último conjunto de estaciones fiables.',
  },

  air: {
    title: 'Calidad del aire',
    pointMeasurement: 'Medida puntual',
    neverInterpolated:
      'La calidad del aire no se interpola nunca: es una medida del punto donde está el sensor, no de su entorno.',
    index: 'Índice',
    level: 'Nivel',
    noData: 'Sin datos recientes',
  },

  co2: {
    title: 'Sensores de CO₂',
    subtitle: 'Puerto Naos y La Bombilla · red DEMASE',
    reading: 'Lectura',
    at: 'Hora de la medida',
    noData: 'Sin datos',
    noDataDetail: 'Este sensor no ha transmitido en los últimos 15 minutos.',
    networkDown: 'La red de sensores de CO₂ no responde.',
    networkDownDetail:
      'No se muestra ninguna lectura anterior. Consulta la fuente oficial del Cabildo.',
    neverInterpolated:
      'Nunca se interpola ni se colorea el área entre sensores. Cada punto es la medida de ese sensor y de ningún otro sitio.',
    officialSource: 'Información oficial del Cabildo Insular',
    officialSourceUrl: 'https://www.cabildodelapalma.es/',
    sensorsReporting: (fresh: number, total: number) =>
      `${fresh} de ${total} sensores transmitiendo`,
    height: 'Altura del sensor',
    lastSeen: 'Última transmisión',
  },

  fire: {
    title: 'Cámaras de incendios',
    alert: 'Alerta activa',
    noAlert: 'Sin alerta',
    noTimestamp:
      'Esta red no publica ninguna marca de tiempo. La antigüedad se mide desde nuestra propia consulta.',
    lastPolled: 'Consultado',
    onlyFour: 'Solo existen 4 cámaras. La ausencia de alerta no prueba que no haya fuego.',
  },

  sky: {
    title: 'Calidad del cielo',
    magnitude: 'Brillo del cielo',
    darker: 'más alto = más oscuro',
    mostlyDead:
      'La mayor parte de la red de fotómetros lleva más de un mes sin transmitir. Solo se muestran los activos.',
  },

  freshness: {
    justNow: 'ahora mismo',
    minutes: (n: number) => `hace ${n} min`,
    hours: (n: number) => (n === 1 ? 'hace 1 h' : `hace ${n} h`),
    days: (n: number) => (n === 1 ? 'hace 1 día' : `hace ${n} días`),
  },

  errors: {
    upstreamDown: 'El servicio de datos del Cabildo no responde',
    upstreamDownDetail:
      'Es una caída temporal del servidor de origen, no una falta de datos. Se reintenta solo.',
    retry: 'Reintentar',
    demFailed: 'No se pudo cargar el modelo de elevación',
    demFailedDetail:
      'Sin él no hay corrección altimétrica, y sin corrección altimétrica no hay estimación fiable.',
    noStations: 'Ninguna estación pasa el control de calidad ahora mismo',
  },

  sources: {
    title: 'Fuentes de datos',
    open: 'Fuentes',
    intro:
      'Tiempo Palmero solo usa datos abiertos. Estas son todas las fuentes, con su licencia.',
    dataTitle: 'Datos meteorológicos, de aire y de sensores',
    dataBody:
      'Cabildo Insular de La Palma — Servicio de Transformación Digital (La Palma Smart Island).',
    dataLicense: 'CC-BY 4.0',
    boundariesTitle: 'Límites municipales e insular',
    boundariesBody: 'Cabildo Insular de La Palma. Reproyectados de EPSG:32628 a WGS84.',
    boundariesLicense: 'ODC-BY',
    co2Title: 'Red de sensores de CO₂',
    co2Body:
      'DEMASE, red de alerta de CO₂ exterior de Puerto Naos y La Bombilla, publicada a través del portal del Cabildo.',
    toponymsTitle: 'Topónimos',
    toponymsBody:
      '© colaboradores de OpenStreetMap. Extraídos una sola vez en tiempo de compilación mediante Overpass; la aplicación no consulta OpenStreetMap en tiempo de ejecución.',
    toponymsLicense: 'ODbL 1.0',
    demTitle: 'Modelo de elevación y relieve',
    demBody:
      'Mapzen Terrain Tiles (formato terrarium), servidas por AWS Open Data. Derivadas de NASA SRTM, NASADEM, USGS 3DEP y EU-DEM. Las mismas teselas generan el sombreado del relieve y las altitudes del cálculo.',
    demLicense: 'Dominio público / CC-BY',
    codeTitle: 'Código',
    codeBody: 'Software libre. El motor de interpolación y sus pruebas son públicos.',
    noTrackingTitle: 'Sin rastreo',
    noTrackingBody:
      'Sin cookies, sin analítica de terceros y sin publicidad. La pantalla de CO₂ no lleva ni llevará publicidad ni muro de pago.',
  },

  common: {
    back: 'Volver',
    of: 'de',
    unknown: 'desconocido',
    none: 'ninguna',
  },
} as const

export type Strings = typeof es
