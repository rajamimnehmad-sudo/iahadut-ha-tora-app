# Entrega 1.0.59 (117) · 9 de octubre de 2026

Publicada en prueba interna de Google Play e instalada en el iPhone por USB mediante InstallComplete. El S22 está desconectado: entrega por Google Play; instalación 117 no confirmada desde la Mac. Producción Android sigue 1.0.48 (106). No se subió 117 a Apple/TestFlight.

Usar sin conexión: Android descarga hasta tres fotos a la vez, guarda cada archivo validado de manera atómica y conserva las fotos ya guardadas al pausar o reintentar. El contador compartido se actualiza con el número de fotos, incluso cuando el porcentaje redondeado no cambia; cada foto guardada puede usarse antes de que termine el catálogo. iPhone conserva su sesión de descarga nativa con tres conexiones por servidor y recibe la corrección de progreso. El estado nativo se consulta cada tres segundos en primer plano; pueden aparecer varias fotos terminadas entre consultas. No se añadió sondeo en segundo plano ni permisos nuevos. La velocidad depende de la red y de la fuente; no se midió una mejora física en el S22.

Verificación: 203 pruebas de app y 14 pruebas Android correctas. La prueba de concurrencia exige que tres transferencias se superpongan y verifica que las seis fotos de la muestra sobrevivan en el manifiesto final. Se comprobaron progreso por foto antes del primer punto porcentual, disponibilidad parcial, pausa, reintentos, fuentes ausentes y reapertura. Compilación web única sincronizada en Android/iOS, recursos empaquetados idénticos, Android release firmado y compilación iPhone físico firmada.

Conserva las entregas anteriores, incluida la cápsula Actualizar ahora con flujo flexible de Google Play (116), títulos únicos, botones de servicios sin flechas, imágenes transparentes y correcciones móviles. Los datos y presentación remota compatibles se pueden actualizar sin nuevo paquete; lógica y cambios nativos requieren actualización.

Pendientes: QA física completa de descarga/reinicio sin conexión, cámara/escáner, APNs, eventos reales de analítica/Vistos y flujo Google Play con una versión superior disponible. Cuatro fuentes Free Chips ausentes/404; información solicitada por Apple y recuperación independiente de cuentas, clave del Hub y código/archivos. Demo pública conserva frontend 1.0.48. No se declara respaldo completo por metadata.

Fuente de 117 respaldada en GitHub, PR #11. Informe: `2026-10-09-internal-117-delivery.json`.
