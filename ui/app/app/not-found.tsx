import { LinkButton } from "@/components/ui/button";
import { ERRORS } from "@/lib/copy";

export default function ProductNotFound() {
  return (
    <div className="cta-band">
      <h1 className="t-heading text-fg">This page does not exist.</h1>
      <LinkButton href="/app">{ERRORS.backToRequests}</LinkButton>
    </div>
  );
}
