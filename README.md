# Iahadut HaTora

Proyecto fuente para continuar construyendo el buscador de productos kosher de Iahadut HaTora.

## Estado

La aplicación se desarrolla primero para Android, pero la interfaz y la lógica viven en `web/`. Android e iOS son contenedores Capacitor; por eso el paso posterior a iPhone no requiere reescribir la app.

La fuente web es compartida para Android, iOS y navegador mediante Capacitor. La configuración multiplataforma está en `package.json` y `capacitor.config.json`.

La sincronización consulta las categorías oficiales, descarga sus páginas, elimina duplicados por URL y guarda el catálogo en `localStorage`. Se intenta al iniciar, al volver la app a primer plano, cuando vuelve la conexión y se puede forzar tocando el estado de sincronización. La app muestra primero la copia incluida o guardada y actualiza el contenido en segundo plano para que las secciones abran sin esperar.

En el primer arranque online se completa una preparación inicial: se descargan las fichas, las imágenes y la información necesaria para que las páginas de productos abran desde la copia local. La preparación puede tardar, pero se realiza una sola vez por versión de contenido. En las revisiones posteriores de 12 horas o al actualizar manualmente, se comparan los productos y se descargan únicamente los nuevos, eliminados o modificados, junto con sus imágenes nuevas.

En Vite local, las consultas pasan por el proxy `/vaad-api`. En la web pública de GitHub Pages usan la función proxy pública de Supabase, porque `vaad.ar` no publica CORS. En Android/iOS, el código usa `CapacitorHttp` nativo; de esa forma el APK puede actualizarse sin depender de un proxy web. Las respuestas se reintentan hasta tres veces y se conserva la última copia válida si el teléfono está sin conexión.

La actualización de 12 horas en el cliente se ejecuta al iniciar o reanudar la app y no puede ejecutarse mientras el teléfono está completamente cerrado. Para una garantía centralizada de frescura y monitoreo comercial todavía convendría agregar un backend o una tarea programada externa.

- Web: `web/`
- App Android Capacitor: `android/`
- App iOS Capacitor: `ios/`
- Wrapper Android original de referencia: `app/`
- Configuración multiplataforma: `capacitor.config.json`
- Paquete: `ar.vaad.catalogo.app`
- Versión fuente: `0.11.3` (código 18)
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
