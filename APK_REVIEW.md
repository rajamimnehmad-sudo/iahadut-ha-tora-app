# Revisión de Iahadut HaTora v12-3

## Identidad de la APK

- Aplicación: `Iahadut HaTora`
- Paquete: `ar.vaad.catalogo.app`
- `versionCode`: `12`
- `versionName`: `0.9.0`
- `minSdkVersion`: `23`
- `targetSdkVersion`: `28`
- Actividad de inicio: `ar.vaad.catalogo.app.MainActivity`
- Permisos: Internet y cámara

## Estructura

La APK contiene una sola clase DEX pequeña, el manifest, los recursos compilados y dos imágenes. No contiene layouts Android, bases de datos, librerías nativas ni un catálogo local completo.

La interfaz está embebida como HTML/CSS/JavaScript dentro de `classes.dex` y se muestra mediante un `WebView`. La capa Android agrega el acceso a cámara y el puente `vaadscan://start` para iniciar el lector.

## Funciones confirmadas

- Inicio con buscador por producto o marca.
- Catálogo con cuatro categorías: autorizados en góndola, plantas certificadas, producción especial kosher y góndola Uruguay.
- Búsqueda normalizada sin diferencias de mayúsculas ni acentos.
- Filtros por categoría.
- Fichas de producto con imagen, descripción y datos adicionales obtenidos desde la web oficial.
- Productos guardados mediante `localStorage`.
- Historial de hasta cinco búsquedas recientes.
- Alertas sincronizadas desde la página oficial de alertas.
- Sección de información: tiendas, catering, notas Kashrut, certificaciones mundiales, certificación de plantas, quiénes somos y contacto.
- Escáner de códigos EAN/UPC mediante cámara y `BarcodeDetector`.
- Ingreso manual de código de barras.
- Consulta alternativa a Open Food Facts y asociación manual de coincidencias.
- Catálogo inicial offline de seis productos para mostrar contenido mientras sincroniza.

## Sincronización

La app consulta `https://vaad.ar/` y sus categorías oficiales. Descarga las páginas de productos en grupos de 24, evita duplicados por URL y guarda el catálogo en el almacenamiento local. La sincronización del catálogo y las alertas se revisa cada 12 horas; también hay una comprobación de seguridad semanal.

Los conteos iniciales esperados son 467 productos de góndola, 309 de plantas certificadas, 63 de producción especial y 201 de Uruguay: 1.040 en total. La app considera completa la descarga cuando reúne al menos el 97% del conteo esperado y más de 900 registros.

## Riesgos y deuda técnica

1. La APK no incluye el código fuente original: para mantenerla habrá que reconstruir la web embebida y la capa Android.
2. El catálogo depende directamente de la estructura HTML de `vaad.ar`; cualquier cambio del sitio puede romper la sincronización.
3. Las imágenes y fichas se cargan desde URLs externas, por lo que el modo offline es limitado.
4. El lector depende de que el WebView soporte `BarcodeDetector`; si no, solo queda disponible la carga manual.
5. La consulta a Open Food Facts ayuda a encontrar candidatos, pero no prueba que un producto sea kosher: la validación final debe venir del catálogo oficial.
6. `targetSdkVersion 28` es antiguo y conviene actualizarlo al reconstruir la app, especialmente para permisos y compatibilidad Android moderna.
7. La APK recibida no trae una base completa preempaquetada: el primer uso con conexión es importante para descargar el catálogo.

## Recomendación para continuar

Crear un proyecto fuente separado con una web clara (HTML/CSS/JavaScript o React) y una capa Android moderna que conserve el contrato actual: catálogo oficial de Iahadut HaTora, favoritos locales, alertas, fichas y escáner. Antes de modificar el diseño conviene definir si la fuente oficial seguirá siendo `vaad.ar` o si se incorporará un backend propio para evitar depender del scraping desde el teléfono.
