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

  /**
   * La barra de la primera visita. Dice CAPAS y no «datos» porque lo que se
   * está esperando son las capas que la aplicación trae encendidas de fábrica,
   * y quien quiera menos espera sabe dónde apagarlas.
   */
  firstLoad: {
    label: (done: number, total: number) => `Preparando capas · ${done}/${total}`,
  },

  layers: {
    title: 'Capas',
    wind: 'Viento animado',
    grid: 'Malla interpolada',
    stations: 'Estaciones meteorológicas',
    air: 'Calidad del aire',
    co2: 'Sensores de CO₂',
    sky: 'Calidad del cielo',
    trails: 'Senderos y puntos de interés',
    // Una sola casilla, y no dos. Fueron dos durante un rato —una por capa— y
    // leídas seguidas parecían la misma entrada repetida. Juntas se entienden
    // como lo que son: la red, con sus trazados y sus paradas. Que las paradas
    // aparezcan al acercarse ya lo resuelve el zoom mínimo de su capa, así que
    // el interruptor único no inunda el mapa de puntos.
    guagua: 'Red de guaguas',
    roads: 'Carreteras insulares',
    osmRoads: 'Viario completo (OSM)',
    tdt: 'Cobertura TDT (simulada)',
    counters: 'Aforos de tráfico y senderos',
    fire: 'Cámaras de incendios',
    // Debajo de las de incendios porque dos de estos emplazamientos SON esas
    // torres: la misma caseta, una con la térmica y otra con la panorámica.
    webcams: 'Webcam de la isla',
    hillshade: 'Relieve sombreado',
  },

  variables: {
    title: 'Variable',
    /**
     * Qué hace la casilla de la malla, dicho debajo de la casilla.
     *
     * Encendida no hace falta explicar nada —se ve—, así que solo habla cuando
     * está apagada, que es cuando el panel enseña una escala de color que en el
     * mapa no está en ninguna parte.
     */
    gridOff:
      'Apagada: el mapa enseña el fondo, sin color de la variable. Elegir cualquier variable la vuelve a encender.',
    /**
     * Lo experimental colorea la isla pero no tiene chip, así que con el índice
     * de incendio encendido esta sección enseñaba una escala de color sin un
     * solo botón marcado. Esta línea dice de quién es esa escala y cómo salir.
     */
    experimentalActive: (label: string) =>
      `La malla está enseñando «${label}», de la sección Experimental. Por eso no hay ningún chip marcado: no es una variable medida.`,
    backToTemperature: 'Volver a la temperatura',
    temperature: 'Temperatura',
    relativehumidity: 'Humedad relativa',
    dewpoint: 'Punto de rocío',
    vpd: 'Déficit de vapor',
    vpdBands: {
      humid: 'Aire cargado',
      comfortable: 'Cómodo',
      demanding: 'Exigente',
      stress: 'Estrés',
    },
    vpdBandsHint:
      'Tramos de manejo de invernadero, no umbrales medidos en La Palma.',
    vpdHint:
      'El VPD mide la sed del aire: cuánto vapor le falta para saturarse. Se calcula de la temperatura y la humedad, no se interpola aparte. Dice lo que la humedad relativa esconde — 80 % a 12 °C son 0,28 kPa y 80 % a 28 °C son 0,76, casi el triple de demanda con el mismo número en pantalla.',
    derivedHint:
      'El punto de rocío se calcula a partir de la temperatura y la humedad, no se interpola por separado: solo 10 de las 52 estaciones lo publican con datos frescos. Aquí sale de las estimadas para este punto; en cada pin, de las que mide esa estación. Así las tres cifras nunca se contradicen entre sí.',
    co2: 'CO₂ del suelo',
    co2Local: 'Solo Puerto Naos, La Bombilla y su entorno',
    co2Hint:
      'Concentración de CO₂ medida por la red DEMASE. No se promedia entre sensores: cada punto del mapa enseña la lectura del sensor más cercano, y solo hasta 80 m. Fuera de la zona vigilada no hay ni un sensor de CO₂ en la isla, así que no se pinta nada.',
    co2Scope:
      'La red cubre la zona vigilada del oeste. En el resto de la isla no hay sensores de CO₂ —la red de calidad del aire del Cabildo no mide esta variable— y el único dato disponible es el fondo atmosférico del modelo CAMS, unos 437 ppm iguales para toda la isla.',
    co2NoAverage:
      'Sin promediar: el color de cada punto es la medida de un sensor a menos de 80 m.',
    coverage: 'Cobertura móvil (2013)',
    coverageLocal: 'Sondeo de campo de 2013 · no es la cobertura de hoy',
    coverageHint:
      'Nivel de señal GSM medido por el Cabildo recorriendo la isla en noviembre y diciembre de 2013. Son las 669 medidas que existen: no hay ninguna posterior. Las sombras que dibuja son de relieve y siguen ahí, pero el despliegue de red ha cambiado por completo desde entonces —en 2013 no había 4G, ni 5G, y la erupción de 2021 se llevó parte de la red del oeste—. No se promedia entre medidas: cada punto toma la más cercana, hasta 600 m.',
    coverageScope:
      'El sondeo siguió las carreteras, así que lo que no se recorrió se queda sin color: no es que no haya cobertura, es que allí nadie midió. Las antenas que dan esa señal —incluidas las 32 de televisión digital— se encienden aparte, en «Sitios de interés».',
    fire: 'Índice de incendio (experimental)',
    fireLocal: 'Modelo experimental · no es un aviso oficial',
    fireHint:
      'Índice relativo de 0 a 100 que combina dos cosas medidas por separado: dónde se ha quemado esta isla —un clasificador entrenado con los cinco incendios con perímetro publicado entre 2009 y 2023— y cómo de excepcional es el tiempo de hoy, en percentil sobre veinticuatro años de archivo. No es una probabilidad: sirve para ordenar sitios y días entre sí, no para leer «un 40 % de posibilidades».',
    fireScope:
      'No sustituye a nada. Los avisos de riesgo de incendio, las alertas y las prohibiciones las publica el Cabildo Insular y el Gobierno de Canarias, y son lo que hay que mirar. Esto es una capa experimental que enseña la geografía de lo ya quemado puesta al día de hoy.',
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
    kpa: 'kPa',
    mm: 'mm',
    mmDay: 'mm/día',
    ppm: 'ppm',
    metres: 'm',
    km: 'km',
    magArcsec: 'mag/arcsec²',
    dbm: 'dBm',
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
    /**
     * Lo que dice la hoja del móvil cuando todavía no se ha tocado nada.
     *
     * Es la única superficie de la app que está en pantalla sin haber pedido
     * nada, así que tiene que explicar qué se gana tocando el mapa en vez de
     * quedarse en blanco.
     */
    tapPrompt: 'Toca el mapa',
    tapPromptHint: 'para calcular el tiempo de ese punto',
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
      viewpoint: 'Mirador',
      culture: 'Interés cultural',
      history: 'Interés histórico',
      busStop: 'Parada de guagua',
      water: 'Infraestructura hídrica',
      lighthouse: 'Faro',
      antenna: 'Antena de telecomunicaciones',
      charging: 'Recarga eléctrica',
    } as Record<string, string>,
    guaguaNoTimetable: (until: string) =>
      `Las horas de paso salen del último horario que publicó TILP, del ${until}, que no se ha renovado. Pincha la parada en el mapa para verlas, y compruébalas con TILP antes de contar con una guagua.`,
    guaguaSource: 'tilp.es',
    guaguaSourceUrl: 'https://www.tilp.es/',
  },

  /**
   * Sitios que publica el Cabildo, encendibles uno a uno desde la barra.
   */
  places: {
    title: 'Sitios de interés',
    hint: 'Capas del Cabildo. Se descargan al encenderlas y se pinchan para ver la ficha completa.',
    source: 'Capas del Cabildo Insular de La Palma (CC-BY 4.0).',
    openLink: 'Abrir',
    kinds: {
      tourism: 'Interés turístico',
      viewpoint: 'Miradores',
      culture: 'Interés cultural',
      history: 'Interés histórico',
      recreation: 'Zonas recreativas',
      water: 'Agua: balsas, nacientes, pozos y galerías',
      lighthouse: 'Faros',
      antenna: 'Antenas: TDT, telefonía, radio y Tetra',
      charging: 'Recarga eléctrica',
    } as Record<string, string>,
    /** Etiquetas de los campos crudos; lo que no esté aquí sale con su nombre. */
    fields: {
      id: 'Identificador',
      nombre: 'Nombre',
      municipio: 'Municipio',
      tipo: 'Tipo',
      subtipo: 'Categoría',
      clase: 'Clase',
      origen: 'Capa de origen',
      capacidad: 'Capacidad',
      altitud_m: 'Altitud',
      paraje: 'Paraje',
      estado: 'Estado',
      comarca: 'Comarca',
      tipo_red: 'Red',
      categoria_lista: 'Categoría',
      tipo_recurso: 'Tipo de recurso',
      tipo_ingreso: 'Acceso',
      accesible: 'Accesibilidad',
      descripcion: 'Descripción',
      direccion: 'Dirección',
      telefono: 'Teléfono',
      email: 'Correo',
      web: 'Web',
      web_externa: 'Web',
      url_ficha: 'Ficha',
      url_imagen: 'Imagen',
      horario: 'Horario',
      acceso: 'Acceso',
      transporte: 'Transporte',
      figura_protegida: 'Figura de protección',
      permisos: 'Permisos',
      capacidad_personas: 'Capacidad',
      area_m2: 'Superficie (m²)',
      propietario: 'Titular',
      prioridad: 'Prioridad',
      ref_catastral: 'Referencia catastral',
      longitud: 'Longitud',
      latitud: 'Latitud',
    } as Record<string, string>,
  },

  /**
   * Carreteras. La capa dice de dónde a dónde va cada tramo y cuánto mide, y
   * eso es todo lo que dice: no hay estado del firme, ni cortes, ni obras. Lo
   * que no está aquí es porque no está en el dato.
   */
  roads: {
    ownerLabel: (owner: string) =>
      owner === 'insular' ? 'Titularidad insular' : `Titularidad: ${owner}`,
    officialLength: 'Longitud oficial',
    gisLength: 'Longitud del trazado',
    gisHint:
      'Medida sobre la línea dibujada. La diferencia con la oficial es del propio inventario del Cabildo.',
    cartoColor: 'Color cartográfico',
    cartoHint: 'El color con el que la cartografía oficial dibuja la vía; aquí no se usa.',
    weatherHere: 'El tiempo en este punto de la vía',
    note: 'La capa no publica estado del firme, cortes ni obras.',
    source: 'Red de carreteras de la isla de La Palma — Cabildo Insular (CC-BY 4.0).',
  },

  /**
   * Aforos de tráfico y de senderos.
   *
   * Regla de estas cadenas: la cifra grande es siempre la del DÍA, y va dicho
   * que el día está a medias. El «pulso» de cinco minutos se enseña como lo que
   * es —la prueba de que el aparato está vivo ahora mismo— y nunca como un
   * total. Confundirlos es contar trece coches en la entrada de Santa Cruz.
   */
  counters: {
    title: 'Aforo',
    kinds: {
      road: 'Aforo de carretera',
      trail: 'Acceso a sendero',
    } as Record<string, string>,
    types: {
      coches: 'Coches',
      motos: 'Motos',
      pesados: 'Vehículos pesados',
      bicicletas: 'Bicicletas',
      peatones: 'Peatones',
      vehiculos: 'Vehículos',
    } as Record<string, string>,
    todayTotal: 'Pasos contados hoy',
    todayHint: 'Acumulado del día en curso: sigue subiendo hasta medianoche.',
    inProgress: 'día en curso',
    noToday: 'Hoy este aforo todavía no ha publicado ningún dato.',
    silent: 'Sin datos hoy',
    lastPulse: 'Último intervalo publicado',
    pulseAt: 'Hora',
    pulseHint:
      'La fuente publica cada pocos minutos lo que ha pasado en ese intervalo. Sirve para saber que el aparato está vivo, no para contar el día.',
    noPulse: 'Este aforo no ha dado señal en lo que va de día.',
    channels: 'Qué se cuenta aquí',
    direction: (from: string, to: string) => `${from} → ${to}`,
    incoming: 'Entrando',
    outgoing: 'Saliendo',
    notPublished: 'no se publica',
    oneWayNote:
      'En los aforos de carretera el contador de peatones publica un solo sentido; el otro llega vacío. Aquí un sentido vacío no se suma como cero: no se suma.',
    week: 'Los últimos días',
    weekHint: 'Total de pasos por día, sumando todos los contadores del sitio.',
    average: 'Media de los días completos',
    weatherHere: 'El tiempo en este aforo',
    pulseNote:
      'Las cifras del día vienen del archivo diario del Cabildo, que incluye el día en curso. El intervalo de arriba viene del endpoint «del día en curso», que pese al nombre publica solo los últimos minutos.',
    census: (live: number, week: number, registered: number) =>
      `${live} aforos publicando hoy · ${week} con datos esta semana · ${registered} registrados`,
    censusHint: (channels: number, sites: number) =>
      `El registro del Cabildo tiene ${channels} contadores en ${sites} emplazamientos. La diferencia no es un fallo de esta aplicación: son aparatos dados de alta que llevan sin transmitir más de una semana.`,
    markerLabel: (name: string, count: string) => `${name}: ${count} pasos hoy`,
    markerSilent: (name: string) => `${name}: sin datos hoy`,
    loading: 'Pidiendo los aforos…',
    error: 'Los aforos del Cabildo no responden ahora mismo.',
    source: 'Conteo de tráfico y de senderos — Cabildo Insular de La Palma (CC-BY 4.0).',
  },

  /**
   * Red de guaguas de TILP.
   *
   * Regla de estas cadenas, hermana de la del CO₂: aquí no aparece nunca una
   * hora de paso presentada como vigente. El archivo de horarios de TILP venció
   * el 25 dic 2025, así que todo lo que salga de él va etiquetado como «última
   * tabla publicada» y con la fecha delante. Lo que sí se puede afirmar en
   * presente es la red: qué líneas hay, por dónde van y dónde paran.
   */
  /**
   * La cobertura de TDT. Cada cadena de aquí lleva encima la misma obligación:
   * decir que es una SIMULACIÓN de los repetidores, de 2018, y no un mapa de
   * dónde se ve la televisión. Es la diferencia entre un dato y una promesa.
   */
  tdt: {
    title: 'Televisión digital terrestre',
    layer: 'Cobertura TDT (simulada)',
    simulated: 'Simulación del Cabildo',
    repeaters: (n: number) =>
      n >= 3 ? 'la alcanzan 3 repetidores o más' : n === 2 ? 'la alcanzan 2 repetidores' : 'la alcanza 1 repetidor',
    notHereButNear: 'aquí no, pero sí a menos de 300 m',
    outside: 'fuera de las 49 simulaciones',
    note:
      'Cálculo de propagación de los 49 sectores de repetidor que publica el Cabildo (KMZ de 2018), en celdas de 92 m. No es una medida, no incluye el centro emisor principal y no dice con qué calidad se recibe: quedar fuera no significa que allí no llegue la señal.',
    loading: 'Cargando la simulación de cobertura…',
    failed: 'No se ha podido cargar la cobertura TDT. Apaga y vuelve a encender la casilla para reintentar.',
    legend:
      'Violeta: donde el cálculo del Cabildo dice que llega algún repetidor de TDT. Cuanto más intenso, más repetidores alcanzan el sitio —de uno a tres o más—. Cubre el 51,6 % de la isla; el resto no es «sin televisión», es sin simulación de repetidor. Recortado a la línea de costa: el cálculo pinta también mar abierto.',
  },

  /**
   * El viario de OSM. Los tres avisos existen porque sin ellos la capa parece
   * rota: tarda en llegar, a zoom de isla enseña poco más de lo que ya había, y
   * si falla la descarga la casilla se queda marcada sobre un mapa idéntico.
   */
  viario: {
    loading: 'Cargando el viario de la isla (5,2 MB)…',
    failed: 'No se ha podido cargar el viario. Apaga y vuelve a encender la casilla para reintentar.',
    zoomForTracks:
      'Las 14.003 pistas y accesos se dibujan a partir de cierto acercamiento: a esta distancia serían una telaraña. Acércate y aparecen.',
    legend:
      'Carreteras, calles y pistas de OpenStreetMap: 19.770 trazados y 3.373 km, frente a los 61 tramos que publica el Cabildo. La línea discontinua es pista de tierra. No se pincha: la ficha de una carretera sale del dato del Cabildo.',
  },

  guagua: {
    zoomForStops:
      'Las 913 paradas se dibujan a partir de cierto acercamiento: a esta distancia serían una mancha. Acércate y aparecen.',
    stopTitle: 'Parada de guagua',
    routeTitle: 'Línea de guagua',
    operator: 'TILP · Transportes Insulares La Palma',
    stopCode: 'Código de parada',
    linesHere: 'Líneas que paran aquí',
    noLines: 'No se ha podido cargar qué líneas paran aquí.',
    showRoute: 'Ver el recorrido en el mapa',
    destinations: 'Destinos',
    stopsCount: 'Paradas',
    length: 'Trazado más largo',
    lengthHint: 'De los dos sentidos y sus variantes, el más largo.',
    routeStops: (n: number) => (n === 1 ? '1 parada' : `${n} paradas`),
    serviceTitle: 'Servicio de la última tabla publicada',
    departures: 'Salidas',
    trips: 'Viajes',
    weekday: 'Laborables',
    saturday: 'Sábados',
    sunday: 'Domingos',
    window: 'Franja',
    windowValue: (first: string, last: string) => `de ${first} a ${last}`,
    noWindow: 'sin horas legibles',
    levels: {
      frequent: 'Servicio frecuente',
      regular: 'Servicio regular',
      sparse: 'Servicio escaso',
      none: 'Sin servicio en la tabla',
    } as Record<string, string>,
    /** El aviso que justifica todo lo anterior. Nunca se omite. */
    expired: (until: string) =>
      `Estas cifras salen del último horario que publicó TILP, vencido el ${until} y sin renovar desde entonces. ` +
      'Es la tabla que sigue en la calle, pero no está garantizada: ' +
      'antes de contar con una guagua, compruébala con TILP.',
    notExpired: (until: string) => `Horario de TILP vigente hasta el ${until}.`,
    operatorLink: 'Horarios vigentes en tilp.es',
    operatorUrl: 'https://www.tilp.es/',
    wheelchair: 'Accesibilidad',
    wheelchairStates: {
      accessible: 'Con embarque en silla de ruedas',
      notAccessible: 'Sin embarque en silla de ruedas',
      unknown: 'Sin información de accesibilidad',
    } as Record<string, string>,
    /** Medido sobre las 913 paradas del GTFS el 12 ago 2026. */
    wheelchairNote:
      'Dato de TILP. En toda la isla no hay ninguna parada declarada accesible: 675 constan como no accesibles y 238 sin información.',
    timetable: 'Horas de paso de esa misma tabla',
    timetableToggle: (n: number) => `Ver las ${n} horas de paso`,
    timetableHide: 'Ocultar las horas',
    timetableNote:
      'Son las horas de la última tabla publicada por TILP, la misma que sigue en la calle porque no se ha renovado. Se dan como referencia, no como garantía: compruébalas con TILP antes de contar con una guagua.',
    weatherHere: 'Ver el tiempo en esta parada',
    source: 'Paradas, líneas y horarios: GTFS de TILP publicado por el Cabildo Insular de La Palma.',
    // Esta cadena existía desde el principio y no la enseñaba nadie: el estado
    // de carga se calculaba y se tiraba. Son 1,5 MB, y decir cuántos es la
    // diferencia entre «no pasa nada» y «está llegando».
    loading: 'Descargando la red de guaguas (1,5 MB)…',
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
      clase: 'Clase',
      origen: 'Capa de origen',
      capacidad: 'Capacidad',
      altitud_m: 'Altitud',
      paraje: 'Paraje',
      estado: 'Estado',
      comarca: 'Comarca',
      tipo_red: 'Red',
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
    // Esta ficha ACUSABA a la estación. Decía «excluida por el control de
    // calidad» y daba las sigmas como si fueran un veredicto sobre el sensor,
    // cuando lo único que miden es que la lectura no encaja en una recta —y
    // esa recta, en 29 de las 49 horas del archivo del 13 ago 2026, no
    // explicaba nada—. Ahora dice lo que de verdad pasa, que es una cosa del
    // ajuste y no del aparato.
    excludedByQc: 'Fuera del ajuste de esta pasada',
    excludedReason: (sigmas: number) =>
      `Su lectura se separa ${sigmas.toFixed(1)}σ de la recta altitudinal de ahora mismo, así que no entra en ella. No es un diagnóstico del sensor: un sitio abrigado o el borde de una entrada de calima se separan de la recta midiendo bien.`,
    /**
     * La cumbre no es del Cabildo, y eso tiene consecuencias visibles: no hay
     * archivo horario que enseñar ni diagnóstico de avería que calcular sobre
     * él. Se dice en la ficha en vez de dejar un hueco donde siempre hay una
     * gráfica, que es lo que parecería un fallo de la aplicación.
     */
    tngNetwork:
      'Estación del Telescopio Nazionale Galileo (INAF), no de la red del Cabildo. Es la única medida real por encima de los 1.561 m que publica la red insular, y por eso el mapa la usa para anclar la cumbre. El Cabildo no archiva su serie, así que aquí no hay histórico ni diagnóstico de avería: solo la lectura de ahora.',
  },

  /**
   * Averías de sensor. Una avería SIEMPRE se explica con la cifra que la
   * delata: «salta 16,2 °C» se puede comprobar en la gráfica, «sensor
   * defectuoso» hay que creérselo.
   */
  health: {
    title: 'Salud de la red',
    faulty: 'Sensor averiado',
    faultyShort: 'averiado',
    checking: 'Revisando el archivo de las últimas 48 h…',
    unavailable:
      'El archivo del Cabildo no responde, así que esta vez no se ha podido revisar el pasado de los sensores. No se marca ninguna avería porque no se ha podido mirar, no porque no las haya.',
    allSound: (n: number) => `Las ${n} estaciones revisadas se comportan bien.`,
    summary: (faulty: number, examined: number) =>
      `${faulty} de ${examined} estaciones revisadas dan series imposibles`,
    windowNote: (hours: number) =>
      `Cada estación se juzga por sus últimas ${hours} h, no por su última lectura: una avería intermitente se esconde en una ventana corta.`,
    excludedFromModel:
      'No entra en la interpolación. En su sitio, el mapa enseña lo que estiman las estaciones sanas de alrededor.',
    fallbackTag: 'Estimación del modelo',
    fallbackNote:
      'Este número NO lo ha medido esta estación: es lo que el modelo calcula en su punto con las estaciones sanas vecinas. Por eso lleva tilde y banda de error.',
    fault: {
      jump: (c: number) => `Salta ${c.toFixed(1)} °C entre dos lecturas seguidas`,
      stuck: (n: number) => `Lleva ${n} lecturas clavada en el mismo valor`,
      incoherent: (c: number) =>
        `Su desvío respecto al resto de la isla se mueve ±${c.toFixed(1)} °C`,
      impossible: (c: number) => `Ha publicado ${c.toFixed(1)} °C, fuera de lo posible`,
    },
    faultWhy: {
      jump: 'El aire de la isla puede cambiar deprisa —la entrada de calima del 13 de agosto movió 6 °C en quince minutos— pero no así. El umbral está en 12 °C, por encima del mayor salto real medido en el archivo.',
      stuck: 'Un sensor que repite el mismo valor durante horas no está midiendo: está atascado.',
      incoherent:
        'Lo normal es que una estación esté siempre un poco más caliente o más fría que el gradiente de la isla, porque su sitio es así. Lo que no puede es cambiar de desvío: eso significa que no describe ningún sitio.',
      impossible: 'La cifra se sale de lo que la isla admite físicamente.',
    },
  },

  /**
   * La curva de un punto sin sensor. Todo lo que se dice aquí insiste en lo
   * mismo: es una estimación, no una medida. La gráfica de una estación y ésta
   * se parecen demasiado como para dejarlo implícito.
   */
  pointHistory: {
    title: 'Evolución estimada',
    rebuilding: 'Rehaciendo el modelo hora a hora…',
    unavailable: 'El archivo del Cabildo no responde ahora mismo.',
    max: 'Máxima estimada',
    min: 'Mínima estimada',
    band: 'Banda media',
    bandHint:
      'Media de la incertidumbre de todos los instantes reconstruidos, y el peor de ellos.',
    rebuilt: 'Reconstrucción',
    fits: (n: number) => `${n} ajustes completos`,
    note: 'Aquí no hay ningún sensor: cada punto de esta curva es un ajuste del gradiente de la isla rehecho con las estaciones que publicaban en ese instante. Validado dejando fuera una estación y reconstruyendo su sitio, el error típico es de 1,6 °C a lo largo de 24 h.',
    aboveCeiling:
      'Parte del intervalo queda por encima de la altitud más alta que medía la red en ese momento: ahí la curva es una extrapolación, no una interpolación.',
    tooFewStations:
      'En este intervalo no hubo bastantes estaciones publicando a la vez como para ajustar el gradiente de la isla.',
  },

  /** Estaciones que existen pero no llegan al mapa, y por qué. */
  hidden: {
    title: 'Fuera del mapa',
    summary: (n: number) => `${n} estaciones no se dibujan`,
    stale: (n: number, hours: number) =>
      `${n} llevan más de ${hours} h sin transmitir`,
    noMetric: (n: number) => `${n} transmiten pero sin temperatura`,
    offIsland: (n: number) => `${n} dan coordenadas fuera de la isla`,
    implausible: (n: number) => `${n} publican una temperatura imposible`,
    note: 'Siguen contando en el denominador de «X de Y estaciones activas»: el mapa enseña las que puede, no las que hay.',
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
    /**
     * La cumbre. Se dice aparte de las anclas y con otra etiqueta a propósito:
     * lo que sostiene el mapa ahí arriba deja de ser un modelo y pasa a ser un
     * termómetro, y esa diferencia es exactamente la que el resto del panel se
     * esfuerza en no borrar.
     */
    summitTag: 'Roque de los Muchachos',
    summitActive: 'medida real a 2.387 m sobre el techo de la red',
    summitHint:
      'La estación del Telescopio Nazionale Galileo mide de verdad a 2.387 m, y es la única que lo hace: la red del Cabildo se queda en 1.561 m y por encima de 1.500 m publica una sola estación. Su lectura ancla la cumbre en lugar del modelo. No entra en el ajuste —el gradiente, el rechazo y el RMSE siguen siendo solo del Cabildo— y por debajo del techo de la red no pesa nada. Si el observatorio no contesta, ahí arriba vuelve a mandar Open-Meteo.',
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
    /**
     * El ajuste no se sostiene ahora mismo.
     *
     * No es un fallo de la aplicación ni de los sensores: hay días —entradas
     * de calima, föhn del este— en que la isla se parte en dos masas de aire y
     * una sola recta contra la altitud no puede describir las dos. Medido el
     * 13 ago 2026: R²=0,000 y un gradiente de +0,2 °C/km sobre 35 estaciones
     * de 12 a 1561 m, con 30 °C en el oeste y 20 °C en el este a la misma
     * cota. Se dice, y además se suspende el rechazo de outliers, que contra
     * una recta así no significa nada.
     */
    weakFit: (r2: number) =>
      `La altitud explica hoy muy poco de la temperatura (R²=${r2.toFixed(3)}). Pasa cuando la isla se parte en dos masas de aire —calima, viento del este— y una sola recta no describe las dos vertientes. Mientras dure, la malla se apoya casi solo en las estaciones cercanas a cada punto y no se excluye a ninguna por separarse del ajuste.`,
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
    // Esta frase decía «nunca se interpola ni se colorea el área entre
    // sensores», y dejó de ser cierta el día que el mapa pasó a colorear la
    // zona vigilada. Lo que sigue siendo cierto —y es lo que importa— es que
    // no se promedia nada: el color de un punto es la lectura de un sensor
    // concreto, no una mezcla de varios, y se corta a 80 m.
    neverInterpolated:
      'Entre sensores no se promedia nada: cada punto del mapa toma la lectura del sensor más cercano y solo hasta 80 m. Más allá no se colorea, porque ahí no hay medida.',
    noneLive:
      'Ahora mismo no hay ninguna lectura exterior fresca, así que no se pinta ningún campo.',
    officialSource: 'Información oficial del Cabildo Insular',
    officialSourceUrl: 'https://www.cabildodelapalma.es/',
    sensorsReporting: (fresh: number, total: number) =>
      `${fresh} de ${total} sensores transmitiendo`,
    height: 'Altura sobre el suelo',
    heightHint:
      'El CO₂ es más denso que el aire y se acumula a ras de suelo, en hondonadas y en ' +
      'sótanos. La misma concentración medida a 0,5 m y a 1,5 m no describe la misma ' +
      'situación, por eso la altura del sensor va junto al número.',
    lastSeen: 'Última transmisión',

    /** Qué es esta cifra. Sin adjetivos y sin decir qué hacer con ella. */
    whatIsThis: 'Qué mide este sensor',
    whatIsThisBody:
      'Concentración de dióxido de carbono en el aire, en partes por millón (ppm). Esta red ' +
      'no vigila la calidad del aire urbana: vigila el gas volcánico que emana del suelo en ' +
      'Puerto Naos y La Bombilla desde la erupción de 2021. El aire libre está hoy en torno a ' +
      'las 420 ppm en todo el planeta, así que esa es la referencia de fondo por debajo de la ' +
      'cual no hay nada que atribuir al volcán.',
    sensorTemp: 'Temperatura del sensor',
    sensorTempHint:
      'Es la temperatura de la electrónica dentro de su caja, no la del aire en ese punto. ' +
      'Al sol pasa de largo los 40 °C mientras el aire está a 25. Para el tiempo que hace ' +
      'ahí, usa la malla meteorológica.',
    outdoor: 'Emplazamiento',
    outdoorValue: 'Exterior',
    indoorValue: 'Interior',
    indoorHint:
      'Sensor colocado dentro de un recinto. En interiores la respiración de quien está ' +
      'dentro también sube el CO₂, así que la cifra no se debe leer como emanación del suelo ' +
      'sin más contexto.',

    /** El suelo del equipo, que se repite en la mayoría de la red. */
    floorValue: 'Mínimo del equipo',
    floorBody:
      '400 ppm es el valor más bajo que declara este equipo: por debajo de esa concentración ' +
      'no distingue. Significa «nada apreciable por encima del fondo atmosférico», no una ' +
      'medida exacta de 400.',
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

  webcams: {
    title: 'Webcam',
    operator: 'Opera',
    views: 'Ángulos',
    reload: 'Actualizar la imagen',
    shotAt: 'Imagen de las',
    downloadedAt: 'Descargada a las',
    imageAlt: (site: string, view: string | null) =>
      view ? `Webcam de ${site} — ${view}` : `Webcam de ${site}`,
    /**
     * El caso del Cabildo: su servidor no manda `Last-Modified`, pero la
     * cámara imprime la fecha dentro del propio JPEG. Decirlo es más útil que
     * enseñar la hora de descarga, que es otra cosa.
     */
    stampedClock: 'La fecha y la hora van impresas dentro de la imagen.',
    slow: (label: string) =>
      `Esta cámara renueva cada ${label} aproximadamente: lo que se ve puede ser de hace ` +
      `ese rato, no de ahora mismo. La hora exacta va impresa en la imagen.`,
    stale:
      'Esta imagen lleva horas sin renovarse: enseña el tiempo de entonces, no el de ahora. ' +
      'La cámara puede estar parada.',
    unreachable:
      'Esta cámara no ha respondido. Son equipos de terceros —un ayuntamiento, un telescopio— ' +
      'que se apagan o se reinician sin avisar; vuelve a intentarlo.',
    fromCabildo: 'Del Cabildo',
    fromOrm: 'Del observatorio',
    fromOthers: 'Municipales',
    cadence:
      'Cada cámara publica a su ritmo, de unos minutos a más de una hora, y ninguna lo declara. ' +
      'Donde el servidor da la hora de la foto, la ficha la enseña; donde no, lo dice.',
    excluded:
      'Solo están las que respondieron y tienen posición publicada. Quedan fuera las diez del ' +
      'Cabildo que aún apuntan a un servidor caído, las que solo funcionan de noche, las ' +
      'congeladas desde junio o julio, y las privadas de alojamientos y particulares, que no ' +
      'tienen licencia de reutilización ni coordenadas.',
    licenceCabildo:
      'Cabildo Insular de La Palma. Reutilización autorizada (Ley 37/2007) citando la fuente.',
    licenceThirdParty: 'Imagen del operador indicado, enlazada desde su propio servidor.',
  },

  sky: {
    title: 'Calidad del cielo',
    magnitude: 'Brillo del cielo',
    darker: 'más alto = más oscuro',
    mostlyDead:
      'La mayor parte de la red de fotómetros lleva más de un mes sin transmitir. Solo se muestran los activos.',
  },

  coverage: {
    loading: 'Descargando el sondeo de cobertura…',
    failed: 'No se pudo descargar el sondeo de cobertura.',
    age: 'Sondeo de noviembre y diciembre de 2013. No hay medidas posteriores: esto NO es la cobertura de hoy. Desde entonces se desplegó el 4G, llegó el 5G y la erupción de 2021 se llevó parte de la red del oeste.',
  },

  /**
   * La escena atmosférica. Las cadenas dicen lo que es y lo que NO es, porque
   * es la capa de la aplicación con más capacidad de que la confundan con un
   * radar meteorológico. Ver la cabecera de `components/sidebar/Sky3D.tsx`.
   */
  /**
   * La escena nocturna. El vocabulario importa: aquí hay que decir tres veces
   * la misma distinción —qué está medido y qué está dibujado— porque es lo
   * único que separa esta función de un planetario de escritorio.
   */
  nightSky: {
    layer: 'Cielo estrellado en 3D',
    figures: 'Líneas de las constelaciones',
    twinkle: 'Centelleo',
    hint: 'Dibuja el cielo real de este instante sobre la isla: las posiciones son de catálogo y CUÁNTAS estrellas se ven sale del brillo de fondo que miden los fotómetros del Cabildo. Es la misma diferencia que se ve subiendo a la Cumbre.',
    loading: 'Descargando el catálogo de estrellas…',
    failed: (why: string) => `No se pudo cargar el catálogo de estrellas: ${why}`,
    glow: 'Brillo del cielo',
    glowUnit: (v: number) => `${v.toFixed(2)} mag/arcsec²`,
    limit: 'Magnitud límite',
    visible: 'Estrellas visibles',
    visibleOf: (n: number, total: number) => `${n} de ${total}`,
    extinction: 'Extinción',
    extinctionUnit: (k: number) => `${k.toFixed(3)} mag/masa de aire`,
    horizon: 'Horizonte visible',
    horizonUnit: (deg: number) => `${deg.toFixed(2)}°`,
    source: 'Origen del brillo',
    /**
     * Las dos ramas. No se parecen a propósito: una nombra una estación y la
     * otra dice que no hay ninguna, y quien mira tiene derecho a saber cuál de
     * las dos está viendo antes de creerse la cuenta de estrellas.
     */
    sourceStation: (name: string, km: number, minutes: number) =>
      `Medido por «${name}», a ${km.toFixed(1)} km, hace ${minutes} min. Esa lectura ya lleva dentro la luna, el crepúsculo y las luces del pueblo.`,
    sourceModel:
      'No hay ningún fotómetro con lectura utilizable a menos de 12 km, así que el brillo del cielo es MODELADO: cielo oscuro de referencia de la isla, más el crepúsculo y la luna, los dos por Krisciunas y Schaefer y los dos calibrados contra esta red —la luna, sobre una lunación entera de archivo—. La cuenta de estrellas de arriba es una estimación, no una medida.',
    network: 'Red de fotómetros',
    networkValue: (usable: number, registered: number) => `${usable} de ${registered} midiendo`,
    rejected: 'Descartadas',
    rejectedDetail: (r: { sunUp: number; impossible: number; stale: number; sentinel: number }) =>
      `${r.sunUp} con el sol arriba, ${r.impossible} con valor imposible, ${r.sentinel} con centinela, ${r.stale} con lectura vieja.`,
    frozen: (n: number) =>
      n === 1
        ? '1 fotómetro descartado por publicar hora nueva con el mismo valor de siempre.'
        : `${n} fotómetros descartados por publicar hora nueva con el mismo valor de siempre.`,
    scope:
      'Qué es dato y qué es dibujo: la posición de cada estrella, su magnitud y su color son de catálogo (HYG: Hipparcos, Yale Bright Star y Gliese); cuántas se ven sale del brillo de fondo medido. El tamaño en píxeles, el centelleo y el halo son representación: una estrella no tiene tamaño angular, y lo que se dibuja es la respuesta del ojo, no el objeto.',
    figuresScope:
      'Las figuras no son un dato astronómico: son una convención cultural. Van enganchadas por índice a las estrellas del catálogo, así que precesan con ellas, y se apagan solas cuando el cielo está tan claro que unirían estrellas que ya no se ven.',
    twinkleScope:
      'El centelleo crece con la masa de aire según el exponente 1,75 de Young (1967): en el cenit es un temblor y a cinco grados del horizonte es lo que hace parpadear a Sirio recién salido. La fase de cada estrella es suya, para que no titilen a la vez.',
    tonight: 'Ahora mismo, sobre la isla',
    tonightValue: (deg: number, rose: string, mag: number) =>
      `${Math.round(deg)}° al ${rose} · mag ${mag.toFixed(1)}`,
    tonightScope:
      'Las cinco más brillantes que llegan por encima del límite de esta noche, ordenadas por lo que le llega al ojo y no por lo que dice el catálogo: una estrella brillante a tres grados del horizonte se ve peor que una mediana en el cenit. Es la parte de esta función que se puede comprobar saliendo a la puerta.',
    needs3d: 'El cielo solo se ve con la vista inclinada: en planta no hay horizonte en pantalla, igual que le pasa al disco del sol.',
    observer: 'Observador',
    observerValue: (m: number) => `${Math.round(m)} m sobre el mar`,
  },
  /**
   * La luna, dentro de la escena nocturna.
   *
   * Las cifras de estos textos salen de `moon.ts` y de `moon-brightness.ts`, y
   * las dos afirmaciones fuertes —los 0,17' de error y el 9 % de luz en cuarto—
   * están medidas en sus pruebas. Si alguna cambia, cambia allí primero.
   */
  nightMoon: {
    layer: 'La luna',
    names: {
      nueva: 'nueva',
      crecienteFina: 'creciente',
      cuartoCreciente: 'cuarto creciente',
      gibosaCreciente: 'gibosa creciente',
      llena: 'llena',
      gibosaMenguante: 'gibosa menguante',
      cuartoMenguante: 'cuarto menguante',
      menguanteFina: 'menguante',
    } as Record<string, string>,
    phase: 'Fase',
    /*
      Las cifras llegan YA FORMATEADAS desde el componente, con `n` y `n0`, que
      es lo que pone la coma decimal del castellano. Formatear aquí con
      `toFixed` habría escrito «13.7°» en un panel donde todo lo demás dice
      «13,7°».
    */
    phaseValue: (name: string, percent: string) => `${name} · ${percent} % iluminada`,
    where: 'Dónde está',
    whereValue: (deg: string, rose: string) => `${deg}° al ${rose}`,
    whereDown: (deg: string) => `puesta, ${deg}°`,
    size: 'Tamaño',
    sizeValue: (arcmin: string, km: string) => `${arcmin}′ · ${km} km`,
    light: 'Luz que echa',
    lightValue: (percent: string) => `${percent} % de la llena`,
    /**
     * El mismo problema del disco del sol y la misma solución: decir en presente
     * dónde está y hasta dónde llega la pantalla. Una casilla marcada sin nada
     * en pantalla es indistinguible de un fallo.
     */
    tooHigh: (deg: string, ceiling: string) =>
      `Está a ${deg}° de altura y la pantalla llega a ${ceiling}°: la luna está por encima del borde de arriba. Se verá cuando baje hacia el horizonte, que es también cuando se pone naranja.`,
    below: 'Ahora mismo está por debajo del horizonte de este observador, así que no hay nada que dibujar.',
    scope:
      'Qué es dato y qué es dibujo: la posición, la fase, el tamaño y la distancia son efemérides —serie completa de Meeus con paralaje topocéntrica, comprobada contra astronomy-engine con 0,17\u2032 de error en el peor caso de dos años—. El BRILLO del disco en pantalla es representación: la luna llena es dieciocho magnitudes más brillante que el cielo que tiene al lado y esa diferencia en un monitor no cabe. El enrojecimiento al bajar sí sale de la extinción medida del sitio.',
    sea:
      'Sobre el mar en movimiento se ve su reflejo, y la luz que le echa NO es proporcional a la parte iluminada: media luna alumbra el 9 % de la llena, no el 50 %. Es la curva de fase de Krisciunas y Schaefer, la misma con la que se calcula cuántas estrellas tapa.',
  },
  /**
   * Los planetas. Las cifras de estos textos salen de `lib/planets/`, y las
   * dos afirmaciones fuertes —los 0,57" de error y los 36 KB— están medidas en
   * la prueba y en el script que genera la tabla.
   */
  nightPlanets: {
    layer: 'Los planetas',
    names: {
      mercurio: 'Mercurio',
      venus: 'Venus',
      tierra: 'Tierra',
      marte: 'Marte',
      jupiter: 'Júpiter',
      saturno: 'Saturno',
      urano: 'Urano',
    } as Record<string, string>,
    hint: 'Los cinco que se ven a simple vista, más Urano, que pide un cielo como el de aquí. Las efemérides son 20 KB que solo se descargan con esta casilla.',
    loading: 'Cargando las efemérides de los planetas…',
    failed: (why: string) => `No se pudieron cargar las efemérides de los planetas: ${why}`,
    value: (deg: string, rose: string, mag: string) => `${deg}° al ${rose} · mag ${mag}`,
    down: (deg: string) => `puesto, ${deg}°`,
    tooCloseToSun: (name: string, deg: string) =>
      `${name} está a solo ${deg}° del sol: sale y se pone casi con él, y el crepúsculo se lo come por brillante que sea.`,
    /*
      «De ahora mismo» y no «de esta noche»: la casilla se puede encender a las
      once de la mañana, y ahí el límite lo pone el sol, no el fotómetro.
      Decir «esta noche» con el sol a 28° era una frase correcta en el único
      momento en que nadie la lee.
    */
    tooFaint: (name: string, mag: string) =>
      `${name} está en el cielo, pero con magnitud ${mag} queda por debajo del límite de ahora mismo.`,
    scope:
      'Qué es dato y qué es dibujo: la posición sale de VSOP87, la misma serie que usan las efemérides publicadas, con tiempo de luz y paralaje puestos encima. Antes salía de polinomios ajustados a VSOP87 y con fecha de caducidad; ahora se evalúa la serie entera y no caduca. La magnitud es la fórmula del Astronomical Almanac, con los anillos de Saturno dentro. No se dibuja el disco de ninguno: Júpiter mide 50 segundos de arco y el ojo resuelve 60.',
    twinkle:
      'Y no centellean, que es la única diferencia con las estrellas. No es un gusto: una estrella es un punto y la turbulencia le mueve todo el haz a la vez, mientras que un planeta es un disco de muchos puntos cuyos parpadeos se promedian. Lo que no titila, ahí arriba, es un planeta.',
  },
  nightMilkyWay: {
    layer: 'La Vía Láctea',
    hint: 'El contorno de la banda, pegado al cielo y atenuado por el brillo de fondo que miden los fotómetros. Son 50 KB de mapa que solo se descargan con esta casilla.',
    loading: 'Descargando el mapa de la Vía Láctea…',
    failed: (why: string) => `No se pudo cargar el mapa de la Vía Láctea: ${why}`,
    sky: 'Fondo de cielo',
    unit: 'mag/arcsec²',
    fromPhotometer: 'medido',
    fromModel: 'modelo',
    share: 'Luz que pone ella',
    shareScope:
      'La parte de la luz que llega del núcleo de la banda que pone la Vía Láctea, y no la opacidad que se dibuja. Con el cielo del Roque en una buena noche son cerca de un tercio; con luna llena, un 2,5 %. Ese cociente es la razón por la que se apaga sola cuando sale la luna: nadie ha escrito una regla, solo se divide su luminancia entre la que mide el fotómetro.',
    scope:
      'Qué es dato y qué es dibujo, y aquí conviene ser claro: ESTO NO ES UNA FOTOGRAFÍA. El contorno de la Vía Láctea son cinco curvas de nivel de d3-celestial —con los 197 agujeros de las nebulosas oscuras dentro, que es lo que la parte en dos por la Fisura del Cisne— rasterizadas y suavizadas. Su posición en el cielo sí es exacta: entra por la misma matriz, la misma refracción y la misma extinción que las 8.920 estrellas. Lo que se mide es CUÁNTO se ve, que sale de dividir su brillo entre el fondo de cielo de los fotómetros del Cabildo. El nivel de gris del mapa no trae calibración fotométrica: se ancla a la cifra publicada de que la banda sube el fondo unas 0,4 magnitudes en sus zonas más brillantes.',
  },
  sky3d: {
    layer: 'Nubes y lluvia en 3D',
    hint:
      'Dibuja la nubosidad y la lluvia del modelo como volumen sobre el relieve. Las nubes van a la cota que les toca, se mueven con el viento de SU nivel —que no es el de superficie: hoy el aire de 900 hPa venía del noreste y el de 700 hPa del oeste— y el relieve las tapa cuando quedan detrás.',
    loading: 'Pidiendo la nubosidad al modelo…',
    failed: 'No se pudo cargar la nubosidad del modelo.',
    low: 'Nubosidad baja',
    mid: 'Nubosidad media',
    high: 'Nubosidad alta',
    rain: 'Puntos con lluvia',
    rainValue: (n: number) => `${n} de 70`,
    base: 'Capa baja',
    /**
     * De dónde sale la cota de la capa baja. Son tres frases distintas porque
     * son tres grados de certeza distintos, y decir «1200 m» sin más las
     * igualaría.
     */
    baseSource: {
      deck: 'La cota sale del sondeo de hoy: es la inversión del alisio que ha encontrado el modelo, la misma que usa el mar de nubes.',
      lcl: 'No hay inversión diagnosticada hoy, así que la cota es el nivel de condensación por ascenso que sale de la temperatura y el punto de rocío medios de la isla.',
      default: 'Sin sondeo ni superficie con que calcularla, la capa se dibuja a la cota en la que suele estar la inversión en esta isla. Es la menos fiable de las tres.',
    },
    scope:
      'No es un radar ni una observación. Lo medido es un porcentaje de nubosidad por piso, del modelo ICON, en celdas de 5 km sobre la isla y de ~25 km sobre el mar; la forma concreta de cada nube es una representación de esa cifra, no una nube que alguien haya visto.',
    /**
     * Cómo se sombrean. No lleva interruptor y no debería llevarlo: era una
     * simplificación —una constante por estrato—, no una opción que ofrecer.
     */
    shading:
      'Cada nube se sombrea a sí misma: desde cada mota se mira hacia el sol a través de las demás de su nube y se cuenta cuánta tiene delante. Por eso lo oscuro no está siempre abajo — al mediodía es la panza, y con el sol rasante es el lado contrario al sol, que es lo que hace que un cúmulo del atardecer se lea como un objeto con volumen.',
    /** Y una nube contra las demás: el cirro le quita el sol al cúmulo. */
    crossShading:
      'Y unas nubes le hacen sombra a otras: una capa alta extendida apaga los cúmulos que tiene debajo, y con el sol rasante una hilera se enciende por la punta y se apaga hacia dentro. Se calcula solo cuando el sol se mueve medio grado, no en cada fotograma.',
    /**
     * El aire que hay delante. Va aquí y no en la luz solar porque se ve
     * siempre que haya nubes, con la luz real encendida o no.
     */
    haze:
      'Y lo que hay entre la cámara y cada nube: el aire. Una nube al otro extremo de la isla se ve con un 43 % de bruma encima —dispersión de Rayleigh, la misma que hace azul el cielo— y con calima, medida por el PM10 de las estaciones, con el 97 %. Es lo que separa una nube lejana de una cercana cuando las dos son igual de blancas.',
  },

  fireRisk: {
    title: 'Experimental',
    layer: 'Índice de incendio',
    loading: 'Cargando el modelo de incendios…',
    failed: 'No se pudo cargar el modelo de incendios.',
    /**
     * El aviso no es una nota al pie. Va arriba de la sección, siempre visible,
     * y dice las dos cosas que hacen falta para no leer mal el mapa: quién sí
     * avisa de verdad, y qué es esta cifra.
     */
    disclaimer:
      'Función experimental. No es un aviso oficial ni sustituye a ninguno: los avisos de riesgo, las alertas y las prohibiciones las publican el Cabildo Insular y el Gobierno de Canarias.',
    /**
     * Dónde sale el índice, dicho junto al interruptor que lo enciende.
     *
     * No tiene dibujo propio: ocupa la malla interpolada, la misma que estaba
     * enseñando la temperatura. Encenderlo cambia el contenido del mapa entero,
     * y eso conviene saberlo antes de marcar la casilla, no después.
     */
    layerHint:
      'Ocupa la malla interpolada: mientras esté encendido, la isla se colorea con el índice y no con la variable meteorológica.',
    layerOn: 'La malla está enseñando el índice. Apagarlo devuelve la temperatura.',
    what: 'Qué es esta cifra',
    whatBody:
      'El producto de dos números. El primero contesta «si hay un gran incendio en La Palma, ¿llega hasta aquí?», y sale de un clasificador entrenado con los cinco incendios de los que existe perímetro publicado. El segundo dice cómo de excepcional es el tiempo de hoy, como percentil sobre veinticuatro años de archivo. No es una probabilidad de que algo arda.',
    site: 'El sitio',
    today: 'El día de hoy',
    fuel: 'Combustible',
    slope: 'Pendiente',
    distance: 'A la vía más cercana',
    fosberg: 'Índice de Fosberg',
    dryness: 'Sin llover',
    why: 'Qué pesa en esta celda',
    whyHint:
      'Cuánto se movería la cifra si ese rasgo fuera el de una celda corriente de la isla, dejando los demás como están. Son efectos por separado: no tienen por qué sumar el total.',
    validation: 'Cómo de fiable es',
    validationHint:
      'Se esconde un incendio entero, se entrena con los otros cuatro y se puntúa sobre el que no vio. Es la prueba dura: repartir celdas al azar daría 0,90 y sería engañarse, porque las celdas de un incendio son vecinas.',
    trainedOn: 'Entrenado con',
    worstFold: 'El peor pliegue',
    worstFoldHint:
      'Garafía 2020 es el incendio que el modelo peor reconstruye, y se publica en vez de esconderlo tras la media. Lo que aprendió del sur y del oeste no le sirvió del todo en el noroeste.',
    droughtModel:
      'Los días sin llover salen del archivo de reanálisis de Open-Meteo, un modelo de ~11 km que resuelve seis celdas sobre la isla. No se interpola entre ellas: cada punto toma la suya. Las 37 estaciones frescas del Cabildo publican cero de precipitación diaria, así que no hay medida insular que usar.',
    noDrought:
      'Sin el archivo de lluvia, el índice se queda solo con la mitad que sale de las estaciones.',
    unknownFuel: 'La cartografía de combustible no llega a este punto, así que aquí no se puntúa.',
    fuelYear:
      'Modelos de combustible de Canarias y, donde ésa no llega, el mapa de cultivos de 2002–2008. Ese mapa es anterior a la erupción de 2021 y al abandono agrícola de los últimos quince años.',
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
    guaguaTitle: 'Transporte público — TILP',
    guaguaBody:
      'Paradas, trazados y horarios salen del GTFS de Transportes Insulares La Palma que ' +
      'publica el Cabildo: 23 líneas, 913 paradas y 742 viajes. La red —qué línea pasa por ' +
      'dónde— se enseña tal cual. Las horas de paso también, pero con una advertencia que ' +
      'no se quita: los cinco calendarios de servicio del archivo vencieron el 25 de ' +
      'diciembre de 2025 y no hay ninguna excepción posterior, así que son la última tabla ' +
      'publicada —la que sigue en la calle porque no se ha renovado— y se dan como ' +
      'referencia, no como garantía. Van plegadas, con su fecha y con enlace a TILP.',
    guaguaLicense: 'CC-BY 4.0 · GTFS de TILP',
    placesTitle: 'Sitios, miradores y carreteras',
    placesBody:
      'El Cabildo publica en DOS sitios distintos y no traen lo mismo. Del catálogo de datos ' +
      'abiertos salen los lugares de interés turístico (50), cultural (92) e histórico (390), ' +
      'las zonas recreativas (33) y los 54 puntos de recarga eléctrica. Del visor de ' +
      'opendatalapalma.es —servicios ArcGIS, no ficheros— salen los 29 miradores, que no ' +
      'están en el catálogo, y la red de carreteras: 61 tramos, que son los 53 de titularidad ' +
      'insular del catálogo más la carretera del Parque Nacional, la del aeropuerto y seis ' +
      'municipales. Cada capa se enciende por separado y cada elemento se pincha para ver su ' +
      'ficha completa, con los campos tal como los publica la fuente.',
    placesLicense: 'CC-BY 4.0',
    countersTitle: 'Aforos de tráfico y de senderos',
    countersBody:
      'Contadores del Cabildo en cruces, carreteras y accesos a senderos: cuántos coches, ' +
      'motos, vehículos pesados, bicicletas y peatones pasan, y en qué sentido. Las cifras ' +
      'del día vienen del archivo diario, que incluye el día en curso; el endpoint llamado ' +
      '«del día en curso» publica en realidad los últimos minutos, y aquí se enseña como lo ' +
      'que es —la prueba de que el aparato está vivo—, nunca como un total. Del registro de ' +
      '133 contadores en 30 emplazamientos, 84 han publicado algo esta semana y 72 hoy; el ' +
      'mapa dibuja los que tienen datos en la ventana, incluidos los que han enmudecido hoy.',
    countersLicense: 'CC-BY 4.0',
    roqueTitle: 'Estación del Roque de los Muchachos',
    roqueBody:
      'Telescopio Nazionale Galileo (INAF), a 2.387 m. Es la única medida real por ' +
      'encima del techo de la red del Cabildo, y la referencia contra la que se validó ' +
      'el perfil vertical del modelo. Es un observatorio de investigación, no un servicio ' +
      'público de datos: cada campo llega con su propia hora y con un aviso de si sigue ' +
      'al día, y la aplicación lo respeta —lo que la fuente marca como viejo se enseña ' +
      'apagado y fechado, nunca como si fuera de ahora—. Si no responde, la sección ' +
      'desaparece y nada más se ve afectado.',
    roqueLicense: 'Cortesía del TNG · uso no comercial, sin compromiso de disponibilidad',
    agroTitle: 'Cultivos e infraestructura hídrica',
    agroBody:
      'Visor ArcGIS del Cabildo Insular de La Palma, que NO es el mismo inventario que el ' +
      'catálogo CKAN. El mapa de cultivos lo levantó el Gobierno de Canarias entre 2002 y ' +
      '2008 —217.137 parcelas, de las que 40.387 y 6.873,6 ha están en cultivo— y no ' +
      'recoge la erupción de 2021, que sepultó parte de la platanera del Valle de ' +
      'Aridane: cada ficha lleva el año pegado. De la red hidráulica se descargan 433 ' +
      'puntos de captación y almacenamiento y 133 trazados de canal. La demanda de agua ' +
      'la pone Open-Meteo (FAO-56) y los coeficientes de cultivo, la tabla 12 de FAO-56; ' +
      'es la demanda del cultivo, no una recomendación de riego.',
    agroLicense: 'CC-BY 4.0',
    trailsAlertsTitle: 'Avisos de senderos',
    trailsAlertsBody:
      'Calculados recorriendo los 49 trazados de la red insular con el mismo modelo que ' +
      'pinta el mapa, un punto cada 200 m. No es el estado del sendero: los cierres por ' +
      'derrumbe u obra los publica el Cabildo en senderosdelapalma.es. Y no hay aviso de ' +
      'lluvia, porque la red de estaciones no la mide de forma utilizable y esta ' +
      'aplicación no interpola precipitación nunca.',
    trailsAlertsLicense: 'CC-BY 4.0 (trazados)',
    tdtTitle: 'Cobertura de TDT — simulación del Cabildo',
    tdtBody:
      'El Cabildo publica `Simulaciones_Rep_TDT.kmz`: 49 simulaciones de cobertura, una por ' +
      'sector de repetidor de televisión digital terrestre, cada una como una imagen ' +
      'georreferenciada. Es lo único de cobertura de televisión que existe publicado de esta ' +
      'isla —el catálogo CKAN no lo tiene, y la capa de telecomunicaciones del visor solo trae ' +
      'los 100 emplazamientos de antena, sin geometría de cobertura—. Las 49 imágenes se funden ' +
      'en tiempo de compilación en un solo mapa de 92 m de celda, recortado a la línea de costa. ' +
      'Tres advertencias, y ninguna es menor: es un CÁLCULO de propagación, no una medida; es de ' +
      '2018; y simula los REPETIDORES, no el centro emisor principal, así que quedar fuera de la ' +
      'mancha no significa que allí no llegue la señal. Cubre el 51,6 % de la superficie de la ' +
      'isla. Lo que sí se ve en ella son las sombras de radio del relieve, que es lo que manda ' +
      'aquí: la Caldera de Taburiente sale hueca.',
    tdtLicense: 'CC-BY 4.0',
    viarioTitle: 'Viario completo — OpenStreetMap',
    viarioBody:
      'Las carreteras del Cabildo son 61 tramos y no pretenden ser otra cosa: las 53 vías ' +
      'insulares, seis municipales, la del Parque Nacional y la del aeropuerto. Por debajo ' +
      'de esas 61 la isla salía vacía —en las medianías de Tijarafe o de Puntagorda, las ' +
      'paradas de guagua flotaban sobre un relieve sin una sola calle— y esa parte la pone ' +
      'OpenStreetMap: 19.770 trazados y 3.373 km, de los que 2.225 km son pistas agrícolas ' +
      'y forestales y caminos de servicio. Se extrae una sola vez en tiempo de compilación ' +
      'mediante Overpass; la aplicación no consulta OpenStreetMap en tiempo de ejecución. No ' +
      'incluye senderos ni escaleras: los senderos son capa aparte y vienen del Cabildo. Es ' +
      'cartografía colaborativa y se enseña como tal: sitúa, pero no es un inventario ' +
      'oficial de vías, y solo el dato del Cabildo lleva ficha con código y titularidad.',
    viarioLicense: 'ODbL 1.0',
    toponymsTitle: 'Topónimos',
    toponymsBody:
      '© colaboradores de OpenStreetMap. Extraídos una sola vez en tiempo de compilación mediante Overpass; la aplicación no consulta OpenStreetMap en tiempo de ejecución.',
    toponymsLicense: 'ODbL 1.0',
    oceanTitle: 'Estado del mar',
    oceanBody:
      'Open-Meteo Marine, que sirve la pasada del modelo de oleaje MFWAM/ECMWF. Se le piden ocho ' +
      'puntos en un anillo a 33 km del centro de la isla, uno por rumbo, porque el oleaje no es el ' +
      'mismo por los cuatro costados: el 13 de agosto de 2026 el mar de viento medía 0,96 m por el ' +
      'norte y 0,02 m a sotavento, en el mismo instante. Es un MODELO, no una medida: no hay boya ' +
      'publicando oleaje en abierto alrededor de La Palma con la que contrastarlo, y la aplicación ' +
      'lo dice donde enseña la cifra. La marea, la temperatura del agua y la corriente vienen de la ' +
      'misma fuente. El viento que riza la superficie, en cambio, sale de las estaciones del ' +
      'Cabildo donde llegan.',
    oceanLicense: 'CC-BY 4.0 · uso no comercial de la API gratuita',
    bathymetryTitle: 'Batimetría',
    bathymetryBody:
      'EMODnet Bathymetry (DTM), del consorcio europeo, con celda de 1/16 de minuto —unos 102 × 116 m ' +
      'a esta latitud—. Se descarga una sola vez en tiempo de compilación y se sirve como una imagen ' +
      'de 155 KB. Es la que decide de qué color es el agua, dónde crece la ola y dónde rompe: sobre ' +
      'el recuadro del mapa llega a 4.045 m de fondo, y el 93 % de ese recuadro es mar.',
    bathymetryLicense: 'CC-BY 4.0',
    seamarksTitle: 'Balizamiento náutico',
    seamarksBody:
      'OpenSeaMap: faros con su característica, boyas cardinales y laterales, puertos y zonas ' +
      'restringidas, cartografiadas por navegantes sobre OpenStreetMap. Se piden mientras se miran, ' +
      'solo con «Faros, boyas y puertos» encendido, y por debajo del zoom 9 no hay balizas dibujadas.',
    seamarksLicense: 'ODbL 1.0',
    starsTitle: 'Catálogo de estrellas',
    starsBody:
      'HYG v4.4, de Astronomy Nexus: funde en un solo fichero todas las estrellas identificables de ' +
      'los catálogos Hipparcos, Yale Bright Star y Gliese —las 9.040 con número HR del Yale entre ' +
      'ellas—. Se descarga una vez en tiempo de compilación, se corta en magnitud 6,5 —8.920 ' +
      'estrellas, 104 KB— y se le aplica el movimiento propio hasta la época del build. CUÁNTAS de ' +
      'esas 8.920 se dibujan no sale del catálogo: sale del brillo de fondo que miden los ' +
      'fotómetros del Cabildo. El fichero derivado hereda la licencia del original.',
    starsLicense: 'CC BY-SA 4.0',
    figuresTitle: 'Figuras de las constelaciones',
    figuresBody:
      'Las líneas vienen de d3-celestial, de Olaf Frohn, y aquí no se guardan como coordenadas sino ' +
      'como parejas de índices al catálogo: cada uno de los 893 vértices se engancha a la estrella ' +
      'más cercana —mediana de 0,16 segundos de arco, peor caso 30,6 en α Centauri, que es doble—, ' +
      'así que las figuras precesan con sus estrellas y ninguna puede quedar colgando de un punto ' +
      'vacío. No son un dato astronómico: son una convención cultural.',
    figuresLicense: 'BSD-3-Clause',
    milkyWayTitle: 'Contorno de la Vía Láctea',
    milkyWayBody:
      'También de d3-celestial, de Olaf Frohn, pero es otro fichero y otra cosa: cinco polígonos ' +
      'anidados —cinco curvas de nivel de brillo— con 197 anillos interiores entre todos, que son ' +
      'las nebulosas oscuras: la Fisura del Cisne y el Saco de Carbón. Aquí se rasterizan a un mapa ' +
      'de 1440 × 720 —un cuarto de grado por píxel— rellenando por regla par-impar, que es lo que ' +
      'hace que los agujeros salgan solos. NO ES UNA FOTOGRAFÍA y conviene repetirlo: es un contorno ' +
      'suavizado que se le parece. Lo que sí sale de una medida es cuánto se ve, que se calcula ' +
      'dividiendo su brillo entre el fondo de cielo que publican los fotómetros del Cabildo.',
    milkyWayLicense: 'BSD-3-Clause',
    ephemerisTitle: 'Efemérides de los planetas',
    ephemerisBody:
      'astronomy-engine, de Don Cross: implementa VSOP87 para las órbitas planetarias y el NOVAS ' +
      'C 3.1 del Observatorio Naval de los Estados Unidos para pasar de ahí al cielo que se ve. Es ' +
      'la única biblioteca que esta aplicación descarga para calcular algo, y solo la descarga ' +
      'quien enciende los planetas: son 20 KB en un fragmento aparte. Aquí hubo una tabla de ' +
      'polinomios propia de 36 KB, con fecha de caducidad, que resultó pesar más que la biblioteca ' +
      'que evitaba. La luna y el sol NO salen de aquí: son series de Meeus escritas en el ' +
      'repositorio, comprobadas contra esta misma biblioteca.',
    ephemerisLicense: 'MIT',
    demTitle: 'Modelo de elevación y relieve',
    demBody:
      'Mapzen Terrain Tiles (formato terrarium), servidas por AWS Open Data. Derivadas de NASA SRTM, NASADEM, USGS 3DEP y EU-DEM. Las mismas teselas generan el sombreado del relieve y las altitudes del cálculo.',
    demLicense: 'Dominio público / CC-BY',
    fireTitle: 'Índice experimental de incendio',
    fireBody:
      'Capa experimental, y lo primero que hay que saber de ella es que NO es un aviso ' +
      'oficial: los avisos de riesgo, las alertas y las prohibiciones las publican el Cabildo ' +
      'Insular y el Gobierno de Canarias. Sale de juntar cuatro fuentes abiertas. Los ' +
      'perímetros de los incendios de 2009 y 2012 los publica el Cabildo en su visor; los de ' +
      '2016, 2020 y 2023, el servicio europeo Copernicus EFFIS. La cartografía de modelos de ' +
      'combustible es del Gobierno de Canarias, y donde ésa no llega —la agricultura— se ' +
      'rellena con el mapa de cultivos de 2002–2008. El relieve sale del mismo modelo de ' +
      'elevación que el resto de la aplicación, y los días sin llover, del archivo de ' +
      'reanálisis de Open-Meteo, que es un modelo de unos 11 km y va etiquetado como tal. ' +
      'El clasificador se entrena y se valida fuera del navegador, con cinco incendios y ' +
      'escondiendo uno entero cada vez; lo que llega aquí son 150 árboles en un JSON.',
    fireLicense: 'CC-BY 4.0 · Copernicus EFFIS · Gobierno de Canarias',
    codeTitle: 'Código',
    codeBody: 'Software libre con atribución. El motor de interpolación y sus pruebas son públicos.',
    noTrackingTitle: 'Sin rastreo',
    noTrackingBody:
      'Sin cookies, sin analítica de terceros y sin publicidad. La pantalla de CO₂ no lleva ni llevará publicidad ni muro de pago.',
    storageTitle: 'Lo que se guarda en tu dispositivo',
    storageBody:
      'Nada de esto sale de tu navegador ni llega a ningún servidor, pero se guarda y conviene decirlo. ' +
      'Primero, tus ajustes: qué capas tienes encendidas, qué variable miras, qué fondo usas. ' +
      'Y segundo, la cartografía que ya has mirado —hasta 1 GB durante 30 días, y nunca más de la '
      + 'cuarta parte del espacio que tu navegador ofrezca—, para que volver a ' +
      'esta página no cueste descargarla otra vez. Lo segundo es la caché del navegador hecha a mano: ' +
      'el servicio que sirve esos mapas no manda ninguna cabecera que permita conservarlos, así que sin ' +
      'esto cada trozo de isla se descargaría entero cada vez que vuelve a la pantalla. Se borra todo ' +
      'vaciando los datos de este sitio desde tu navegador.',
  },

  /**
   * Lo que solo existe en la pantalla estrecha: los botones redondos, la tira
   * de capas y la hoja que asoma. En el escritorio no aparece ninguna de estas
   * cadenas, porque allí todo eso es la barra lateral.
   */
  mobile: {
    locate: 'Mi ubicación',
    locating: 'Buscando tu ubicación…',
    noLocation: 'ubicación no disponible',
    island: 'Ver toda la isla',
    layers: 'Capas y ajustes',
    grid: 'Malla',
    expand: 'Ver el detalle',
    collapse: 'Bajar la hoja',
    live: 'en directo',
  },

  common: {
    back: 'Volver',
    of: 'de',
    unknown: 'desconocido',
    none: 'ninguna',
  },
} as const

export type Strings = typeof es
