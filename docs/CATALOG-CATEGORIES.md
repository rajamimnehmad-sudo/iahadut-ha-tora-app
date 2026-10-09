# Corregir categorías sin actualizar la app

Las apps compatibles leen `categoryPath` de cada producto en la copia central verificada. Ese dato tiene prioridad sobre la clasificación incluida en la app y queda guardado offline. No cambia `cat`: góndola, planta, especial y Uruguay conservan su significado.

Para revisar una corrección local:

```sh
node scripts/set-catalog-category.mjs --url 'https://vaad.ar/producto/URL-EXISTENTE/' --path '["Café"]'
```

Agregar `--apply` guarda la corrección por URL en `web/data/catalog-category-overrides.json` y en el catálogo local. El comando comprueba que exista el producto. No publica ni envía notificaciones.

Después generar la copia con `node scripts/publish-catalog-snapshot.mjs`, revisar el cambio y publicar los datos mediante el flujo del catálogo autorizado. Las importaciones posteriores conservan las correcciones: overrides manuales, categorías revisadas y clasificación automática, en ese orden. No es necesario compilar la app para cada corrección futura.

El mecanismo usa el manifiesto y los deltas existentes; no agrega consultas periódicas a Firebase. Con la app sin conexión se conserva la última categoría descargada hasta sincronizar. Datos inválidos no reemplazan una copia central válida.

Requiere instalar una vez la app que incorpora este mecanismo. La versión anterior y el AAB 107 ya enviado a prueba interna no lo incorporan. Esta preparación local no publica en tiendas ni en el catálogo remoto.
