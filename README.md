# Iahadut HaTora

Proyecto fuente para continuar construyendo el buscador de productos kosher de Iahadut HaTora.

## Estado

La aplicación se desarrolla primero para Android, pero la interfaz y la lógica viven en `web/`. Android e iOS son contenedores Capacitor; por eso el paso posterior a iPhone no requiere reescribir la app.

La fuente web es compartida para Android, iOS y navegador mediante Capacitor. La configuración multiplataforma está en `package.json` y `capacitor.config.json`.

La sincronización consulta las categorías oficiales, descarga sus páginas, elimina duplicados por URL y guarda el catálogo en `localStorage`. Se intenta al iniciar, al volver la app a primer plano, cuando vuelve la conexión y se puede forzar tocando el estado de sincronización. También se revalidan cada 12 horas las páginas de información, las fichas de productos y las fichas de tiendas/catering.

En Vite, las consultas pasan por el proxy local `/vaad-api`. En Android/iOS, el código usa `CapacitorHttp` nativo porque `vaad.ar` no publica CORS; de esa forma el APK puede actualizarse sin depender de un proxy de desarrollo. Las respuestas se reintentan hasta tres veces y se conserva la última copia válida si el teléfono está sin conexión.

La actualización de 12 horas en el cliente se ejecuta al iniciar o reanudar la app y no puede ejecutarse mientras el teléfono está completamente cerrado. Para una garantía centralizada de frescura y monitoreo comercial todavía convendría agregar un backend o una tarea programada externa.

- Web: `web/`
- App Android Capacitor: `android/`
- App iOS Capacitor: `ios/`
- Wrapper Android original de referencia: `app/`
- Configuración multiplataforma: `capacitor.config.json`
- Paquete: `ar.vaad.catalogo.app`
- Versión fuente: `0.10.0` (código 13)
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
PATH=/opt/homebrew/opt/node/bin:$PATH npm run cap:android:live
PATH=/opt/homebrew/opt/node/bin:$PATH npm run cap:ios:live
```

Para el trabajo diario en Android, usar `npm run build:sync` antes de abrir Android Studio. No se debe editar la carpeta `android/` para cambiar pantallas: los cambios de producto van en `web/` y luego se sincronizan a las dos plataformas. El directorio raíz `app/` es un wrapper Android anterior y no es el proyecto Capacitor canónico.

Android requiere Android Studio, Java y un dispositivo autorizado por ADB. iPhone requiere Xcode completo, CocoaPods y un dispositivo confiado por la Mac.

## Próximas mejoras

La siguiente etapa debería agregar un backend o una sincronización robusta del catálogo oficial, pruebas del lector de códigos y una base de datos local completa para uso offline.
