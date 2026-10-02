# Revisión de Android 1.0.26 / 80 y servidor

La versión 80 está publicada en la pista interna de Google Play. Firebase ya contiene el catálogo completo. El código de distribución pública y los workflows nuevos permanecen en el PR de revisión; todavía deben publicarse en main. La validación física de push está pendiente de volver a conectar el S22. No se promovió una versión a producción ni se enviaron avisos al topic público.

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
- Retirada individual mediante identificador del aviso, conservada offline para impedir reaparición de entregas atrasadas. Requiere publicar registro y workflow en main. Retira la entrada de Alertas; no elimina avisos ya mostrados por Android.
- El diagnóstico USB registra únicamente el tema individual derivado por hash cuando ADB está activado, nunca el token FCM. Permite dirigir la prueba al S22 sin avisar a todos los usuarios.

## Evidencia y límites

- 38 pruebas JavaScript aprobadas: caché, recuperación, reconciliación, publicación parcial, permisos, envío manual, retirada, proxy, manifiesto sin cambios, descargas incrementales, verificación de huellas y ausencia de tráfico Firestore en actualización/popularidad.
- 4 pruebas funcionales nativas de historial aprobadas con Robolectric; build web, Capacitor sync, bundleRelease y git diff --check aprobados. El test previo 2+2 también pasa y no se cuenta como evidencia funcional.
- CI del último cambio de código: ejecución 37059186130 aprobada.
- Firebase: ejecución 37058135667 exitosa. Lectura real con autenticación de usuario anónimo comprobó metadata, ficha completa y contenido complementario. Reglas publicadas para catalog_content de solo lectura; la escritura desde clientes sigue denegada.
- Publicador real → cliente: manifiesto y delta reconstruyen una copia verificada de 1109 productos. Repetir una generación idéntica no reescribe el catálogo ni crea cambios nuevos.
- Navegador integrado: las fotos de Destacados cargan; Actualizar catálogo termina con 1109 productos. Búsqueda, fichas, Guardados y contenido sin conexión fueron comprobados durante la auditoría.
- Play interno 80: ejecución 37059246489 exitosa. AAB release-artifacts/internal-80/iahadut-1.0.26-80.aab. SHA256 c14292371d90a145d76485a7b041738d96c349afbe2719ba82dc1a28cff521e6.

## Pendiente antes de producción

1. Publicar el PR en main para que existan el manifiesto estático, los cambios, el registro de retiradas y los workflows manuales; reactivar el actualizador de catálogo seguro. El antiguo workflow está desactivado manualmente y no se reactivó con su código anterior.
2. Actualizar el S22 desde Play, comprobar push privado abierto/cerrado/desde icono, permiso/desactivación y retirada online/offline. El teléfono se autorizó por USB y se comprobó la instalación 78 de Play; después se desconectó. El propietario avisará al volver a conectarlo.
3. Cámara, compartir nativo y Play Core necesitan la prueba física. No están verificados. iOS tampoco queda habilitado: faltan configuración Firebase/APNs y pruebas propias.
