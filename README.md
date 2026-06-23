# Solana Token Monitor - Vercel

Version estatica lista para Vercel.

## Privacidad

Los tokens, paginas y preferencias se guardan en `localStorage` del navegador de cada visitante bajo la key:

```txt
solana-token-monitor-vercel-v1
```

No hay base de datos compartida ni backend propio. Un usuario no puede ver lo que otro usuario guardo porque cada navegador conserva su propio cache local.

## Deploy

Sube esta carpeta a Vercel como proyecto estatico. El archivo principal es:

```txt
index.html
```

La app consulta Dexscreener directamente desde el navegador para resolver pares, imagen, precio, liquidez y volumen.
