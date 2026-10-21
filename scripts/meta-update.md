# Meta settimanale

La pagina `/meta` legge solo `/data/meta.json` e le immagini già archiviate. Non usa KV né contatta fonti esterne durante le visite.

`weekly-meta.yml` acquisisce due fonti ogni giovedì alle 17:37 UTC (19:37 in Italia con ora legale, 18:37 con ora solare): il catalogo pubblico FHStats e l'indice JSON delle note ufficiali FH6. L'indice contiene anche il testo delle patch, quindi non servono richieste per ogni articolo. L'esecuzione può essere ritardata da GitHub. Una settimana già acquisita viene saltata senza richieste. In caso di errore l'archivio precedente resta intatto e la pagina segnala la scadenza.

Il catalogo include solo livelli Meta+ e Meta, codici numerici di nove cifre, classi FH6 riconosciute e vetture associate univocamente al catalogo locale tramite ID di gioco o nome completo e anno. Le righe senza codice non vengono riempite con dati stimati. Foto e sei valori del poligono sono quelli di serie. I dati inseriti dal giocatore dopo l'assetto restano nel suo browser, associati a vettura e codice.

Il livello meta segue la valutazione della fonte, non viene calcolato dalle patch. Il parser riconosce modifiche meccaniche e nuove conversioni motore e confronta la data della patch con le date pubblicate dell'assetto. Le auto coinvolte prive di una revisione successiva vengono segnalate e ordinate dopo le altre, mantenendo visibile il livello attribuito dalla fonte. “Fonte aggiornata dopo la modifica” non significa che sia stata effettuata una nuova prova cronometrica.

I cambi di codice, le aggiunte, le uscite e le variazioni di livello vengono confrontati con la rilevazione precedente. Una variazione di livello non viene chiamata automaticamente buff o nerf. Le modifiche non riconosciute dal parser restano consultabili nel testo ufficiale: è un controllo conservativo, non un'interpretazione esaustiva di qualsiasi futura nota di rilascio.

Entrambi i workflow settimanali condividono il gruppo di concorrenza `weekly-content` per evitare scritture simultanee al repository. I test passano prima del commit e della pubblicazione Cloudflare. Per avviare un recupero fuori orario è disponibile `workflow_dispatch`; una settimana già acquisita resta protetta dal controllo di idempotenza.
