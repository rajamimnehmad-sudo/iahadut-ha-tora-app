# 1.0.47 (105) — Sólo prueba interna

Estado: AAB compilado y auditado; envío a Google Play pendiente de confirmar.

- Base de código: `636fa258e09a8c33533f7662f5e8c67d06c1e7bd` (104).
- SHA-256 AAB: `eeba9265ee7d2417790f339448c6a6725ad9660f8aaf0cd2d64ef7a6ef801156`.
- Firma comprobada con jarsigner; upload key SHA-256 `DE:B7:BE:7E:57:98:88:79:F9:DD:93:83:46:27:85:9B:47:F6:19:C1:FE:1D:9E:CF:E2:35:01:D3:83:70:A6:93`, misma que 104. Advertencias esperables: certificado autofirmado, sin timestamp y orden de entradas ZIP/JarInputStream; verificación JarFile exit 0.
- Novedades visibles: «Correcciones y mejoras.»
- 133 pruebas JS, 5 pruebas del Worker y `gradlew test bundleRelease` aprobadas. Auditoría npm del Worker/tooling: 0 vulnerabilidades después de fijar sharp 0.35.5. No se usó audit fix --force.
- Bundletool oficial 1.18.3 valida el AAB real y confirma versionCode 105 / versionName 1.0.47. Los 26 logos están presentes. La comparación de entradas compilables contra 104 sólo difiere en cambios de este lote; no se incorporaron cambios iOS ajenos.

## Cambios

- WhatsApp identifica la app y el producto desde la ficha; no cambia grupos/canales ni envía mensajes automáticamente.
- Catálogo en el cliente cada 3 horas mientras visible y conectado, y al abrir/reanudar cuando vence el intervalo. Cron central `17 */3 * * *` ya confirmado en main: `8ecf93286e7f53047c2018f131a446329e1d309f`.
- Ranking compartido de selecciones desde el buscador, ventana de 28 días. Backend Cloudflare Workers + D1, sin Functions/Blaze. Flag versionado `live_search_ranking_v1_enabled` habilitado por defecto sólo en el código nuevo; no se publicó Remote Config ni se modificó el binario de producción.
- Cron del backend cada 15 minutos y consulta del cliente cada 15 minutos. No es tiempo real garantizado; ambos ciclos pueden sumar aproximadamente 30 minutos más demoras del proveedor. Conserva copia válida y copia inicial de Analytics mientras se acumulan datos.
- UID anónimo con hash diario; 1 selección/producto/UID/día, 50/UID/día, 5000 globales/día. No son personas únicas y las pruebas internas pueden contar.

## Backend verificado

- Cuenta `ramnehmad@gmail.com`, ID `cdd5f6099c511ee37e2e79e4bd7c8528`, plan Workers Free $0 comprobado en el panel. Separada de Waien/YGirls; no se activaron pagos.
- Worker `iahadut-search-ranking`; versión `49bfa139-7fef-4382-91e2-c247847b9060`; D1 `d93bd78b-8158-46e3-992a-a6cd2dd54184`.
- URL https://iahadut-search-ranking.iahadut-search-ranking.workers.dev/ranking
- HTTPS nuevo inicialmente falló durante provisión y luego respondió HTTP 200; no se desactivó validación TLS ni se esquivó un aviso de seguridad.
- Allowlist actual: 1110 productos verificados contra el manifiesto publicado, hash `bdb0890b6338905bc8f2e8c22121f01ec35e2baf15136b756cec7290a57f916e`.
- Prueba remota: ID token real de Firebase aceptado; producto inexistente no contado; firma inválida HTTP 401; recibos remotos 0. Cuenta anónima desechable de auditoría eliminada al terminar. No se inventaron aportes para poblar el ranking.
- Inserción y límites SQL atómicos, deduplicación, retirada, expiración 28 días y CORS/body limits comprobados con SQLite y tests. El cron está configurado/desplegado; primera ejecución automática aún no observada en esta auditoría.
- Límites Free documentados en `workers/search-ranking/README.md`; no prometer capacidad ilimitada para 10.000 usuarios. Las cuotas agotadas generan errores y se conserva el ranking anterior.

## Waien Hub

- Sesión del propietario comprobada en el navegador integrado.
- Referencia Firebase/Google corregida de texto tentativo a `ramnehmad@gmail.com`; se conserva la clave existente, sin revelarla ni copiarla.
- Cuenta agregada y comprobada una sola vez: `Cloudflare · Iahadut · Workers Free`, `ramnehmad@gmail.com`, sin clave/token privado.
- Falta registrar el servicio y enlaces técnicos: el acceso del Llavero `Waien Hub Codex API` fue rechazado (status 51). No se insistió ni se extrajo la sesión del navegador. Las integraciones Supabase conectadas no contienen el proyecto del Hub; no se modificó Yeshurún ni otro proyecto para suplirlo.

No se modificó producción, verificadores, envío de push, YGirls o facturación. El canal interno conserva sus verificadores actuales: no es una instalación dirigida por número de teléfono.
