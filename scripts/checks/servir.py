"""
Servidor estático para medir la portada.

NO ES `python3 -m http.server`, Y NO PUEDE SERLO. Aquel habla HTTP/1.0: cierra
la conexión después de cada respuesta, así que el navegador tiene que abrir un
socket por fichero. La portada pide de golpe trece hojas de estilo, cuatro
guiones, dos tipografías y la malla del terreno, y bajo esa ráfaga el servidor
de la biblioteca estándar empieza a soltar conexiones con `ERR_CONNECTION_RESET`.

LO QUE SE VE ENTONCES PARECE UN FALLO DEL SITIO Y NO LO ES. Las hojas que se
caen son siempre las últimas de la lista —`tresd.css` en adelante—, así que la
página sale a medio vestir: la rejilla del resumen sin rejilla, los glifos a
300 px porque nadie les ha puesto tamaño, y la isla sin arrancar. Se pierde una
tarde buscando el error en el CSS. Y en `portada-regimenes.ts` sale como «la
isla no arrancó a 1440 px», que es un falso negativo intermitente: unas veces a
1440 y otras a 390, según a quién le toque perder la carrera.

Con HTTP/1.1 hay keep-alive y una sola conexión sirve muchos ficheros; con la
cola de peticiones más larga, las que llegan a la vez esperan en vez de morir.

Uso:
    python3 scripts/checks/servir.py 4173 web &
    npx tsx scripts/checks/portada-regimenes.ts http://127.0.0.1:4173/index.html
    npx tsx scripts/checks/portada-secciones.ts http://127.0.0.1:4173/index.html
"""

import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class Handler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *args):
        """Silencio. Lo que interesa de estas medidas no es el registro de acceso."""


class Servidor(ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 128
    allow_reuse_address = True


def main() -> None:
    if len(sys.argv) != 3:
        print(__doc__)
        raise SystemExit(2)
    puerto, raiz = int(sys.argv[1]), sys.argv[2]
    servidor = Servidor(("127.0.0.1", puerto), partial(Handler, directory=raiz))
    print(f"sirviendo {raiz} en http://127.0.0.1:{puerto}/ — Ctrl-C para parar")
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
