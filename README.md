# AR - Visitors — Odoo 19

## Installation et paramétrage

Copier ce dossier dans les addons et installer ou mettre à jour `ar_visitors`.
Dépendances Odoo : base, mail, hr, survey et web. Aucune bibliothèque faciale à installer.

- Attribuer les rôles Accueil / Responsable / Administrateur selon les utilisateurs.
- Configuration > Quiz par langue : associer un sondage français,
  anglais et espagnol, chacun rédigé dans sa langue. Le choix de langue ouvre directement le quiz.
  Configurer de vraies questions et désactiver l’obligation de connexion au sondage
  pour que les visiteurs puissent répondre sans compte Odoo.
- Paramètres : durée de validité du quiz (3 mois), durée de session de la borne,
  mise à jour des fiches existantes. Les scores servent uniquement aux analyses.
- Renseigner les e-mails professionnels des employés et le serveur sortant Odoo.

## Tester maintenant, sans API

1. Visites > Toutes les visites > Nouveau.
2. Pour une nouvelle personne, saisir sa photo (facultative en test manuel), puis
   cliquer sur « Ouvrir le parcours visiteur » et compléter nom, prénom et CIN.
   Pour une personne connue, sélectionner sa fiche ou renseigner sa CIN.
3. Choisir FR / EN / ES dans la fenêtre. Le quiz s’ouvre dans une fenêtre intégrée.
4. Terminer le quiz, même avec un score nul : l’entrée s’enregistre et le parcours
   passe automatiquement au choix de la personne à visiter.
5. Confirmer l’hôte : sa notification est envoyée. Les erreurs d’envoi sont visibles
   sur la visite, avec un bouton de renvoi.
6. Dans la fiche de visite, cliquer sur « Marquer la sortie et signer ».
   La validation de la signature enregistre automatiquement la sortie.

Une personne connue ayant terminé son quiz il y a 3 mois ou moins passe directement
au choix de l’hôte. Une visite ne prolonge jamais la validité du quiz. Sans quiz ou
après expiration, le parcours linguistique est requis.

Une session borne expirée doit être rouverte depuis la fiche si la visite est encore
en cours de saisie ; une visite annulée nécessite une nouvelle visite.

## Stockage

Les personnes (nom, prénom, CIN, référence externe), quiz et visites sont enregistrés
dans la base Odoo. Les photos et signatures utilisent les pièces jointes Odoo et son
stockage configuré. Sauvegarder ensemble PostgreSQL et le filestore. Le dossier du
module ne contient pas les données des visiteurs. Les anciennes données ne sont
pas purgées par le nettoyage des fichiers sources.

## Vérification

Les tests métier sont dans `tests/` : parcours nouveaux/connus, expiration,
score nul, entrée, notification simulée, signature et adaptateur non connecté.
Exécuter sur une base isolée avec `--test-enable --test-tags /ar_visitors`.

Le nettoyage retire les scripts de démonstration, l’ancien générateur de guide,
le moteur facial local, son Dockerfile et ses dépendances. Les bibliothèques déjà
installées dans le serveur ne sont pas désinstallées par cette opération.

## Accès indépendants et résultats

Les quatre droits sont : Accès au module, Accès Configuration, Accès Résultats
 des quiz et Accès Personnes. Les trois droits spécialisés incluent uniquement
l’accès au module, sans s’inclure mutuellement. Leurs menus sont masqués sans le
droit correspondant et les modèles sont protégés côté serveur. L’accueil peut
continuer les visites par saisie de CIN sans consulter le répertoire Personnes.
Les paramètres visiteurs n’exigent pas l’administration générale d’Odoo.

Résultats des quiz : ouvrir une passation pour voir chaque question, la réponse
saisie ou choisie et les points. Les résultats sont en lecture seule et limités
aux sociétés autorisées. Les droits natifs de l’application Sondages, si attribués
séparément à un utilisateur, restent gérés par Odoo.


## Reconnaissance avec Face Recognition for HR Attendance

Dépendance : `sttl_face_attendance` (Face Recognition for HR Attendance).
Dans **Visites → Reconnaissance faciale**, un utilisateur ayant l'accès **Module**
peut activer la caméra. Le moteur face-api.js et les modèles
sont ceux du module installé ; les références proviennent des personnes AR Visitors,
avec leur photo principale et jusqu'à cinq photos secondaires.

Le navigateur recherche une correspondance avec une distance inférieure à 0,45.
Si deux personnes ont des distances trop proches (écart inférieur à 0,05), le parcours
demande une identification par CIN / passeport. Une seule personne doit être visible.
La comparaison n'est pas une détection de présence réelle (anti-photo).
La caméra nécessite HTTPS ou localhost et l'autorisation du navigateur.
La comparaison des références est effectuée à chaque recherche et peut être lente
pour un grand répertoire.

Après confirmation de l'identité reconnue, le visiteur passe au choix de langue ; une personne
inconnue passe d'abord par la saisie CIN / passeport. La photo capturée est conservée
sur la nouvelle visite. La règle de validité du quiz, la signature d'entrée et la
notification restent celles du parcours existant. La comparaison est une assistance
au poste d'accueil et ne constitue pas une preuve d'identité vérifiée côté serveur.

Cette intégration ne crée pas de pointage RH et utilise des méthodes Odoo authentifiées
et les droits de lecture des personnes.
