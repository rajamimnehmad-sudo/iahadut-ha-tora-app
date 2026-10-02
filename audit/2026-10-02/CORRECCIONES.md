# Revisión de Android 1.0.26 / 80 y servidor

La versión 80 está publicada en la pista interna de Google Play. Firebase ya contiene el catálogo completo. El PR 1 fue integrado a main con autorización del propietario. El workflow seguro fue reactivado y su ejecución 37060617579 terminó correctamente: 1109 productos, 0 altas, 0 modificaciones y 0 bajas. La versión 80 instalada desde Play fue probada en el S22 por USB. No se promovió una versión a producción ni se enviaron avisos al topic público.

## Catálogo y cuota gratuita

- Base central actualizada y comprobada: 1109 productos con sus fichas completas, 8 secciones y 35 fichas complementarias. Sincronización real: 64 altas, 1045 modificaciones (incluye incorporar fichas) y 1 baja archivada. La cuenta usada por el workflow tiene permisos de lectura/escritura, comprobados mediante ejecución real.
- Cada producto conserva nombre, marca, categoría, código verificado, descripción, referencias de fotos y demás campos de su ficha. Las referencias de fotos no equivalen a almacenar todos los archivos de imagen en Firebase.
- El servidor revisa la fuente cada 12 horas, publica una copia completa y cambios inmutables y escribe en Firestore solamente las diferencias. Ya no hay dos extracciones programadas independientes. Una extracción incompleta no publica datos nuevos ni borra productos válidos.
- La app 80 consulta un manifiesto estático y descarga únicamente los cambios desde la copia guardada; obtiene una copia completa cuando necesita recuperarse. Compara su huella y exige fichas para todos los productos antes de cambiar el catálogo visible. La copia anterior se conserva ante error.
- Actualizar ahora verifica la última copia publicada por el servidor. Las pulsaciones no disparan una extracción de vaad.ar ni escrituras en la base. La comprobación automática de la app se limita a cada 12 horas cuando se utiliza.
- El recorrido del catálogo y los contadores de popularidad de la app 80 no leen ni escriben documentos de Firestore por usuario. La popularidad queda en el teléfono. Se cancela el antiguo WorkManager que descargaba todos los archivos por teléfono; se conserva su caché anterior para migrar instalaciones.
- La cuota gratuita de Firestore es 50000 lecturas y 20000 escrituras por día. Las dos comparaciones del servidor del catálogo actual rondan 2218 lecturas/día, independientes de la cantidad de usuarios. No se garantiza capacidad ilimitada de los proveedores gratuitos. Las versiones anteriores de la app todavía pueden consumir lecturas/escrituras hasta que se actualicen.
- Cloud Billing permanece desactivado. No se contrató un servicio pago. Supabase devuelve 402 por exceed_storage_size_quota; Cloud Functions no está habilitado y su proxy devuelve 404. El catálogo 80 no depende de esos proxies. El proxy preparado valida destino/redirecciones, tamaño y tiempo de respuesta, pero no está desplegado. La URL de respaldo Supabase se retiró de las consultas activas y se conserva comentada; este ajuste llegó después de compilar la versión 80 y queda para el próximo AAB. El proyecto remoto Supabase no se modificó.

## App y push manual

- Reparación de la caché 1048 mal identificada con la versión del catálogo completo. Se conserva una copia autorizada más nueva aunque contenga bajas legítimas. Inicio, búsqueda, fichas, categorías y Guardados comparten la colección activa; los 18 Destacados pertenecen a ella.
- Push exclusivamente manual. La actualización del catálogo no envía FCM. El workflow de envío inicia en vista previa; enviar requiere marcar su opción explícita. Respeta desactivación, rotación de token, permisos y canal Android v2.
- Historial nativo persistido antes de mostrar avisos en segundo plano; recuperación desde icono o toque en la notificación. Sin límite de cantidad ni vencimiento del historial.
- Retirada individual mediante identificador del aviso, conservada offline para impedir reaparición de entregas atrasadas. Registro y workflow publicados en main. Retira la entrada de Alertas; no elimina avisos ya mostrados por Android.
- El diagnóstico USB registra únicamente el tema individual derivado por hash cuando ADB está activado, nunca el token FCM. Permite dirigir la prueba al S22 sin avisar a todos los usuarios.

