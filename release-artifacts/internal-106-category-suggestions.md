# 1.0.48 (106) — Sólo prueba interna

Estado: AAB compilado y verificado; publicación pendiente de confirmación.

- Base 105: `0491aba321e9bc7a362ffdce025193c367126476`.
- Arreglo general de sugerencias: agrupar en el prefijo más corto que satisface todos los términos de categoría. «aceite» abre Aceites; «aceite oliva» conserva Aceites → Aceite de oliva. Lo mismo para Bebidas, Harinas y cualquier jerarquía. No se cambia la clasificación de los productos ni se fusiona Aceites en aerosol.
- Conteos deduplicados por URL y sugerencias de marcas/consultas combinadas conservadas. Pruebas de regresión generales, no excepción hardcodeada para aceites.
- 135 pruebas JS aprobadas; build web, sincronización exclusivamente Android y `gradlew test bundleRelease` aprobados.
- Bundletool 1.18.3 valida AAB. Firma jarsigner verificada; misma upload key SHA256 `DE:B7:BE:7E:57:98:88:79:F9:DD:93:83:46:27:85:9B:47:F6:19:C1:FE:1D:9E:CF:E2:35:01:D3:83:70:A6:93`. Advertencias de certificado autofirmado/timestamp/ZIP equivalentes a 105; JarFile exit 0.
- AAB SHA256 `527d847bd8c243349a3a290c3172823fc994aae2fb236ae697631fcd3d7bbe25`.
- Novedades: «Correcciones y mejoras.»
- Diferencias compilables frente a 105: versión de package/lock/Gradle y web/category-navigation.js. Dos archivos históricos de web/data/published ausentes localmente ya estaban fuera de la entrega anterior; no se tocan en el commit remoto.
- Commit remoto acotado a seis archivos; no main, producción, testers, Hub, Firebase ni backend. Conserva testers del canal interno; no se dirige por número de teléfono.
