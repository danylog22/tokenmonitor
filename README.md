# Solana Token Monitor - Vercel

Version lista para Vercel con frontend estatico y una funcion serverless pequena para resolver CAs contra Dexscreener.

## Privacidad

Los tokens, paginas y preferencias se guardan en `localStorage` del navegador de cada visitante bajo la key:

```txt
solana-token-monitor-vercel-v1
```

No hay base de datos compartida. La funcion `/api/token` solo resuelve metadata/par desde Dexscreener y no guarda tokens de usuarios. Un usuario no puede ver lo que otro usuario guardo porque cada navegador conserva su propio cache local.

## Deploy

Sube esta carpeta a Vercel como proyecto estatico. El archivo principal es:

```txt
index.html
```

La app usa `/api/token?address=...` para evitar problemas de CORS desde Vercel al resolver pares, imagen, precio, liquidez y volumen.
