# Iahadut HaTora

Proyecto fuente para continuar construyendo el buscador de productos kosher de Iahadut HaTora.

## Estado

La aplicación se desarrolla primero para Android, pero la interfaz y la lógica viven en `web/`. Android e iOS son contenedores Capacitor; por eso el paso posterior a iPhone no requiere reescribir la app.

La fuente web es compartida para Android, iOS y navegador mediante Capacitor. La configuración multiplataforma está en `package.json` y `capacitor.config.json`.

La sincronización consulta primero la versión publicada en Firestore (`catalog_metadata/current`). Si la versión local ya coincide, termina sin descargar productos; si cambió, lee únicamente los productos activos modificados y las bajas archivadas desde la última versión. Para una instalación nueva, una versión perdida o una caída de Firebase conserva como respaldo la lectura de las categorías oficiales, elimina duplicados por URL y guarda el catálogo en `localStorage`. Se intenta al iniciar, al volver la app a primer plano, cuando vuelve la conexión y se puede forzar tocando el estado de sincronización. La app muestra primero la copia incluida o guardada y actualiza el contenido en segundo plano para que las secciones abran sin esperar.

En el primer arranque online se completa una preparación inicial: se descargan las fichas, las imágenes y la información necesaria para que las páginas de productos abran desde la copia local. La preparación puede tardar, pero se realiza una sola vez por versión de contenido. En las revisiones posteriores de 12 horas o al actualizar manualmente, se comparan los productos y se descargan únicamente los nuevos, eliminados o modificados, junto con sus imágenes nuevas.

En Vite local, las consultas pasan por el proxy `/vaad-api`. En la web pública de GitHub Pages usan primero la Cloud Function `vaadProxy` de Firebase, porque `vaad.ar` no publica CORS; la función solo admite URLs de ese dominio. La URL de Supabase queda como respaldo temporal hasta desplegar la función en todos los entornos. En Android/iOS, el código usa `CapacitorHttp` nativo; de esa forma el APK puede actualizarse sin depender de un proxy web. Las respuestas se reintentan hasta tres veces y se conserva la última copia válida si el teléfono está sin conexión.

La actualización de 12 horas en el cliente se ejecuta al iniciar o reanudar la app y no puede ejecutarse mientras el teléfono está completamente cerrado. Para cubrir también los teléfonos cerrados, `.github/workflows/catalog-alerts.yml` consulta la fuente oficial cada 12 horas, compara altas y bajas, actualiza las instantáneas y envía FCM al tema `catalog-updates` cuando hay una novedad. El workflow requiere el secreto de GitHub `FCM_SERVICE_ACCOUNT_JSON`; si falta, falla sin confirmar el estado de la alerta para que el próximo intento no pierda el push.

## Catálogo central en Firebase

El catálogo central autorizado se guarda en Firestore en `catalog_products`. La copia incluida en `web/data/catalog.json` se mantiene para que la aplicación abra rápido y pueda funcionar sin conexión; Firestore es la fuente central para altas, cambios y bajas autorizadas.

El workflow `.github/workflows/firebase-catalog.yml` realiza este circuito:

1. Consulta nuevamente la fuente oficial y prepara la copia autorizada del catálogo. El enriquecimiento de códigos de barras queda separado y pausado hasta una revisión específica; la sincronización no altera esos datos por accidente.
2. Solo conserva códigos GTIN/EAN/UPC con dígito verificador válido y coincidencia inequívoca de producto, marca y variante. Las coincidencias ambiguas quedan sin código.
3. Genera un plan de altas, cambios y bajas sin escribir todavía.
4. Espera la aprobación del entorno protegido `catalog-production`.
5. Recién después actualiza Firestore. Los productos dados de baja se archivan en `catalog_archive` y se eliminan de `catalog_products`, por lo que dejan de aparecer en el catálogo activo pero se conserva una trazabilidad mínima para poder auditar o restaurar.

El proxy web de Firebase está en `functions/`. Para publicarlo, instalar Firebase CLI, iniciar sesión con la cuenta del proyecto y ejecutar `firebase deploy --only functions:vaadProxy --project iahadut-hatora`. El despliegue requiere que el proyecto tenga habilitado el plan de facturación correspondiente a Cloud Functions.

Para habilitar la primera carga hay que crear en GitHub el entorno protegido `catalog-production`, agregar al menos un revisor requerido y guardar los secretos `FIREBASE_SERVICE_ACCOUNT_JSON` y `FCM_SERVICE_ACCOUNT_JSON` donde corresponda. Esas cuentas deben tener únicamente permisos de servidor; no se deben poner en la aplicación ni en el repositorio. La primera ejecución manual usa `seed`; las siguientes usan `incremental` y se ejecutan cada 12 horas, siempre con aprobación antes de escribir. El push real requiere instalar una APK/AAB nativa, aceptar el permiso de notificaciones y activar los avisos desde la app.

