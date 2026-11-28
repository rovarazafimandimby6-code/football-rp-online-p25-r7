# P27 — contrat d'autorité du calendrier des saisons

Le calendrier D1 est une donnée **serveur**, jamais choisie par le client.

## Règles

- Les saisons sont créées en état `draft`, activées explicitement, puis fermées.
- Les périodes utilisent des timestamps Unix en millisecondes et l'intervalle semi-ouvert `[startsAt, endsAt)`.
- Les périodes de saisons ne peuvent pas se chevaucher, y compris lorsqu'une saison est encore en brouillon.
- Une seule saison peut être active. Une activation répétée de la même saison est idempotente.
- Une saison fermée ne peut pas être réactivée. Toute correction doit passer par une nouvelle définition/version administrée.
- La saison associée à un résultat doit être déterminée par le contexte officiel du match côté serveur, pas par l'heure envoyée par le mobile.
- Les routes de création/activation/fermeture doivent rester protégées par l'autorité administrative du Worker; ne pas exposer les méthodes de repository comme routes publiques d'écriture.

## Séquence d'intégration attendue

1. L'administration crée la saison et valide les dates.
2. Le serveur active la saison.
3. À la création d'un match officiel, le serveur fige `seasonId` dans le fixture/contexte de match.
4. Le résultat finalisé réutilise ce `seasonId` figé et s'inscrit de manière idempotente dans les statistiques de saison.
5. Les matchs amicaux et les challenges Club RP ne doivent pas alimenter les classements de championnat par simple ressemblance de format.

Le repository D1 et sa migration posent la base transactionnelle; ils ne signifient pas à eux seuls que l'API d'administration, l'attribution des matchs et la synchronisation complète des statistiques sont déjà terminées.
