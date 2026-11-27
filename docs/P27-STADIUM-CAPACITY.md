# P27 — Capacité des stades

## Règle de jeu

La capacité d'accueil du stade est une statistique distincte de la capacité de l'effectif du club.

- Capacité de base : **5 000 places**.
- Chaque niveau d'extension ajoute **2 500 places**.
- Niveau 1 : 7 500 places.
- Niveau 2 : 10 000 places.
- Niveau 3 : 12 500 places.
- Niveau 4 : 15 000 places.

Les niveaux doivent être achetés dans l'ordre. Les extensions sont des actifs permanents du club et ne sont pas revendables.

## Source de vérité

Les niveaux possédés sont calculés depuis l'inventaire du club conservé côté serveur. La capacité est ensuite recalculée avec `getP27StadiumCapacity`; une valeur fournie par le client ou par un snapshot non fiable n'est jamais acceptée comme autorité.

Le snapshot public de match transmet uniquement les identifiants des cosmétiques équipés, le niveau d'extension et la capacité recalculée. Il n'expose ni trésorerie, ni prix d'achat, ni historique, ni inventaire privé.

## Périmètre

La capacité du stade n'augmente jamais la limite de l'effectif. La limite actuelle de 12 joueurs du club reste indépendante. Les quatre niveaux d'extension ajoutent également leurs tribunes visuelles au stade du match.

La capacité numérique est maintenant visible dans la boutique du club et les gains de chaque niveau sont affichés dans le catalogue.
