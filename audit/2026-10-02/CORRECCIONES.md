# Revisión de las correcciones para Android 1.0.26 / 79

Código y paquete verificados localmente. El pase a producción todavía requiere publicar los cambios del servidor y comprobar push en un teléfono. No se enviaron avisos al topic público ni se promovió una versión en Play.

## Correcciones

- Push exclusivamente manual; el actualizador de catálogo ya no envía FCM. Enviar requiere ejecutar el workflow manual y marcar Enviar; la opción inicial solo muestra una vista previa.
- Retirada individual de Alertas mediante el identificador del aviso. No hay vencimiento por días ni descarte por cantidad. El registro de retiradas se consulta al inicio, al reanudar y al abrir Alertas; se conserva offline para impedir la reaparición por una entrega atrasada. Requiere publicar registro/workflows en main y actualizar la app. No retira avisos ya mostrados en la bandeja de Android.
- Historial Android persistido antes de que FCM muestre el aviso en segundo plano; importación al entrar desde el icono o tocar la notificación. Deduplicación y limpieza posterior a la importación.
- Opt-in explícito, respeto de la desactivación ante rotación de token, rechazo de token vacío, reintento de permiso con rationale y guía a Ajustes. Canal v2 e icono pequeño dedicados. createChannel limitado a Android.
- Recuperación de caché 1048 mal marcada con la versión de la instantánea 1109. El arranque y Actualizar ahora reparan la inconsistencia; un catálogo autorizado estrictamente más nuevo sigue conservando sus bajas legítimas. El contador visible se refresca con el catálogo.
- 1109 productos y 1109 fichas en formato 1. Los 18 Destacados pertenecen a la colección activa. Inicio, búsqueda, fichas, categorías y Guardados usan esa misma colección; los avisos históricos no reinsertan productos retirados.
- La descripción guardada se mantiene al fallar una actualización online/offline.
- Firestore reconcilia diferencias de cantidad en ambos sentidos, conserva la copia ante descargas parciales o metadata cambiante y rechaza publicaciones en curso. La publicación multibatch marca syncInProgress hasta el final.
- El workflow Firebase admite la credencial existente como respaldo; aún falta comprobar sus permisos datastore mediante una ejecución real. La extracción incompleta ya no publica una copia antigua con una fecha nueva.
- WorkManager publica las tres instantáneas como un único archivo reemplazado atómicamente; exige fichas para todos los productos y comprueba que no cambió la versión durante la descarga.
- Publicación interna/producción dejó de fijar la versión 74: valida los datos de la versión solicitada y el código real devuelto al subir el AAB. No se ejecutaron esos workflows.

## Evidencia

- 24 pruebas JavaScript aprobadas: cache, actualización manual offline, reconciliación Firestore, protección de bajas y snapshots parciales, permisos, desactivación, envío manual y retirada persistente.
- 4 pruebas funcionales nativas de PushHistoryStore aprobadas mediante Robolectric: persistencia/deduplicación, conservación de 40 avisos, lectura y llegada posterior, preferencia de desactivación. El test previo 2+2 también pasa, pero no se cuenta como evidencia funcional.
- Build web, Capacitor sync, Gradle bundleRelease y git diff --check aprobados.
- Los 64 archivos web empaquetados coinciden byte a byte con dist. jarsigner confirma jar verified (firma íntegra; no compara contra la upload key registrada en Play).
- Navegador integrado: búsqueda de aceite, apertura de ficha oficial, guardado y aparición en Guardados, ficha y tiendas certificadas sin conexión, pantalla Más, actualización manual completada con 1109 productos. Las 54 imágenes del carrusel (18 productos repetidos tres veces para el desplazamiento) están cargadas.
- Evidencia visual: destacados-corregidos.jpg.
- AAB: release-artifacts/internal-79/iahadut-1.0.26-79.aab.
- SHA256: 7cc3eeb32d297b55d86b7e246366b5bf35b3fb9a53a8374627ff3beb859f2977.

## Pendientes reales para autorizar producción

1. Revisar y publicar las correcciones en main. Se activó la cuenta propietaria rajamimnehmad-sudo en la CLI y se confirmó permiso ADMIN; las correcciones se suben a una rama de revisión, sin promover una versión en Play. El workflow antiguo de alertas figura disabled_manually; reactivar la actualización de instantáneas únicamente una vez publicado el cambio que elimina push automáticos.
2. Confirmar un ciclo incremental Firebase exitoso y permisos datastore de la cuenta usada. La corrección de la referencia a secretos no demuestra que la cuenta tenga permisos de escritura.
3. Probar instalación nueva y actualización desde una versión anterior en la pista interna, push al tema individual con la app abierta/cerrada y desde icono, permisos/reintento/desactivación, retirada de una alerta con conexión y reconexión. El usuario informó que por ahora no tiene Android de prueba; ADB no tiene dispositivos conectados.
4. Cámara, compartir nativo y Play Core requieren teléfono; no están verificados físicamente. Confirmar las pistas actuales de Play antes de promover 79. No se habilita un release iOS: faltan su configuración Firebase/APNs y pruebas propias.
