import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, Article, Row } from "@/components/legal/legal-page";
import { legal } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Politique de confidentialité",
  description: `Comment ${legal.appName} collecte, utilise et protège vos données personnelles.`,
};

const A = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a href={href} target="_blank" rel="noreferrer" className="text-brand-300 underline underline-offset-2 hover:text-brand-200">{children}</a>
);

export default function PrivacyPage() {
  const contact = legal.contactEmail || "[e-mail de contact à renseigner]";
  return (
    <LegalPage
      title="Politique de confidentialité"
      intro={`Cette page décrit précisément les données que ${legal.appName} collecte, pourquoi, avec qui elles sont partagées, et comment les supprimer. Elle est rédigée conformément au Règlement général sur la protection des données (RGPD).`}
    >
      <Article title="1. Responsable du traitement">
        <p>
          Le responsable du traitement est {legal.publisher || "[éditeur à renseigner]"}
          {legal.siret && ` (SIRET ${legal.siret})`}
          {legal.address && `, ${legal.address}`}. Pour toute question relative à vos données : <strong className="text-foreground">{contact}</strong>.
        </p>
      </Article>

      <Article title="2. Données que nous collectons">
        <p>Nous ne collectons que ce dont le service a besoin pour fonctionner. Aucune donnée n&apos;est vendue, louée ou cédée à des tiers à des fins publicitaires.</p>
        <div className="mt-4">
          <Row label="Compte">Adresse e-mail, nom affiché, photo de profil (si connexion Google), mot de passe stocké sous forme de empreinte chiffrée (jamais en clair).</Row>
          <Row label="Contenus créés">Projets, scripts générés ou modifiés, textes de sous-titres, réglages de marque (couleurs, polices).</Row>
          <Row label="Fichiers importés">Vidéos, images et musiques que vous téléversez, ainsi que leurs métadonnées techniques (format, durée, dimensions, taille).</Row>
          <Row label="Voix off">Les textes envoyés à la synthèse vocale et les fichiers audio produits.</Row>
          <Row label="Échantillon vocal (clonage)">Si, et seulement si, vous utilisez le clonage de voix : l&apos;enregistrement de votre voix. Cette fonctionnalité exige votre consentement explicite et préalable, recueilli dans l&apos;application avant tout envoi.</Row>
          <Row label="Comptes sociaux connectés">Identifiant, nom d&apos;utilisateur, photo de profil et jetons d&apos;accès des comptes TikTok, YouTube ou Instagram que vous reliez volontairement. Les jetons sont chiffrés au repos (AES-256-GCM).</Row>
          <Row label="Facturation">Identifiant client Stripe, forfait, statut d&apos;abonnement, historique des crédits. <strong className="text-foreground">Aucune donnée de carte bancaire ne transite par nos serveurs ni n&apos;y est stockée</strong> — le paiement est intégralement traité par Stripe.</Row>
          <Row label="Journaux techniques">Adresse IP, horodatage et erreurs serveur, conservés à des fins de sécurité et de diagnostic.</Row>
        </div>
      </Article>

      <Article title="3. Bases légales et finalités">
        <p>Chaque traitement repose sur une base légale précise au sens de l&apos;article 6 du RGPD :</p>
        <div className="mt-4">
          <Row label="Exécution du contrat">Création de compte, génération de scripts, voix off et vidéos, publication sur vos réseaux, facturation.</Row>
          <Row label="Consentement">Clonage de votre voix, connexion d&apos;un compte social. Révocable à tout moment, sans affecter le reste du service.</Row>
          <Row label="Intérêt légitime">Sécurité du service, prévention de la fraude et des abus, diagnostic technique.</Row>
          <Row label="Obligation légale">Conservation des pièces comptables liées aux paiements.</Row>
        </div>
      </Article>

      <Article title="4. Sous-traitants et destinataires">
        <p>Le service s&apos;appuie sur les prestataires suivants, chacun n&apos;accédant qu&apos;aux données nécessaires à sa fonction :</p>
        <div className="mt-4">
          <Row label="Vercel (hébergement)">Exécution de l&apos;application et journaux techniques.</Row>
          <Row label="Supabase (base de données, stockage)">Comptes, contenus créés et fichiers importés. Données hébergées dans l&apos;Union européenne.</Row>
          <Row label="Anthropic (Claude)">Les briefs et scripts envoyés à la génération de texte.</Row>
          <Row label="ElevenLabs">Les textes à vocaliser et, le cas échéant, votre échantillon vocal.</Row>
          <Row label="Amazon Web Services">Rendu des vidéos (Remotion Lambda).</Row>
          <Row label="Pexels, Pixabay">Uniquement les mots-clés de recherche de banque d&apos;images. Aucune donnée personnelle ne leur est transmise.</Row>
          <Row label="Stripe">Paiements et abonnements. Stripe agit comme responsable de traitement pour les données de paiement.</Row>
          <Row label="TikTok, Google/YouTube, Meta/Instagram">Uniquement lorsque vous connectez un compte et publiez : la vidéo, sa description et ses hashtags.</Row>
        </div>
        <p>Certains de ces prestataires sont établis hors de l&apos;Union européenne. Les transferts correspondants sont encadrés par les clauses contractuelles types de la Commission européenne ou un mécanisme d&apos;adéquation équivalent.</p>
      </Article>

      <Article title="5. Données issues des plateformes sociales">
        <p>Lorsque vous connectez un compte social, nous n&apos;accédons qu&apos;au strict nécessaire pour publier en votre nom. Nous ne lisons pas vos messages privés, ne suivons pas votre navigation et n&apos;utilisons jamais ces données à des fins publicitaires ou de revente.</p>
        <p><strong className="text-foreground">TikTok</strong> — nous accédons à votre nom d&apos;utilisateur et à votre photo de profil pour l&apos;affichage, et publions les vidéos que vous déclenchez explicitement depuis l&apos;application.</p>
        <p>
          <strong className="text-foreground">YouTube</strong> — {legal.appName} utilise les API Services de YouTube. En connectant votre compte, vous acceptez les <A href="https://www.youtube.com/t/terms">Conditions d&apos;utilisation de YouTube</A> et votre utilisation est également régie par la <A href="https://policies.google.com/privacy">Politique de confidentialité de Google</A>. Vous pouvez révoquer l&apos;accès de {legal.appName} à vos données à tout moment via la <A href="https://myaccount.google.com/permissions">page des autorisations de votre compte Google</A>. Les données reçues des API Google sont utilisées uniquement pour les fonctionnalités visibles dans l&apos;application et ne sont ni transférées à des tiers, ni utilisées pour de la publicité, conformément à la politique <em>Limited Use</em> de Google.
        </p>
        <p><strong className="text-foreground">Instagram</strong> — nous accédons au nom d&apos;utilisateur du compte professionnel ou créateur connecté et publions les Reels que vous déclenchez explicitement.</p>
        <p>Déconnecter un compte depuis l&apos;application supprime immédiatement et définitivement les jetons d&apos;accès correspondants de notre base.</p>
      </Article>

      <Article title="6. Durée de conservation">
        <div className="mt-2">
          <Row label="Compte et contenus">Tant que le compte est actif, puis supprimés sous 30 jours après la suppression du compte.</Row>
          <Row label="Échantillon vocal">Jusqu&apos;à suppression de la voix clonée depuis l&apos;application, ou suppression du compte.</Row>
          <Row label="Jetons de comptes sociaux">Jusqu&apos;à déconnexion du compte social ou suppression du compte.</Row>
          <Row label="Pièces comptables">Conservées 10 ans, conformément aux obligations légales françaises.</Row>
          <Row label="Journaux techniques">12 mois au maximum.</Row>
        </div>
      </Article>

      <Article title="7. Vos droits">
        <p>Vous disposez d&apos;un droit d&apos;accès, de rectification, d&apos;effacement, de limitation, d&apos;opposition et de portabilité de vos données, ainsi que du droit de retirer votre consentement à tout moment.</p>
        <p>Pour les exercer, écrivez à <strong className="text-foreground">{contact}</strong>. Nous répondons sous un mois au maximum.</p>
        <p>Vous pouvez également introduire une réclamation auprès de la <A href="https://www.cnil.fr">CNIL</A>, autorité de contrôle française.</p>
      </Article>

      <Article title="8. Suppression de vos données">
        <p>Deux moyens, au choix :</p>
        <p><strong className="text-foreground">Depuis l&apos;application</strong> — la page Paramètres permet de supprimer votre compte. La suppression est définitive et entraîne l&apos;effacement de vos projets, scripts, voix off, fichiers importés et jetons de comptes sociaux.</p>
        <p><strong className="text-foreground">Par e-mail</strong> — envoyez une demande à <strong className="text-foreground">{contact}</strong> depuis l&apos;adresse associée à votre compte. Nous procédons à la suppression et vous le confirmons sous 30 jours.</p>
      </Article>

      <Article title="9. Sécurité">
        <p>Les mots de passe sont stockés sous forme d&apos;empreinte cryptographique et jamais en clair. Les jetons d&apos;accès aux comptes sociaux sont chiffrés au repos avec l&apos;algorithme AES-256-GCM. Les échanges avec l&apos;application sont chiffrés en transit (HTTPS/TLS). L&apos;accès aux données de production est limité à l&apos;éditeur.</p>
      </Article>

      <Article title="10. Cookies">
        <p>{legal.appName} utilise uniquement des cookies strictement nécessaires au fonctionnement du service : maintien de votre session authentifiée et protection contre la falsification de requêtes. Aucun cookie publicitaire, aucun traceur tiers, aucun profilage — et donc aucune bannière de consentement requise.</p>
      </Article>

      <Article title="11. Mineurs">
        <p>Le service n&apos;est pas destiné aux personnes de moins de 15 ans. Nous ne collectons pas sciemment de données les concernant. Si vous constatez qu&apos;un tel compte existe, signalez-le à {contact} : il sera supprimé.</p>
      </Article>

      <Article title="12. Modifications">
        <p>Toute évolution substantielle de cette politique sera notifiée par e-mail aux utilisateurs actifs et la date de mise à jour en tête de page sera modifiée en conséquence.</p>
      </Article>

      <p className="border-t border-white/[0.06] pt-6 text-sm text-muted-foreground">
        Voir aussi les <Link href="/terms" className="text-brand-300 underline underline-offset-2">Conditions d&apos;utilisation</Link> et les <Link href="/legal" className="text-brand-300 underline underline-offset-2">Mentions légales</Link>.
      </p>
    </LegalPage>
  );
}
