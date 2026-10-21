# Aggiornamento delle gare stagionali

Il workflow `weekly-seasonal.yml` gira ogni giovedì alle **17:17 UTC** (19:17 con ora legale italiana, 18:17 con ora solare). GitHub può avviarlo con qualche ritardo. È disponibile anche `workflow_dispatch` per avviarlo manualmente.

Il recupero normale effettua due richieste: una alla tabella ufficiale Forza, una al CSV della scheda della stagione corrente di LogikJ. Catalogo, fotografie e prestazioni originali vengono letti dall'archivio locale. Non usa KV e non aggiunge richieste alle fonti durante le visite.

Una settimana già completa costa zero richieste alle fonti e non genera commit. Se mancano assetti, il venerdì alle 17:17 UTC viene effettuato un solo recupero aggiuntivo del CSV; i requisiti ufficiali sono già salvati. Dopo due tentativi non prosegue a interrogare le fonti. I codici assenti restano indicati come non disponibili. Una fonte ufficiale in errore o dal formato sconosciuto non sostituisce l'archivio precedente.

La rotazione viene calcolata dal cambio verificato del 15 ottobre 2026 alle 14:30 UTC (serie 6, autunno), ogni sette giorni; il selettore cerca la serie e stagione esatte nella tabella, indipendentemente dall'intestazione promozionale. Se il gioco cambia calendario o formato della fonte occorre adattare il parser: non vengono inventati eventi per colmare il vuoto.

Le auto e i codici sono abbinati solo per identità univoca, nome esatto della gara, classe e requisito verificabile. Le restrizioni non riconosciute vengono pubblicate come requisiti ufficiali senza una raccomandazione non verificata. Il primo assetto è la prima scelta pubblicata dal preparatore, non un primato cronometrico provato. I poligoni delle auto modificate non vengono stimati.

I dati validati vengono scritti in `public/data/eventi.json`; un commit attiva la pubblicazione Cloudflare già collegata al repository. `scripts/seasonal-state.json` registra la settimana acquisita e il numero di tentativi. Il sito indica periodo, data dell'ultimo controllo e scadenza. Il JSON richiede rivalidazione della cache e non viene salvato dal service worker.

Verifica offline: `node --test tests/seasonal-update.test.mjs tests/seasonal.test.mjs`.