- Web: `web/`
- App Android Capacitor: `android/`
- App iOS Capacitor: `ios/`
- Wrapper Android original de referencia: `app/`
- Configuración multiplataforma: `capacitor.config.json`
- Paquete: `ar.vaad.catalogo.app`
- Versión fuente: `0.11.18` (código 33)
- APK original de referencia: `Iahadut-HaTora-v12-3.apk`

## Compilar Android Capacitor

Con Android Studio o con Java y el SDK Android configurados:

```bash
cd android
./gradlew assembleDebug
```

La APK de salida queda en `android/app/build/outputs/apk/debug/app-debug.apk`.

## Release Android para Google Play

La aplicación ya existe en Google Play. Cada actualización debe conservar exactamente estos datos:

- `applicationId`: `ar.vaad.catalogo.app`
- Versión actual del código fuente: `0.11.18`
- `versionCode` actual: `33` (debe aumentar en cada actualización)
- `minSdkVersion`: `26`
- `targetSdkVersion` y `compileSdkVersion`: `36`

### Estado confirmado en Play Console

Al 8 de septiembre de 2026, la ficha correcta es `Iahadut HaTora` con paquete `ar.vaad.catalogo.app`. Play Console muestra activa la versión `0.11.17` con `versionCode` `32` en la prueba cerrada; la producción todavía figura inactiva. La versión local `0.11.18` con código `33` es la próxima actualización que se preparará para Play.

La prueba cerrada muestra 12 verificadores con 2 días consecutivos. Para solicitar acceso a producción, Play indica que deben mantenerse al menos 12 verificadores durante 14 días consecutivos y luego completar la solicitud correspondiente.

La clave localizada en la Mac parece ser una upload key (`iahadut-upload`). Su certificado debe compararse en Play Console con el certificado de carga registrado antes de generar el próximo AAB; no debe compararse con la app signing key que Google usa para firmar los APK finales.

### Firma

No generar una clave nueva para una actualización. Hay que utilizar la clave de subida que corresponda a la aplicación existente en Play Console. Si Play App Signing está activo, el archivo local debe estar firmado con la upload key registrada; Google firma y distribuye los APK finales con su app signing key.

La configuración local se guarda en `android/keystore.properties`, que está excluida de Git. Usar `android/keystore.properties.example` como referencia, sin completar ni subir contraseñas al repositorio. El archivo `.jks` tampoco debe subirse.

La configuración de Gradle permite ejecutar tests y builds debug sin la clave, pero bloquea intencionalmente `assembleRelease` y `bundleRelease` cuando falta una firma completa. Esto evita crear accidentalmente un release no publicable.

### Crear el AAB

Usar Java 21 o una versión compatible con el Gradle del proyecto. Android Studio/JBR 25 puede no ser compatible con el wrapper actual.

```bash
npm ci
npm run build
npx cap sync android
cd android
./gradlew test
./gradlew bundleRelease
```

El archivo publicable queda en `android/app/build/outputs/bundle/release/app-release.aab`. Antes de subirlo, verificar el certificado y el código de versión contra Play Console. Nunca usar `app-debug.apk` para publicar.

### Validación de una actualización

La actualización dentro de la app solo se puede validar correctamente con una instalación proveniente de Google Play. Una APK instalada por ADB, Taildrop o Tailscale sirve para probar funciones locales, pero no confirma Play Core ni el flujo de actualización de Play.

El orden recomendado es:

1. Subir el AAB a una pista de prueba interna o cerrada.
2. Instalarlo desde Play con la misma cuenta de tester.
3. Probar búsqueda, filtros, scanner, permisos, notificaciones y actualización.
4. Confirmar que los datos de Firebase, la política de privacidad y el formulario de Seguridad de los datos describen el comportamiento real.
5. Recién después promover la versión a producción.

### Secretos y publicación

Las cuentas de servicio de Firebase/FCM y las claves de firma solo pueden vivir en el almacén seguro local o en secretos protegidos de GitHub. No deben aparecer en commits, logs, APKs de prueba compartidas ni archivos de configuración del frontend.

Actualmente el workflow automatizado genera solamente un APK debug; todavía no hay un workflow de release firmado que publique un AAB. La publicación debe hacerse manualmente hasta definir ese pipeline y sus secretos.

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
