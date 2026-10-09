# Analítica de Iahadut

Estado: preparado para la próxima publicación de la app; no publicado en Google Play.
Base: 1.0.48 (106), main e6c3e5231a611c775405cf8ce5966f406b8e1bf8.
No se cambia el número de versión hasta preparar el siguiente lanzamiento.

## Usuarios

Propiedad Google Analytics 552698323 (iahadut-hatora).
Usar una sola consulta agregada para cada período, sin sumar usuarios por versión,
por evento ni por día: una misma persona puede aparecer en varios grupos.

| Pregunta | Métrica y período |
| --- | --- |
| Usuarios registrados acumulados | Total de usuarios, desde el inicio de la medición hasta hoy |
| Usuarios activos diarios/semanales/mensuales | Usuarios activos en 1 / 7 / 30 días |
| Nuevos usuarios | Usuarios nuevos; también first_open como primeras aperturas de instalaciones |
| Usuarios que regresan | Usuarios recurrentes y retención por cohortes |
| Uso real | Sesiones, sesiones con interacción, tiempo de interacción medio |
| Uso de una función | Total de usuarios y número de eventos de esa función |
| Adopción de una versión | Filtrar por versión de aplicación, con el mismo período |
| Desinstalaciones | app_remove; señal del SDK, no motivo ni censo exacto |
| Usuarios que mantienen la app instalada | Google Play: Usuarios con la app instalada (con fecha de actualización) |

Usuarios de Analytics son identidades que reconoce el SDK: varios dispositivos,
reinstalaciones, pruebas, falta de conexión y permisos pueden afectar el conteo.
No se agregan identificadores propios para intentar convertirlo en un censo de personas.
Los usuarios de Google Play y los de Analytics tienen definiciones diferentes.
No dividir desinstalaciones entre usuarios del período para llamarlo tasa de abandono:
para una tasa comparable usar las métricas de adquisición/pérdida de Play y retención.

## Funciones que registra la próxima versión

| Evento | Qué representa |
| --- | --- |
| app_screen_view | Entrada a Inicio, Buscar, Ficha, Guardados, Avisos, Más, Novedades, Categorías o Lector. Sin duplicar la misma vista consecutiva |
| product_save / product_unsave | Guardar/quitar un favorito después de persistirlo; cantidad guardada y pantalla de origen |
| catalog_search | Búsqueda enviada, longitud y cantidad de resultados, sin texto escrito |
| catalog_product_search | Abrir una ficha desde una búsqueda; conserva la clave SHA-256 que utiliza Más buscados |
| product_open | Abrir ficha: búsqueda, escáner, guardados o catálogo; distingue reintentos |
| product_share | Intento, retorno del panel, copia, cancelación o error. Retorno no confirma que un destinatario recibió el contenido |
| scanner_open / scanner_result | Intento de lector y resultado: coincidencia exacta, múltiple, identificación, no encontrado, código inválido, permiso denegado, cancelación/error nativo. La entrada manual también registra resultado |
| catalog_filter | Selección de marca, categoría o región |
| offline_download | Inicio, listo, pausa, error, esperar Wi-Fi o cancelación; distingue automático/manual |
| catalog_refresh | Sincronización manual: intento, finalización o error |
| notification_setting | Solicitud/resultado de activación y desactivación dentro de la app |
| content_open | Apertura de información, categoría, tarjeta o imagen |
| store_open | Pulsación para tienda, calificar o actualizar; no confirma instalación ni reseña |
| contact_open | Pulsación de contacto WhatsApp; no confirma envío del mensaje |

Los eventos automáticos del SDK (sesiones, first_open, app_update, notificaciones,
app_remove, etc.) se conservan. app_screen_view complementa screen_view nativo,
que suele referirse al contenedor web y no a cada sección de la app.

## Consulta y preparación del próximo lanzamiento

1. Publicar este cambio junto con las demás mejoras y la siguiente versión de la app.
2. En Analytics > Administrar > Definiciones personalizadas, registrar dimensiones
   con alcance Evento: screen, previous_screen, source, outcome, kind, region,
   automatic y retry. Reutilizar definiciones existentes sin duplicarlas.
   Registrar métricas de evento saved_count, query_length y result_count si se
   necesitan promedios o filtros. analytics_schema = 1 identifica esta medición.
   Esta configuración se verifica al preparar el lanzamiento; no se cambió hoy.
3. En un dispositivo de prueba, comprobar DebugView: guardar/quitar, navegación,
   compartir/cancelar, escanear y descarga. Cada acción debe producir los eventos
   esperados, sin texto libre, tokens ni datos de contacto.
4. Consultar Eventos por Total de usuarios y Número de eventos; en Exploraciones
   filtrar outcome = attempt para contar intentos de compartir, y product_save
   para usuarios que guardan. No sumar todos los outcomes como acciones nuevas.
5. Comparar únicamente versiones con la misma cobertura y el mismo período.
   Los informes procesados pueden demorar; DebugView no equivale al informe agregado.

## Límites y privacidad

Solamente usa el SDK Firebase Analytics que ya estaba integrado en Android/iOS.
La demo web y desarrollo no generan estos eventos. No hay nuevo servidor, KV,
planes, gastos contratados ni escritura de eventos a Firestore.
El búfer de inicio tiene hasta 40 eventos en memoria y se vacía una sola vez.
Los fallos de Analytics no bloquean guardar, buscar, compartir ni navegar.
No se añaden logs de secretos, correos, teléfonos, códigos de barras, URLs libres
ni búsquedas escritas. Cada evento tiene una lista permitida de parámetros.
Las versiones anteriores conservan su instrumentación histórica; los datos nuevos
empiezan cuando cada usuario actualiza. Guardados anteriores no se transmiten.
No es posible reconstruir retrospectivamente quién usó Guardar.
