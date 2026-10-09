# Entrega 1.0.57 (115) · 9 de octubre de 2026

Publicada en prueba interna de Google Play y confirmada instalada en el iPhone por USB mediante InstallComplete. El S22 está desconectado: la entrega es por Google Play y su instalación de 115 no está confirmada desde la Mac. Producción Android sigue en 1.0.48 (106). No se subió la 115 a Apple.

Incluye todos los cambios de la 112 y los ajustes aprobados: títulos únicos con Volver al destino correcto en categorías, subcategorías, Guardados, Cronología e Información. Las 201 pruebas de app pasaron; 10 casos comprobaron etiquetas y accesibilidad de regreso. Se verificaron en navegador Bebidas vegetales, Café y Cervezas, con regreso correcto a la categoría padre. Compilación web única y sincronización Android/iOS; los 111 archivos web empaquetados son idénticos. Android release firmado y versión 115 comprobada; iPhone Debug físico compilado y firmado.

La auditoría previa comprobó 198 pruebas de app, 12 Android, 6 servidor, 60 Hub y 156 de publicación remota. Presentación remota publicada en main por PR #10: 115 categorías, 15 fotos transparentes y 35 recursos referenciados verificados. Copia central con 1.117 productos y fichas completas. Los datos remotos cambian sin otro paquete en clientes compatibles; diseño y lógica nativa requieren actualización.

Pendientes documentados: QA física completa de descarga/reinicio sin conexión, cámara/escáner, APNs y eventos reales de analítica/Vistos; cuatro fuentes Free Chips ausentes/404; información solicitada por Apple y recuperación independiente de cuentas, clave del Hub y código/archivos. La demo web pública todavía usa frontend 1.0.48. No se afirma recuperación completa por metadata.

Fuente final respaldada en GitHub, PR #11. Informe de entrega: `2026-10-09-internal-115-delivery.json`; auditoría: `2026-10-09-full-audit.json`.

## Pendiente posterior a 115: actualización desde Inicio

La cápsula Actualizar ahora comparte data-app-update con Más → Actualizar. Android intenta el flujo flexible de Google Play dentro de la app y permite completar la instalación cuando la descarga finaliza. Conserva la tienda como alternativa si Google no permite iniciar el flujo. iOS conserva su enlace de distribución. 201 pruebas aprobadas y prepare:mobile completado; recursos web sincronizados. Requiere nueva entrega: no está en el paquete 115 ya publicado ni instalado. No se incrementó la versión ni se publicó otro paquete. Verificación física requiere instalar este cliente desde Play y ofrecer un versionCode superior.
