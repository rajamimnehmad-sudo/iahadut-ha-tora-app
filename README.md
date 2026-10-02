# Iahadut HaTora

Proyecto fuente para continuar construyendo el buscador de productos kosher de Iahadut HaTora.

## Estado

La aplicación se desarrolla primero para Android, pero la interfaz y la lógica viven en `web/`. Android e iOS son contenedores Capacitor; por eso el paso posterior a iPhone no requiere reescribir la app.

La fuente web es compartida para Android, iOS y navegador mediante Capacitor. La configuración multiplataforma está en `package.json` y `capacitor.config.json`.

La app consulta un manifiesto estático en `web/data/published/`. Si su huella coincide con la copia guardada, conserva el catálogo; si cambió, descarga los cambios inmutables desde su última versión y comprueba la huella y la presencia de todas las fichas antes de aplicarlos. Una instalación sin copia válida descarga una instantánea completa. Ante un error conserva la copia incluida o guardada. El servidor revisa la fuente cada 12 horas; Actualizar ahora consulta la última copia publicada, sin disparar una extracción ni escrituras en Firestore por cada usuario. Los contadores de popularidad quedan en el teléfono para evitar consumo de Firestore por búsquedas y aperturas. Las versiones anteriores pueden seguir consumiendo su cuota hasta actualizarse.

En el primer arranque online se completa una preparación inicial: se descargan las fichas, las imágenes y la información necesaria para que las páginas de productos abran desde la copia local. La preparación puede tardar, pero se realiza una sola vez por versión de contenido. En las revisiones posteriores de 12 horas o al actualizar manualmente, se comparan los productos y se descargan únicamente los nuevos, eliminados o modificados, junto con sus imágenes nuevas.

Las consultas HTML complementarias en Vite local pasan por el proxy `/vaad-api`. En la web pública de GitHub Pages usan la Cloud Function `vaadProxy` de Firebase, porque `vaad.ar` no publica CORS; la función solo admite URLs de ese dominio. El respaldo de Supabase está pausado para esta app: no se hacen consultas a ese servicio, pero se conserva su referencia para una eventual reactivación. En Android/iOS, el código usa `CapacitorHttp` nativo; de esa forma el APK puede actualizarse sin depender de un proxy web. Las respuestas se reintentan hasta tres veces y se conserva la última copia válida si el teléfono está sin conexión.

La actualización de 12 horas en el cliente se ejecuta al iniciar o reanudar la app. `.github/workflows/catalog-alerts.yml` publica instantáneas y cambios estáticos y mantiene la base central mediante escrituras incrementales; no envía push. Los avisos se envían exclusivamente con `.github/workflows/manual-push.yml` (ejecución manual, título y texto; por defecto muestra una vista previa). El envío usa `FCM_SERVICE_ACCOUNT_JSON` y genera un `eventKey` que figura en el resultado de la ejecución.

Los avisos manuales aparecen en Alertas y no vencen por tiempo ni por cantidad. Android conserva el historial incluso con la app cerrada. Para retirar un aviso para todos, ejecutar `.github/workflows/revoke-manual-push.yml` con su `eventKey`, desde la versión publicada en `main`. El workflow actualiza `web/data/push-revocations.json`; la app consulta ese registro público al iniciar, reanudar y abrir Alertas. La retirada se conserva localmente para impedir que una entrega atrasada lo restaure. Sin conexión se mantiene la última lista conocida hasta la siguiente consulta. Esta función retira el contenido del panel de la app; no revoca un aviso que Android ya mostró en su bandeja. El botón Limpiar borra únicamente el historial del teléfono.

Para que la retirada funcione en producción deben publicarse tanto los workflows/registro en `main` como la nueva versión de la app. Las versiones anteriores no incorporan este control. Pruebas locales: `node --test tests/*.test.mjs`.

## Catálogo central en Firebase

El catálogo central autorizado se guarda en Firestore en `catalog_products`. La copia incluida en `web/data/catalog.json` se mantiene para que la aplicación abra rápido y pueda funcionar sin conexión; Firestore es la fuente central para altas, cambios y bajas autorizadas.

El workflow `.github/workflows/catalog-alerts.yml` mantiene el catálogo cada 12 horas; `.github/workflows/firebase-catalog.yml` conserva el camino manual protegido. El circuito del servidor es:

