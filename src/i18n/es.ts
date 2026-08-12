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
    /** Cuando parte del valor la pone un modelo, no un sensor. */
    validAt: 'Válido',
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

  /**
   * Puntos de interés de la red de senderos. La capa publica cinco campos y la
   * ficha los enseña los cinco, sin quedarse ninguno: es todo lo que hay.
   */
  poi: {
    source: 'Red de senderos del Cabildo Insular',
    weatherHere: 'Ver el tiempo en este punto',
    allFields: 'Ficha completa',
    rawNote: 'Todos los campos que publica la capa, tal cual llegan.',
    coords: 'Coordenadas',
    families: {
      servicios: 'Servicios',
      cultural: 'Patrimonio cultural',
      natural: 'Patrimonio natural',
    } as Record<string, string>,
    /** Etiquetas de los campos crudos, en el orden en el que llegan. */
    fields: {
      id_punto: 'Identificador',
      codigo: 'Código de ficha',
      tipo: 'Tipo',
      subtipo: 'Categoría',
      descripcion: 'Descripción',
    } as Record<string, string>,
    /** Claves en minúsculas: la fuente mezcla `Viveres_Tienda` y `Viveres_tienda`. */
    subtypes: {
      viveres_bar_rest: 'Bar o restaurante',
      viveres_tienda: 'Tienda de víveres',
      otros_agua_pot: 'Agua potable',
      otros_area_recr: 'Área recreativa',
      otros_refugio: 'Refugio',
      aloj_casa_rural: 'Casa rural',
      aloj_albergue: 'Albergue',
      aloj_otros: 'Alojamiento',
      arq_civil: 'Arquitectura civil',
      arq_religiosa: 'Arquitectura religiosa',
      arqueologico: 'Yacimiento arqueológico',
      etnog_otros: 'Elemento etnográfico',
      etnog_ref_pastoril: 'Refugio pastoril',
      toponimo: 'Topónimo',
      biol_botanica: 'Botánica',
      biol_otros: 'Fauna y flora',
      geol_botanica: 'Botánica',
      geol_barranco: 'Barranco',
      'geol_montaña': 'Montaña',
      geol_crater: 'Cráter',
      geol_cueva: 'Cueva',
      geol_otros: 'Formación geológica',
      fuente_natural: 'Fuente natural',
      otros: 'Otros',
    } as Record<string, string>,
    legend: 'Toca cualquier icono del mapa para abrir su ficha.',
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
    coverage: 'Altitudes con sensor',
    band: 'Margen (calibrado)',
    bandHint:
      'El margen no es una constante elegida a ojo: es el cuantil 68 de los errores que comete ' +
      'este mismo motor al predecir cada estación dejándola fuera del ajuste. Por construcción, ' +
      'la banda contiene el error real en 68 de cada 100 casos.',
    modelDeviation: 'Desvío de Open-Meteo',
    modelDeviationHint: (n: number) =>
      `Cuánto se aparta Open-Meteo de las ${n} estaciones donde se puede comparar. Es la ` +
      'incertidumbre que se aplica por encima del techo de la red, donde la cifra la sostiene ' +
      'el modelo y no un sensor. Se mide donde hay estaciones, casi todo por debajo de la ' +
      'inversión, que es justo donde peor lo hace un modelo global: arriba queda del lado ' +
      'conservador.',
    anchorTag: 'Open-Meteo',
    anchorHint:
      'Punto de modelo, no una estación. El Cabildo no publica ninguna medida a esta altitud.',
    anchorNote:
      'Parte de esta cifra viene de Open-Meteo, un modelo meteorológico, porque por encima ' +
      'del techo de la red del Cabildo no hay ninguna estación publicando. Las estaciones ' +
      'del Cabildo tienen siempre prioridad: el gradiente, el rechazo de anomalías y el RMSE ' +
      'se calculan solo con ellas, y el modelo únicamente rellena por encima de su techo.',
    anchorsActive: (n: number) =>
      n === 1
        ? '1 ancla de Open-Meteo sobre el techo de la red'
        : `${n} anclas de Open-Meteo sobre el techo de la red`,
    anchorsSourceTitle: 'Open-Meteo (anclas de altitud)',
    /**
     * La advertencia que faltaba. La red del Cabildo no llega a la cumbre: por
     * encima de la estación más alta que sobreviva al control de calidad, el
     * mapa deja de interpolar entre medidas y pasa a prolongar una recta. Y en
     * Canarias esa recta es justamente la que la inversión del alisio rompe:
     * por debajo el aire viene del mar de nubes, por encima está seco. El
     * Roque de los Muchachos es observatorio astronómico precisamente por eso.
     */
    ceilingWarning: (ceilingM: number, share: number) =>
      `Por encima de ${ceilingM} m no hay ninguna estación fiable: ese ${share} % de la isla ` +
      'no se interpola entre medidas, se prolonga el gradiente. La inversión del alisio ' +
      '(800–1500 m) deja arriba un aire mucho más seco y templado de lo que da esa recta, ' +
      'así que la cumbre es la zona menos de fiar del mapa.',
    /** Mismo hueco, pero ya cubierto por anclas de modelo. */
    ceilingAnchored: (ceilingM: number, share: number) =>
      `Por encima de ${ceilingM} m el Cabildo no publica ninguna estación —la que tiene en ` +
      `la cumbre lleva años muda—, así que ese ${share} % de la isla se apoya en Open-Meteo, ` +
      'un modelo, en vez de prolongar el gradiente a ciegas. Las estaciones del Cabildo ' +
      'mandan siempre por debajo de esa cota, y el gradiente y el RMSE de aquí arriba se ' +
      'siguen calculando solo con ellas.',
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
    anchorsTitle: 'Open-Meteo — anclas de altitud',
    anchorsBody:
      'La red del Cabildo tiene una estación registrada en la cumbre (Taburiente, 2316 m) ' +
      'que no publica desde mayo de 2023; lo que sigue vivo llega como mucho a 1561 m, y la ' +
      'isla sube a 2426. Por encima de esa cota se usan puntos de Open-Meteo —un modelo ' +
      'meteorológico, no una medida— para no prolongar a ciegas el gradiente por encima de la ' +
      'inversión del alisio. Las estaciones del Cabildo tienen siempre prioridad: no entran ' +
      'en el ajuste, ni en el rechazo de anomalías, ni en el RMSE, y aparecen siempre ' +
      'etiquetadas como Open-Meteo allí donde contribuyen.',
    anchorsLicense: 'CC-BY 4.0 · sin clave de API',
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
