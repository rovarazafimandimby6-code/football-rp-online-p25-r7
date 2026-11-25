# P27 — déploiement du backend Render (préparation)

Le Blueprint `render.yaml` décrit un service Node.js dédié à P27. Il ne déploie rien tant que le propriétaire n'a pas connecté le dépôt à Render et lancé la création du service.

## Choix du service

- Branche GitHub à connecter : `p27-dev` (ne pas sélectionner `main`).
- Service Node.js : `football-rp-online-p27-api`.
- Commande : `npm start` (`node server/index.js`).
- Contrôle de vie : `/health`.
- Plan déclaré : `starter` (nom historique du plan web 0,5 CPU / 512 Mo RAM), avec un disque persistant de 1 Go monté sur `/var/data`.

**Budget indicatif vérifié le 25 novembre 2026 :** le calcul Render affiche environ 7 USD/mois pour le compute web 0,5 CPU / 512 Mo RAM, plus 0,25 USD/Go/mois pour le disque persistant. Pour le Blueprint actuel (1 Go), prévoir environ **7,25 USD/mois**, hors éventuel dépassement de bande passante, taxes et autres ressources. Les tarifs peuvent évoluer : le montant affiché dans le tableau de bord Render avant validation fait foi. Le service gratuit ne convient pas à ce déploiement : son système de fichiers est éphémère et ne conserve pas les données de carrière. Ne pas déployer en production sur un stockage éphémère.

## Étapes dans Render

1. Créer/ouvrir un compte Render et choisir **New → Blueprint**.
2. Connecter le dépôt GitHub `rovarazafimandimby6-code/football-rp-online-p25-r7`.
3. Sélectionner explicitement la branche `p27-dev` et le fichier `render.yaml`.
4. Lire le récapitulatif des services et le coût avant de confirmer. Ne pas sélectionner un service de production déjà existant par erreur. Ne pas confirmer si le budget mensuel n'est pas acceptable.
5. Après création, attendre le premier déploiement puis vérifier :
   - `https://<service>.onrender.com/health` → HTTP 200, `status: live`
   - `https://<service>.onrender.com/readyz` → HTTP 200, `status: ready`
6. Dans **Settings → Disks**, confirmer que le disque est réellement attaché et monté sur `/var/data`. Le Blueprint déclare ce disque, mais la persistance doit être vérifiée sur le service créé.
7. Vérifier les sauvegardes et tester un redémarrage contrôlé avant toute donnée réelle.

## Google OAuth — seulement après le backend prêt

Quand Render fournit l'URL HTTPS exacte, définir dans les variables du service :

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI=https://<service>.onrender.com/api/auth/google/callback`
- `P27_APP_ORIGIN=https://<service>.onrender.com`

Dans Google Cloud, ajouter exactement la même callback URI dans **Authorized redirect URIs**. Le Client Secret doit rester dans le tableau de bord Render ; ne pas le coller dans une conversation, un fichier versionné ou une capture.

Ce dépôt n'inscrit volontairement aucune valeur OAuth dans le Blueprint. OAuth reste désactivé tant que les trois variables ne sont pas configurées et le parcours de liaison testé.

## Limites à respecter

P27 utilise plusieurs stores JSON et un checkpoint de salons. Le disque Render est attaché à une seule instance : ne pas activer plusieurs instances ou autoscaling. Les déploiements peuvent interrompre brièvement le service. Ce Blueprint prépare un environnement de test hébergé ; il ne constitue pas une validation de production, de charge, de restauration ou de test Android.
