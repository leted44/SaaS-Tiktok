import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, Article, Row } from "@/components/legal/legal-page";
import { legal } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Mentions légales",
  description: `Éditeur, hébergeur et informations légales de ${legal.appName}.`,
};

/**
 * Required of every French website by the LCEN (loi pour la confiance dans
 * l'économie numérique) — the publisher and the host must both be named.
 */
export default function LegalNoticePage() {
  const todo = (label: string) => <span className="text-amber-300">[{label} à renseigner]</span>;
  return (
    <LegalPage title="Mentions légales">
      <Article title="Éditeur du site">
        <div>
          <Row label="Éditeur">{legal.publisher || todo("nom de l'éditeur")}</Row>
          <Row label="Forme juridique">{legal.legalForm}</Row>
          <Row label="SIRET">{legal.siret || todo("SIRET")}</Row>
          <Row label="Adresse">{legal.address || todo("adresse")}</Row>
          <Row label="Contact">{legal.contactEmail || todo("e-mail")}</Row>
          <Row label="TVA intracommunautaire">{legal.vatNumber || "Non applicable — TVA non applicable, article 293 B du Code général des impôts"}</Row>
          <Row label="Directeur de la publication">{legal.publisher || todo("nom de l'éditeur")}</Row>
        </div>
      </Article>

      <Article title="Hébergeur">
        <div>
          <Row label="Hébergeur">{legal.host.name}</Row>
          <Row label="Adresse">{legal.host.address}</Row>
          <Row label="Site">
            <a href={legal.host.url} target="_blank" rel="noreferrer" className="text-brand-300 underline underline-offset-2">{legal.host.url.replace("https://", "")}</a>
          </Row>
        </div>
        <p className="pt-2">Les données de l&apos;application (comptes, projets, fichiers importés) sont stockées sur l&apos;infrastructure Supabase, hébergée dans l&apos;Union européenne.</p>
      </Article>

      <Article title="Propriété intellectuelle">
        <p>La structure du site, son interface, ses textes et ses éléments graphiques sont protégés par le droit d&apos;auteur. Toute reproduction sans autorisation est interdite.</p>
        <p>Les contenus créés par les utilisateurs au moyen du service demeurent leur propriété exclusive, conformément à l&apos;article 5 des <Link href="/terms" className="text-brand-300 underline underline-offset-2">Conditions d&apos;utilisation</Link>.</p>
      </Article>

      <Article title="Signalement d'un contenu illicite">
        <p>Pour signaler un contenu que vous estimez illicite ou portant atteinte à vos droits, écrivez à {legal.contactEmail || todo("e-mail")} en précisant l&apos;URL concernée et le motif du signalement. Nous traitons ces demandes dans les meilleurs délais.</p>
      </Article>

      <Article title="Données personnelles">
        <p>Le traitement des données personnelles est décrit en détail dans la <Link href="/privacy" className="text-brand-300 underline underline-offset-2">Politique de confidentialité</Link>.</p>
      </Article>
    </LegalPage>
  );
}
