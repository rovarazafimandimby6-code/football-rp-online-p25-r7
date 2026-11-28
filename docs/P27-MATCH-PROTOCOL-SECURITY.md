# P27 — Sécurité du protocole de match

## Règle de validation

Le protocole WebSocket version 1 applique une liste blanche de champs à chaque enveloppe entrante et sortante. Un champ non déclaré entraîne le rejet du message ; il n'est jamais ignoré silencieusement.

### Messages client

| Type | Champs autorisés |
|---|---|
| `hello` | `roomId`, `token`, `afterSequence`, `afterEventId` |
| `input` | `sequence`, `x`, `z`, `sprint`, `action`, `callForPass` |
| `heartbeat` | `lastSequence` |
| `leave` | Aucun |

### Messages serveur

| Type | Champs autorisés |
|---|---|
| `welcome` | `playerId`, `nextSequence` |
| `snapshot` | `state` |
| `delta` | `eventCursor`, `events`, `state` facultatif |
| `ack` | `sequence` |
| `error` | `code`, `fatal` facultatif |

## Protections complémentaires

- Taille maximale d'un message : 16 Kio.
- Identifiant de salon : 12 caractères hexadécimaux minuscules.
- Séquences : entiers sûrs et strictement contrôlés par le gestionnaire de salon.
- Déplacements : axes bornés à [-1, 1].
- Actions : `shoot`, `pass`, `tackle` ou `null`.
- Jeton : jamais inclus dans les snapshots ou deltas serveur.

## Limite d'activation

Cette validation prépare le contrat partagé client/serveur. Elle ne constitue pas un endpoint WebSocket Cloudflare opérationnel. L'activation reste bloquée jusqu'à la livraison du Durable Object, à l'authentification du salon, à la reprise après éviction et aux tests multi-clients.
