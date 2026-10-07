# Sincronización de la versión publicada

Se integra en main el código de 1.0.48 (106), procedente del commit de publicación f33610ee2acdecb52c1cf725a861abe762cdaad7. Se conservan los datos actuales de main: catálogo, fichas, ranking agregado de Analytics, manifest publicado, vencimientos de avisos y avisos retirados. Se respalda también la regla de mantener el Hub actualizado.

El código publicado de Waien Hub, incluida la corrección de enumeraciones KV, está respaldado en el repositorio privado https://github.com/waien-studio/waien-hub. No se incluyen .env, credenciales, claves de firma ni datos de la bóveda. Este cambio no publica un nuevo paquete Android ni cambia los canales de Google Play.

Más buscados: el endpoint público respondió HTTP 200 con cuatro productos y generatedAt 2026-10-07T14:30:19.000Z durante la revisión. La versión 1.0.48 contiene el cliente del ranking compartido y consultas cada 15 minutos. Contabiliza apertura de productos desde resultados de búsqueda, con sesión autenticada y deduplicación por usuario/producto/día. Esto confirma el servicio y el código publicado; no prueba cada dispositivo instalado.

Alertas: la migración inicial sigue pendiente por cuota diaria agotada. Se conserva el estado Atención y la tarea de seguimiento para el 8 de octubre a las 09:00, hora de Buenos Aires. No se envían avisos reales para probar.

Validación: 135 pruebas de la app aprobadas y compilación web de producción aprobada. Se conservan las clasificaciones revisadas al crecer el catálogo. Las pruebas de historial y catálogo usan los datos vigentes sin fijar el total de productos a una fecha anterior.
