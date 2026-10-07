# Ranking de Iahadut — cuenta separada, plan Free

Cuenta `ramnehmad@gmail.com`, ID `cdd5f6099c511ee37e2e79e4bd7c8528`. No comparte cuotas ni recursos con Waien/YGirls. No se habilitó Workers Paid ni Firebase Blaze.

Endpoint: https://iahadut-search-ranking.iahadut-search-ranking.workers.dev/ranking

- Cron `*/15 * * * *`: publica el agregado de los últimos 28 días, incluyendo hoy. El cliente visible/conectado consulta cada 15 minutos y al abrir el buscador si venció el intervalo. Son dos ciclos, no tiempo real garantizado: una selección puede aparecer tras hasta aproximadamente 30 minutos, más demoras del proveedor.
- Catálogo/allowlist revisado cada 3 horas contra el manifiesto publicado, con hash SHA-256 comprobado. Una copia inválida o inaccesible conserva la anterior; las bajas se excluyen del agregado al actualizarse la allowlist.
- `POST /record` exige ID token firmado de Firebase para `iahadut-hatora` (RS256, issuer, audience, expiración y timestamps). No tiene clave de servidor en la app. `GET /ranking` entrega sólo datos públicos agregados.
- Una selección por sesión anónima/producto/día. Identificador hash con sal de día, sin texto escrito, emails o IPs persistidos. Recibos y totales diarios eliminados después de 28 días.
- Inserción, deduplicación y contadores: una operación SQL atómica con trigger. Máximo 50 aportes por sesión/día y 5000 globales/día, más 30 peticiones/minuto/sesión por centro de datos. No identifica personas ni celulares; una reinstalación puede crear otro UID. Las pruebas internas también pueden aportar.
- Ante errores/cuota agotada: conservar ranking anterior; no inventar resultados. La copia inicial de Analytics permite arrancar mientras se acumulan selecciones reales.

Free limita Workers a 100.000 peticiones/día y D1 a 5.000.000 filas leídas/día, 100.000 escritas/día y 5 GB. Exceder la cuota causa errores, no activa automáticamente un plan de pago. Estos límites son de la cuenta; los topes de aportes no garantizan capacidad ilimitada ni protección contra toda forma de abuso. Con 10.000 usuarios depende de cuántos estén activos y cuántas consultas hagan: 96 consultas diarias por usuario superarían Workers Free. Sólo se consulta con el buscador visible y hay que vigilar el consumo si crece.

Documentación: [Workers](https://developers.cloudflare.com/workers/platform/limits/), [D1](https://developers.cloudflare.com/d1/platform/pricing/), [Firebase ID tokens](https://firebase.google.com/docs/auth/admin/verify-id-tokens).

## Operación

Usar siempre `XDG_CONFIG_HOME=/Users/yejielnehmad/.config/iahadut-cloudflare` en esta Mac; no sustituir la sesión de Waien. Secretos OAuth sólo en esa configuración, nunca en el repositorio o en fichas del Hub. Permisos mínimos autorizados: account/read, user/read, workers/write, workers_scripts/write, d1/write, offline_access. No ampliarlos por la advertencia genérica de Wrangler.

Instalar con `npm ci`, ejecutar `npm test`, aplicar migraciones con `wrangler d1 migrations apply iahadut-search-ranking --remote` y desplegar con `wrangler deploy`. `scripts/initialize.mjs` sólo inicializa el servicio nuevo; no usarlo para reiniciar un ranking activo. El override de sharp 0.35.5 elimina la vulnerabilidad de librsvg del tooling local; no forma parte del Worker desplegado.

Publicar la app requiere un envío separado, exclusivamente internal hasta nueva autorización. El backend no envía notificaciones ni publica Google Play.