1. Consulta nuevamente la fuente oficial y prepara la copia autorizada del catálogo. El enriquecimiento de códigos de barras queda separado y pausado hasta una revisión específica; la sincronización no altera esos datos por accidente.
2. Solo conserva códigos GTIN/EAN/UPC con dígito verificador válido y coincidencia inequívoca de producto, marca y variante. Las coincidencias ambiguas quedan sin código.
3. Genera un plan de altas, cambios y bajas sin escribir todavía.
4. Publica el manifiesto, la copia completa y los cambios estáticos. Cada 12 horas aplica una actualización incremental de Firestore con la cuenta de servicio de GitHub; guarda también las fichas completas y el contenido complementario. No crea infraestructura ni activa facturación.
5. Una ejecución manual sigue esperando la aprobación del entorno protegido `catalog-production`; este camino queda reservado para una carga inicial (`seed`) o una intervención controlada.
6. Al actualizar Firestore, los productos dados de baja se archivan en `catalog_archive` y se eliminan de `catalog_products`, por lo que dejan de aparecer en el catálogo activo pero se conserva una trazabilidad mínima para poder auditar o restaurar.

El proxy web opcional de Firebase está en `functions/`, pero no está habilitado en el proyecto actual. Su despliegue requeriría facturación para Cloud Functions; no se activó y el catálogo se distribuye mediante archivos sin depender del proxy. Supabase permanece pausado únicamente en el código de esta app; no se modificó el proyecto remoto.

Para habilitar la primera carga hay que crear en GitHub el entorno protegido `catalog-production`, agregar al menos un revisor requerido y guardar los secretos `FIREBASE_SERVICE_ACCOUNT_JSON` y `FCM_SERVICE_ACCOUNT_JSON` donde corresponda. Esas cuentas deben tener únicamente permisos de servidor; no se deben poner en la aplicación ni en el repositorio. La primera ejecución manual usa `seed` y requiere aprobación. Luego, la actualización incremental se ejecuta cada 12 horas sin quedar detenida esperando una aprobación; una ejecución manual continúa protegida. El push real requiere instalar una APK/AAB nativa, aceptar el permiso de notificaciones y activar los avisos desde la app.

- Web: `web/`
- App Android Capacitor: `android/`
- App iOS Capacitor: `ios/`
- Wrapper Android original de referencia: `app/`
- Configuración multiplataforma: `capacitor.config.json`
- Paquete: `ar.vaad.catalogo.app`
- Versión Android publicada en prueba interna: `1.0.26` (`versionCode` 80), confirmada el 2 de octubre de 2026. La pausa del respaldo Supabase se incorporó al código después de esa compilación y queda para la siguiente.
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
- Versión actual en el código fuente: `1.0.26`
- `versionCode` local: `80`, ya publicado en prueba interna. Cada nuevo AAB requiere un código mayor. Confirmar las pruebas físicas y las pistas actuales antes de promoverlo.
- `minSdkVersion`: `26`
- `targetSdkVersion` y `compileSdkVersion`: `36`

### Estado de Play Console

La ficha correcta es `Iahadut HaTora` con paquete `ar.vaad.catalogo.app`. El 22 de septiembre de 2026, Play Console confirmó la versión `1.0.11` (`versionCode` 63) activa en la pista cerrada “Prueba personal S22” y la versión `1.0.9` en prueba interna. Luego se publicaron `1.0.12` (`versionCode` 64), `1.0.13` (`versionCode` 65), `1.0.14` (`versionCode` 66), `1.0.15` (`versionCode` 67), `1.0.16` (`versionCode` 68), `1.0.17` (`versionCode` 69), `1.0.18` (`versionCode` 70), `1.0.19` (`versionCode` 71), `1.0.20` (`versionCode` 72), `1.0.21` (`versionCode` 73) y, el 23 de septiembre de 2026, `1.0.22` (`versionCode` 74) en la pista de prueba interna. La versión `1.0.22` baja el inicio del difuminado inferior de Inicio para que quede más próximo a la navegación sin ocultar el último contenido. La pista cerrada permanece en `1.0.11`.

El estado de verificadores, días consecutivos y disponibilidad de producción debe comprobarse directamente en Play Console antes de tomar decisiones de lanzamiento. La última cifra anotada anteriormente (12 verificadores y 2 días, el 8 de septiembre de 2026) es histórica y no debe tratarse como estado actual.

La configuración local de firma está en `android/keystore.properties`; confirmar que su certificado corresponde a la upload key registrada en Play Console. No compararlo con la app signing key que Google usa para firmar los APK finales.

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
