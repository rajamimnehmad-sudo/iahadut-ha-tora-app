# Iahadut HaTora

Proyecto fuente para continuar construyendo el buscador de productos kosher de Iahadut HaTora.

## Estado

La aplicación se desarrolla primero para Android, pero la interfaz y la lógica viven en `web/`. Android e iOS son contenedores Capacitor; por eso el paso posterior a iPhone no requiere reescribir la app.

La fuente web es compartida para Android, iOS y navegador mediante Capacitor. La configuración multiplataforma está en `package.json` y `capacitor.config.json`.

La sincronización consulta las categorías oficiales, descarga sus páginas, elimina duplicados por URL y guarda el catálogo en `localStorage`. Se intenta al iniciar, al volver la app a primer plano, cuando vuelve la conexión y se puede forzar tocando el estado de sincronización. La app muestra primero la copia incluida o guardada y actualiza el contenido en segundo plano para que las secciones abran sin esperar.

En el primer arranque online se completa una preparación inicial: se descargan las fichas, las imágenes y la información necesaria para que las páginas de productos abran desde la copia local. La preparación puede tardar, pero se realiza una sola vez por versión de contenido. En las revisiones posteriores de 12 horas o al actualizar manualmente, se comparan los productos y se descargan únicamente los nuevos, eliminados o modificados, junto con sus imágenes nuevas.

En Vite local, las consultas pasan por el proxy `/vaad-api`. En la web pública de GitHub Pages usan la función proxy pública de Supabase, porque `vaad.ar` no publica CORS. En Android/iOS, el código usa `CapacitorHttp` nativo; de esa forma el APK puede actualizarse sin depender de un proxy web. Las respuestas se reintentan hasta tres veces y se conserva la última copia válida si el teléfono está sin conexión.

La actualización de 12 horas en el cliente se ejecuta al iniciar o reanudar la app y no puede ejecutarse mientras el teléfono está completamente cerrado. Para cubrir también los teléfonos cerrados, `.github/workflows/catalog-alerts.yml` consulta la fuente oficial cada 12 horas, compara altas y bajas, actualiza las instantáneas y envía FCM al tema `catalog-updates` cuando hay una novedad. El workflow requiere el secreto de GitHub `FCM_SERVICE_ACCOUNT_JSON`; si falta, falla sin confirmar el estado de la alerta para que el próximo intento no pierda el push.

## Catálogo central en Firebase

El catálogo central autorizado se guarda en Firestore en `catalog_products`. La copia incluida en `web/data/catalog.json` se mantiene para que la aplicación abra rápido y pueda funcionar sin conexión; Firestore es la fuente central para altas, cambios y bajas autorizadas.

El workflow `.github/workflows/firebase-catalog.yml` realiza este circuito:

1. Consulta nuevamente la fuente oficial y prepara la copia autorizada del catálogo. El enriquecimiento de códigos de barras queda separado y pausado hasta una revisión específica; la sincronización no altera esos datos por accidente.
2. Solo conserva códigos GTIN/EAN/UPC con dígito verificador válido y coincidencia inequívoca de producto, marca y variante. Las coincidencias ambiguas quedan sin código.
3. Genera un plan de altas, cambios y bajas sin escribir todavía.
4. Espera la aprobación del entorno protegido `catalog-production`.
5. Recién después actualiza Firestore. Los productos dados de baja se archivan en `catalog_archive` y se eliminan de `catalog_products`, por lo que dejan de aparecer en el catálogo activo pero se conserva una trazabilidad mínima para poder auditar o restaurar.

Para habilitar la primera carga hay que crear en GitHub el entorno protegido `catalog-production`, agregar al menos un revisor requerido y guardar los secretos `FIREBASE_SERVICE_ACCOUNT_JSON` y `FCM_SERVICE_ACCOUNT_JSON` donde corresponda. Esas cuentas deben tener únicamente permisos de servidor; no se deben poner en la aplicación ni en el repositorio. La primera ejecución manual usa `seed`; las siguientes usan `incremental` y se ejecutan cada 12 horas, siempre con aprobación antes de escribir. El push real requiere instalar una APK/AAB nativa, aceptar el permiso de notificaciones y activar los avisos desde la app.

- Web: `web/`
- App Android Capacitor: `android/`
- App iOS Capacitor: `ios/`
- Wrapper Android original de referencia: `app/`
- Configuración multiplataforma: `capacitor.config.json`
- Paquete: `ar.vaad.catalogo.app`
- Versión fuente: `0.11.8` (código 23)
- APK original de referencia: `Iahadut-HaTora-v12-3.apk`

## Compilar Android Capacitor

Con Android Studio o con Java y el SDK Android configurados:

```bash
cd android
./gradlew assembleDebug
```

La APK de salida queda en `android/app/build/outputs/apk/debug/app-debug.apk`.

## Live reload en dispositivos

Requiere Node 22 o superior. Con la Mac y el dispositivo en la misma red:

```bash
npm run dev -- --host 0.0.0.0
```

Vite muestra una dirección `Network` que se puede abrir directamente en el navegador del teléfono. Para probar además las funciones nativas dentro de la app —cámara, botón Atrás y barras del sistema— usar:

```bash
PATH=/opt/homebrew/opt/node/bin:$PATH npm run cap:android:live
PATH=/opt/homebrew/opt/node/bin:$PATH npm run cap:ios:live
```

Para el trabajo diario en Android, usar `npm run build:sync` antes de abrir Android Studio. No se debe editar la carpeta `android/` para cambiar pantallas: los cambios de producto van en `web/` y luego se sincronizan a las dos plataformas. El directorio raíz `app/` es un wrapper Android anterior y no es el proyecto Capacitor canónico.

Android requiere Android Studio, Java y un dispositivo autorizado por ADB. iPhone requiere Xcode completo, CocoaPods y un dispositivo confiado por la Mac.

El lector usa el escáner nativo de Capacitor en Android/iOS. Un código externo se utiliza solo para identificar el nombre o la marca y buscar coincidencias dentro del catálogo oficial; no autoriza automáticamente productos.

## Próximas mejoras

La siguiente etapa debería agregar monitoreo centralizado de la sincronización y pruebas físicas de regresión en varios tamaños de Android y iPhone.