## Evidencia y límites

- 38 pruebas JavaScript aprobadas: caché, recuperación, reconciliación, publicación parcial, permisos, envío manual, retirada, proxy, manifiesto sin cambios, descargas incrementales, verificación de huellas y ausencia de tráfico Firestore en actualización/popularidad.
- 4 pruebas funcionales nativas de historial aprobadas con Robolectric; build web, Capacitor sync, bundleRelease y git diff --check aprobados. El test previo 2+2 también pasa y no se cuenta como evidencia funcional.
- CI del último cambio de código: ejecución 37059186130 aprobada.
- Firebase: ejecución 37058135667 exitosa. Lectura real con autenticación de usuario anónimo comprobó metadata, ficha completa y contenido complementario. Reglas publicadas para catalog_content de solo lectura; la escritura desde clientes sigue denegada.
- Publicador real → cliente: manifiesto y delta reconstruyen una copia verificada de 1109 productos. Repetir una generación idéntica no reescribe el catálogo ni crea cambios nuevos.
- Navegador integrado: las fotos de Destacados cargan; Actualizar catálogo termina con 1109 productos. Búsqueda, fichas, Guardados y contenido sin conexión fueron comprobados durante la auditoría.
- Play interno 80: ejecución 37059246489 exitosa. AAB release-artifacts/internal-80/iahadut-1.0.26-80.aab. SHA256 c14292371d90a145d76485a7b041738d96c349afbe2719ba82dc1a28cff521e6.

## Pruebas físicas del S22 — 2 de octubre

- Android 16, SM-S908E, versión 80 instalada desde Google Play. Permiso rechazado: avisos desactivados; segundo intento autorizado: suscripción correcta.
- Push privado con app abierta: ejecución 37060904483, visible en Alertas una vez.
- Proceso cerrado mediante am kill después de ir a Inicio: ejecución 37060960004. FCM inició el proceso y conservó el aviso; recuperado al abrir por el icono, sin duplicado.
- Desactivación: ejecución 37061043607 aceptada por FCM para el tema anterior; el aviso no apareció en el teléfono. Reactivar cambió el tema individual al rotar el token.
- Retirada: ejecución 37061000892 borró solo el identificador 6d90841e-fe3e-4e93-8ac9-23154e2c8312. El otro aviso permaneció. Se reflejó tras varios minutos de propagación. Sin Wi-Fi y datos móviles, el aviso retirado no reapareció. Ambas conexiones se restauraron.
- Actualización manual en el teléfono: completada, 1109 productos. Fecha oficial 01/10/2026, diferente de la fecha de extracción del servidor.
- Fotos de Destacados y fichas verificadas. Buscar aceite devolvió 32 productos; ficha de aceite de coco Chennai con foto y descripción. Compartir abrió el selector nativo de Android; se canceló sin enviar contenido.
- Cámara: permiso rechazado, nuevo intento con permiso temporal, lector abierto y cancelado correctamente. Decodificación de un producto físico todavía pendiente.
- Hallazgos menores corregidos para 81: hora nueva de Alertas en 24 horas; permiso previo de cámara con salida manual en español, evitando el diálogo inglés del SDK. Incluye la pausa local del respaldo Supabase posterior al AAB 80.
- Build 81 y 38 pruebas JavaScript aprobados; pruebas nativas aprobadas durante bundleRelease/testReleaseUnitTest. Publicación interna y comprobación física de 81 pendientes.

## Pendiente antes de producción

1. Completar toque de notificación y verificar los ajustes de 81 mediante actualización desde Play.
2. Decodificación real de un producto con cámara. iOS necesita configuración Firebase/APNs y pruebas propias.
3. La versión interna no se promovió a producción. Ninguna prueba envió al tema público.
